import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPrismaMock, PrismaMock } from '../../test/utils/prisma-mock.js';
import { Decimal } from '../common/utils/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BudgetsService } from './budgets.service.js';

const USER = 'user-1';
const food = { id: 'cat-food', name: 'Alimentação', type: 'EXPENSE', color: null, icon: null };

function dbBudget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b-1',
    userId: USER,
    categoryId: food.id,
    year: 2026,
    month: 10,
    monthlyLimit: new Decimal('1000.00'),
    category: food,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('BudgetsService', () => {
  let prisma: PrismaMock;
  let service: BudgetsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BudgetsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const dto = { categoryId: food.id, year: 2026, month: 10, monthlyLimit: 1000 };

    it('rejects income categories', async () => {
      prisma.category.findFirst.mockResolvedValue({ type: 'INCOME' });
      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects someone else's category", async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a second budget for the same category and month', async () => {
      prisma.category.findFirst.mockResolvedValue({ type: 'EXPENSE' });
      prisma.budget.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the budget and reports its progress', async () => {
      prisma.category.findFirst.mockResolvedValue({ type: 'EXPENSE' });
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue(dbBudget());
      prisma.transaction.groupBy.mockResolvedValue([
        { categoryId: food.id, _sum: { amount: new Decimal('850.00') } },
      ]);

      const result = await service.create(USER, dto);

      expect(result).toMatchObject({
        monthlyLimit: '1000.00',
        spent: '850.00',
        remaining: '150.00',
        percentUsed: 85,
        status: 'WARNING',
      });
      // Spending is computed only from the user's expenses in that month.
      expect(prisma.transaction.groupBy.mock.calls[0][0].where).toEqual({
        userId: USER,
        type: 'EXPENSE',
        categoryId: { in: [food.id] },
        date: {
          gte: new Date('2026-10-01T00:00:00Z'),
          lt: new Date('2026-11-01T00:00:00Z'),
        },
      });
    });
  });

  it('reports zero spending for categories without transactions', async () => {
    prisma.budget.findMany.mockResolvedValue([dbBudget()]);
    prisma.transaction.groupBy.mockResolvedValue([]);

    const [budget] = await service.findAllForMonth(USER, 2026, 10);

    expect(budget).toMatchObject({ spent: '0.00', remaining: '1000.00', status: 'ON_TRACK' });
  });

  describe('copyFromPreviousMonth', () => {
    it('copies last month and skips categories already budgeted', async () => {
      prisma.budget.findMany
        .mockResolvedValueOnce([
          { categoryId: 'cat-a', monthlyLimit: new Decimal('100') },
          { categoryId: 'cat-b', monthlyLimit: new Decimal('200') },
        ])
        .mockResolvedValueOnce([{ categoryId: 'cat-b' }]);

      const result = await service.copyFromPreviousMonth(USER, { year: 2026, month: 1 });

      expect(result).toEqual({ created: 1, skipped: 1 });
      // January copies from December of the previous year.
      expect(prisma.budget.findMany.mock.calls[0][0].where).toEqual({
        userId: USER,
        year: 2025,
        month: 12,
      });
      expect(prisma.budget.createMany.mock.calls[0][0].data).toEqual([
        { userId: USER, categoryId: 'cat-a', monthlyLimit: new Decimal('100'), year: 2026, month: 1 },
      ]);
    });
  });
});
