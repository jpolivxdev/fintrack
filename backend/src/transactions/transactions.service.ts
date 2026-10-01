import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paginate, toSkipTake } from '../common/dto/pagination.dto.js';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { formatMoney, toDecimal } from '../common/utils/money.js';
import type {
  Category,
  Prisma,
  Transaction,
  TransactionType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  PaginatedTransactionsDto,
  TransactionResponseDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';

type TransactionWithCategory = Transaction & { category: Category };

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    await this.assertCategoryMatches(userId, dto.categoryId, dto.type);

    const transaction = await this.prisma.transaction.create({
      data: {
        description: dto.description,
        amount: toDecimal(dto.amount),
        type: dto.type,
        date: parseDateOnly(dto.date),
        notes: dto.notes,
        categoryId: dto.categoryId,
        userId,
      },
      include: { category: true },
    });
    return this.toResponse(transaction);
  }

  async findAll(
    userId: string,
    query: ListTransactionsQueryDto,
  ): Promise<PaginatedTransactionsDto> {
    const where = this.buildWhere(userId, query);
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [query.sortBy]: query.order },
      // Stable ordering when the main key ties (e.g. many rows on one date).
      { createdAt: 'desc' },
    ];

    const [items, total, totalsByType] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: { category: true },
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

  async findOne(userId: string, id: string): Promise<TransactionResponseDto> {
    return this.toResponse(await this.getOwned(userId, id));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const current = await this.getOwned(userId, id);

    // Re-validate the category/type pair whenever either side changes.
    const categoryId = dto.categoryId ?? current.categoryId;
    const type = dto.type ?? current.type;
    if (categoryId !== current.categoryId || type !== current.type) {
      await this.assertCategoryMatches(userId, categoryId, type);
    }

    const updated = await this.prisma.transaction.update({
      // Scoped by owner in the write itself too (defense in depth).
      where: { id, userId },
      data: {
        description: dto.description,
        amount: dto.amount !== undefined ? toDecimal(dto.amount) : undefined,
        type: dto.type,
        date: dto.date !== undefined ? parseDateOnly(dto.date) : undefined,
        notes: dto.notes,
        categoryId: dto.categoryId,
      },
      include: { category: true },
    });
    return this.toResponse(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.transaction.delete({ where: { id, userId } });
  }

  private buildWhere(
    userId: string,
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionWhereInput {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    return {
      userId,
      type: query.type,
      categoryId: query.categoryId,
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
    userId: string,
    categoryId: string,
    type: TransactionType,
  ): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { type: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== type) {
      throw new BadRequestException(
        `Transaction type ${type} does not match category type ${category.type}`,
      );
    }
  }

  private async getOwned(userId: string, id: string): Promise<TransactionWithCategory> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: true },
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
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
