import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paginate, toSkipTake } from '../common/dto/pagination.dto.js';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { formatMoney, toDecimal } from '../common/utils/money.js';
import type {
  Account,
  Category,
  Prisma,
  Transaction,
  TransactionType,
} from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { AccountsService } from '../accounts/accounts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildInstallments } from './installments.js';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  PaginatedTransactionsDto,
  TransactionResponseDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';

const TX_INCLUDE = {
  category: true,
  account: true,
  createdBy: { select: { id: true, name: true } },
} as const;

type TransactionWithCategory = Transaction & {
  category: Category;
  account: Account;
  createdBy: { id: string; name: string } | null;
};

export type RemoveScope = 'single' | 'future' | 'all';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async create(
    householdId: string,
    dto: CreateTransactionDto,
    createdById?: string,
  ): Promise<TransactionResponseDto> {
    await this.assertCategoryMatches(householdId, dto.categoryId, dto.type);
    const account = await this.accounts.resolveForEntry(householdId, dto.accountId);
    const base = {
      type: dto.type,
      notes: dto.notes,
      categoryId: dto.categoryId,
      accountId: account.id,
      householdId,
      createdById,
    };

    const count = dto.installments ?? 1;
    if (count > 1) {
      if (dto.type !== 'EXPENSE') {
        throw new BadRequestException('Only expenses can be split into installments');
      }
      // One transaction per month sharing a group id: "TV (1/10)", "TV (2/10)"...
      const groupId = randomUUID();
      const parts = buildInstallments(toDecimal(dto.amount), count, dto.date);
      await this.prisma.transaction.createMany({
        data: parts.map((p) => ({
          ...base,
          description: `${dto.description} (${p.number}/${p.total})`.slice(0, 120),
          amount: p.amount,
          date: parseDateOnly(p.date),
          installmentGroupId: groupId,
          installmentNumber: p.number,
          installmentTotal: p.total,
        })),
      });
      const first = await this.prisma.transaction.findFirstOrThrow({
        where: { installmentGroupId: groupId, installmentNumber: 1 },
        include: TX_INCLUDE,
      });
      return this.toResponse(first);
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        ...base,
        description: dto.description,
        amount: toDecimal(dto.amount),
        date: parseDateOnly(dto.date),
      },
      include: TX_INCLUDE,
    });
    return this.toResponse(transaction);
  }

  async findAll(
    householdId: string,
    query: ListTransactionsQueryDto,
  ): Promise<PaginatedTransactionsDto> {
    const where = this.buildWhere(householdId, query);
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [query.sortBy]: query.order },
      // Stable ordering when the main key ties (e.g. many rows on one date).
      { createdAt: 'desc' },
    ];

    const [items, total, totalsByType] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: TX_INCLUDE,
        orderBy,
        ...toSkipTake(query),
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
        orderBy: { type: 'asc' },
      }),
    ]);

    const sumOf = (type: TransactionType) =>
      toDecimal(totalsByType.find((t) => t.type === type)?._sum?.amount);
    const income = sumOf('INCOME');
    const expense = sumOf('EXPENSE');

    return {
      ...paginate(items.map((t) => this.toResponse(t)), total, query),
      totals: {
        income: formatMoney(income),
        expense: formatMoney(expense),
        net: formatMoney(income.minus(expense)),
      },
    };
  }

  async findOne(householdId: string, id: string): Promise<TransactionResponseDto> {
    return this.toResponse(await this.getOwned(householdId, id));
  }

  async update(
    householdId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const current = await this.getOwned(householdId, id);

    // Re-validate the category/type pair whenever either side changes.
    const categoryId = dto.categoryId ?? current.categoryId;
    const type = dto.type ?? current.type;
    if (categoryId !== current.categoryId || type !== current.type) {
      await this.assertCategoryMatches(householdId, categoryId, type);
    }
    if (dto.accountId && dto.accountId !== current.accountId) {
      await this.accounts.resolveForEntry(householdId, dto.accountId);
    }

    const updated = await this.prisma.transaction.update({
      // Scoped by owner in the write itself too (defense in depth).
      where: { id, householdId },
      data: {
        description: dto.description,
        amount: dto.amount !== undefined ? toDecimal(dto.amount) : undefined,
        type: dto.type,
        date: dto.date !== undefined ? parseDateOnly(dto.date) : undefined,
        notes: dto.notes,
        categoryId: dto.categoryId,
        accountId: dto.accountId,
      },
      include: TX_INCLUDE,
    });
    return this.toResponse(updated);
  }

  /**
   * Deletes one transaction or, for installment purchases, this and the
   * following installments (`future`) or the whole purchase (`all`).
   * Returns how many transactions were removed.
   */
  async remove(householdId: string, id: string, scope: RemoveScope = 'single'): Promise<number> {
    const tx = await this.getOwned(householdId, id);
    if (scope === 'single' || !tx.installmentGroupId) {
      await this.prisma.transaction.delete({ where: { id, householdId } });
      return 1;
    }
    const { count } = await this.prisma.transaction.deleteMany({
      where: {
        householdId,
        installmentGroupId: tx.installmentGroupId,
        installmentNumber: scope === 'future' ? { gte: tx.installmentNumber ?? 1 } : undefined,
      },
    });
    return count;
  }

  private buildWhere(
    householdId: string,
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionWhereInput {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    return {
      householdId,
      type: query.type,
      categoryId: query.categoryId,
      accountId: query.accountId,
      date:
        query.startDate || query.endDate
          ? {
              gte: query.startDate ? parseDateOnly(query.startDate) : undefined,
              lte: query.endDate ? parseDateOnly(query.endDate) : undefined,
            }
          : undefined,
      description: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
    };
  }

  /**
   * Business rules: the category must belong to the user (another user's
   * category is reported as not found) and must have the same type as the
   * transaction — an expense cannot be filed under "Salary".
   */
  private async assertCategoryMatches(
    householdId: string,
    categoryId: string,
    type: TransactionType,
  ): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, householdId },
      select: { type: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== type) {
      throw new BadRequestException(
        `Transaction type ${type} does not match category type ${category.type}`,
      );
    }
  }

  private async getOwned(householdId: string, id: string): Promise<TransactionWithCategory> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, householdId },
      include: TX_INCLUDE,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private toResponse(t: TransactionWithCategory): TransactionResponseDto {
    return {
      id: t.id,
      description: t.description,
      amount: formatMoney(t.amount),
      type: t.type,
      date: formatDateOnly(t.date),
      notes: t.notes,
      category: {
        id: t.category.id,
        name: t.category.name,
        type: t.category.type,
        color: t.category.color,
        icon: t.category.icon,
      },
      account: {
        id: t.account.id,
        name: t.account.name,
        type: t.account.type,
        color: t.account.color,
        icon: t.account.icon,
      },
      installment: t.installmentGroupId
        ? { groupId: t.installmentGroupId, number: t.installmentNumber!, total: t.installmentTotal! }
        : null,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
