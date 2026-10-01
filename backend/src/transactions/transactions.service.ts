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
import { brDecimal, toCsv } from './csv.js';
import { ExportTransactionsQueryDto, ImportResultDto, ImportTransactionsDto } from './dto/transaction-io.dto.js';
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

  /** Every transaction matching the filters as a Brazilian-Excel-friendly CSV. */
  async exportCsv(householdId: string, query: ExportTransactionsQueryDto): Promise<{ filename: string; content: string }> {
    const where = this.buildWhere(householdId, { ...query, page: 1, limit: 1, sortBy: 'date', order: 'asc' });
    const rows = await this.prisma.transaction.findMany({
      where,
      include: TX_INCLUDE,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 10_000,
    });
    const content = toCsv(
      ['Data', 'Descrição', 'Categoria', 'Tipo', 'Conta', 'Valor', 'Parcela', 'Observações', 'Registrado por'],
      rows.map((t) => {
        const signed = t.type === 'EXPENSE' ? `-${formatMoney(t.amount)}` : formatMoney(t.amount);
        return [
          { number: formatDateOnly(t.date).split('-').reverse().join('/') },
          { text: t.description },
          { text: t.category.name },
          { text: t.type === 'EXPENSE' ? 'Despesa' : 'Receita' },
          { text: t.account.name },
          { number: brDecimal(signed) },
          { text: t.installmentNumber ? `${t.installmentNumber}/${t.installmentTotal}` : '' },
          { text: t.notes ?? '' },
          { text: t.createdBy?.name ?? '' },
        ];
      }),
    );
    return { filename: `fintrack-transacoes-${formatDateOnly(new Date())}.csv`, content };
  }

  /**
   * Imports a bank statement already parsed by the client (CSV/OFX).
   * Valid rows are created, invalid ones are reported, duplicates skipped:
   * same bank id (externalId) or same date + amount + description in the account.
   */
  async importRows(householdId: string, dto: ImportTransactionsDto, createdById: string): Promise<ImportResultDto> {
    const account = await this.accounts.resolveForEntry(householdId, dto.accountId);
    const categories = await this.prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, type: true } });
    const byName = new Map(categories.map((c) => [`${c.type}:${c.name.trim().toLowerCase()}`, c.id]));
    const defaults: Record<TransactionType, string | undefined> = {
      EXPENSE: dto.defaultExpenseCategoryId,
      INCOME: dto.defaultIncomeCategoryId,
    };
    for (const [type, id] of Object.entries(defaults)) {
      if (id && !categories.some((c) => c.id === id && c.type === type)) {
        throw new BadRequestException(`Default ${type.toLowerCase()} category not found or of the wrong type`);
      }
    }

    const errors: ImportResultDto['errors'] = [];
    const candidates = dto.rows.flatMap((row, index) => {
      const type: TransactionType = row.type ?? (row.amount < 0 ? 'EXPENSE' : 'INCOME');
      const categoryId = (row.category && byName.get(`${type}:${row.category.trim().toLowerCase()}`)) || defaults[type];
      if (!categoryId) {
        errors.push({ row: index, message: `No category for ${type.toLowerCase()} "${row.category ?? ''}"` });
        return [];
      }
      return [{ row, type, categoryId, amount: toDecimal(Math.abs(row.amount)) }];
    });

    // Duplicate detection against what the account already has (and within the file).
    const externalIds = candidates.flatMap((c) => (c.row.externalId ? [c.row.externalId] : []));
    const dates = candidates.map((c) => c.row.date).sort();
    const [byExternal, sameDays] = await Promise.all([
      externalIds.length
        ? this.prisma.transaction.findMany({ where: { accountId: account.id, externalId: { in: externalIds } }, select: { externalId: true } })
        : Promise.resolve([]),
      dates.length
        ? this.prisma.transaction.findMany({
            where: { accountId: account.id, date: { gte: parseDateOnly(dates[0]), lte: parseDateOnly(dates.at(-1)!) } },
            select: { date: true, amount: true, description: true },
          })
        : Promise.resolve([]),
    ]);
    const seenExternal = new Set(byExternal.map((t) => t.externalId));
    const key = (date: string, amount: string, description: string) => `${date}|${amount}|${description.trim().toLowerCase()}`;
    const seenKeys = new Set(sameDays.map((t) => key(formatDateOnly(t.date), formatMoney(t.amount), t.description)));

    let skipped = 0;
    const toCreate = candidates.filter((c) => {
      const k = key(c.row.date, formatMoney(c.amount), c.row.description);
      const duplicate = (c.row.externalId && seenExternal.has(c.row.externalId)) || seenKeys.has(k);
      if (duplicate) {
        skipped += 1;
        return false;
      }
      seenKeys.add(k);
      if (c.row.externalId) seenExternal.add(c.row.externalId);
      return true;
    });

    const { count } = await this.prisma.transaction.createMany({
      data: toCreate.map((c) => ({
        householdId,
        createdById,
        accountId: account.id,
        categoryId: c.categoryId,
        type: c.type,
        amount: c.amount,
        description: c.row.description,
        notes: c.row.notes,
        date: parseDateOnly(c.row.date),
        externalId: c.row.externalId,
      })),
      // Backstop for a concurrent import of the same file (unique account + bank id).
      skipDuplicates: true,
    });
    return { created: count, skipped: skipped + (toCreate.length - count), errors };
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
