import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  Paginated,
  toSkipTake,
} from '../common/dto/pagination.dto.js';
import { addMonths, currentYearMonth, monthRange } from '../common/utils/date.js';
import { Decimal, toDecimal } from '../common/utils/money.js';
import type { Budget, Category } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeBudgetProgress } from './budget-progress.js';
import {
  BudgetResponseDto,
  CopyBudgetsDto,
  CopyBudgetsResponseDto,
  CreateBudgetDto,
  ListBudgetsQueryDto,
  UpdateBudgetDto,
} from './dto/budget.dto.js';

type BudgetWithCategory = Budget & { category: Category };

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, userId },
      select: { type: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException('Budgets can only be set for EXPENSE categories');
    }

    const duplicate = await this.prisma.budget.findFirst({
      where: { userId, categoryId: dto.categoryId, year: dto.year, month: dto.month },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `This category already has a budget for ${dto.year}-${String(dto.month).padStart(2, '0')}`,
      );
    }

    const budget = await this.prisma.budget.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        year: dto.year,
        month: dto.month,
        monthlyLimit: toDecimal(dto.monthlyLimit),
      },
      include: { category: true },
    });
    const [response] = await this.withProgress(userId, [budget], dto.year, dto.month);
    return response;
  }

  async findAll(
    userId: string,
    query: ListBudgetsQueryDto,
  ): Promise<Paginated<BudgetResponseDto>> {
    const { year, month } = this.resolveMonth(query.year, query.month);
    const where = { userId, year, month };

    const [budgets, total] = await this.prisma.$transaction([
      this.prisma.budget.findMany({
        where,
        include: { category: true },
        orderBy: { category: { name: 'asc' } },
        ...toSkipTake(query),
      }),
      this.prisma.budget.count({ where }),
    ]);
    return paginate(await this.withProgress(userId, budgets, year, month), total, query);
  }

  /** Every budget of a month with its progress (used by the reports module). */
  async findAllForMonth(
    userId: string,
    year: number,
    month: number,
  ): Promise<BudgetResponseDto[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId, year, month },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    });
    return this.withProgress(userId, budgets, year, month);
  }

  async findOne(userId: string, id: string): Promise<BudgetResponseDto> {
    const budget = await this.getOwned(userId, id);
    const [response] = await this.withProgress(userId, [budget], budget.year, budget.month);
    return response;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateBudgetDto,
  ): Promise<BudgetResponseDto> {
    await this.getOwned(userId, id);
    const budget = await this.prisma.budget.update({
      where: { id },
      data: { monthlyLimit: toDecimal(dto.monthlyLimit) },
      include: { category: true },
    });
    const [response] = await this.withProgress(userId, [budget], budget.year, budget.month);
    return response;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.budget.delete({ where: { id } });
  }

  /**
   * Copies the previous month's budgets into the target month, skipping
   * categories that already have a budget there. Saves users from re-typing
   * the same limits every month.
   */
  async copyFromPreviousMonth(
    userId: string,
    dto: CopyBudgetsDto,
  ): Promise<CopyBudgetsResponseDto> {
    const previous = addMonths(dto.year, dto.month, -1);
    const [source, existing] = await Promise.all([
      this.prisma.budget.findMany({
        where: { userId, year: previous.year, month: previous.month },
        select: { categoryId: true, monthlyLimit: true },
      }),
      this.prisma.budget.findMany({
        where: { userId, year: dto.year, month: dto.month },
        select: { categoryId: true },
      }),
    ]);

    const taken = new Set(existing.map((b) => b.categoryId));
    const toCreate = source.filter((b) => !taken.has(b.categoryId));

    if (toCreate.length > 0) {
      await this.prisma.budget.createMany({
        data: toCreate.map((b) => ({
          userId,
          categoryId: b.categoryId,
          monthlyLimit: b.monthlyLimit,
          year: dto.year,
          month: dto.month,
        })),
        skipDuplicates: true,
      });
    }
    return { created: toCreate.length, skipped: source.length - toCreate.length };
  }

  private resolveMonth(year?: number, month?: number) {
    const now = currentYearMonth();
    return { year: year ?? now.year, month: month ?? now.month };
  }

  private async getOwned(userId: string, id: string): Promise<BudgetWithCategory> {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true },
    });
    if (!budget) throw new NotFoundException('Budget not found');
    return budget;
  }

  /** Attaches spent/remaining/status using a single aggregate query. */
  private async withProgress(
    userId: string,
    budgets: BudgetWithCategory[],
    year: number,
    month: number,
  ): Promise<BudgetResponseDto[]> {
    if (budgets.length === 0) return [];

    const { start, end } = monthRange(year, month);
    const sums = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { in: budgets.map((b) => b.categoryId) },
        date: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });
    const spentByCategory = new Map<string, Decimal>(
      sums.map((s) => [s.categoryId, toDecimal(s._sum.amount)]),
    );

    return budgets.map((budget) => {
      const progress = computeBudgetProgress(
        toDecimal(budget.monthlyLimit),
        spentByCategory.get(budget.categoryId) ?? new Decimal(0),
      );
      return {
        id: budget.id,
        year: budget.year,
        month: budget.month,
        category: {
          id: budget.category.id,
          name: budget.category.name,
          type: budget.category.type,
          color: budget.category.color,
          icon: budget.category.icon,
        },
        monthlyLimit: progress.limit,
        spent: progress.spent,
        remaining: progress.remaining,
        percentUsed: progress.percentUsed,
        status: progress.status,
      };
    });
  }
}
