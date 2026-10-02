import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock, PrismaMock } from '../../test/utils/prisma-mock.js';
import { BudgetsService } from '../budgets/budgets.service.js';
import { Decimal } from '../common/utils/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoryReportQueryDto, MonthlyReportQueryDto } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

const USER = 'user-1';

const totals = (income: string, expense: string) => [
  { type: 'INCOME', _sum: { amount: new Decimal(income) } },
  { type: 'EXPENSE', _sum: { amount: new Decimal(expense) } },
];

describe('ReportsService', () => {
  let prisma: PrismaMock;
  let budgets: { findAllForMonth: ReturnType<typeof vi.fn> };
  let service: ReportsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    budgets = { findAllForMonth: vi.fn() };
    prisma.account.aggregate.mockResolvedValue({ _sum: { initialBalance: new Decimal('0') } });
    service = new ReportsService(
      prisma as unknown as PrismaService,
      budgets as unknown as BudgetsService,
    );
  });

  describe('summary', () => {
    // A fixed clock: October 2026 is a past month here, December the current one.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('compares the month with the previous one and computes the balance', async () => {
      prisma.transaction.groupBy
        .mockResolvedValueOnce(totals('6000', '4500')) // this month
        .mockResolvedValueOnce(totals('5000', '5000')) // previous month
        .mockResolvedValueOnce(totals('30000', '18000')); // all time
      prisma.transaction.count.mockResolvedValue(27);

      const result = await service.summary(USER, { year: 2026, month: 10 });

      expect(result).toEqual({
        year: 2026,
        month: 10,
        income: '6000.00',
        expense: '4500.00',
        net: '1500.00',
        balance: '12000.00',
        savingsRate: 25,
        transactionCount: 27,
        previousMonth: { income: '5000.00', expense: '5000.00', net: '0.00' },
        incomeChange: 20,
        expenseChange: -10,
        comparedThroughDay: null,
        toDate: null,
      });

      const [current, previous, allTime] = prisma.transaction.groupBy.mock.calls.map(
        (call) => call[0].where,
      );
      expect(current.date).toEqual({
        gte: new Date('2026-10-01T00:00:00Z'),
        lt: new Date('2026-11-01T00:00:00Z'),
      });
      expect(previous.date.gte).toEqual(new Date('2026-09-01T00:00:00Z'));
      expect(allTime.date).toEqual({ lt: new Date('2026-11-01T00:00:00Z') });
      expect([current, previous, allTime].every((w) => w.householdId === USER)).toBe(true);
    });

    it('in the current month, compares day 1..today of both months', async () => {
      prisma.transaction.groupBy
        .mockResolvedValueOnce(totals('6000', '4500')) // whole December (incl. future installments)
        .mockResolvedValueOnce(totals('5000', '2000')) // November 1..15
        .mockResolvedValueOnce(totals('5000', '1500')) // December 1..15
        .mockResolvedValueOnce(totals('30000', '18000')); // all time
      prisma.transaction.count.mockResolvedValue(10);

      const result = await service.summary(USER, { year: 2026, month: 12 });

      expect(result).toMatchObject({
        expense: '4500.00',
        comparedThroughDay: 15,
        previousMonth: { income: '5000.00', expense: '2000.00' },
        toDate: { income: '5000.00', expense: '1500.00', net: '3500.00' },
        incomeChange: 0,
        expenseChange: -25,
      });
      const [, previous, toDate] = prisma.transaction.groupBy.mock.calls.map((call) => call[0].where);
      expect(previous.date).toEqual({ gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-11-16T00:00:00Z') });
      expect(toDate.date).toEqual({ gte: new Date('2026-12-01T00:00:00Z'), lt: new Date('2026-12-16T00:00:00Z') });
    });

    it('handles a month with no data', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      const result = await service.summary(USER, { year: 2026, month: 1 });

      expect(result).toMatchObject({
        income: '0.00',
        expense: '0.00',
        savingsRate: null,
        incomeChange: null,
      });
    });
  });

  describe('monthly', () => {
    it('starts the running balance from everything before the range', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { period: '2026-09', type: 'INCOME', total: '1000' },
      ]);
      prisma.transaction.groupBy.mockResolvedValue(totals('500', '200'));

      const query = Object.assign(new MonthlyReportQueryDto(), { year: 2026, month: 10, months: 2 });
      const { months } = await service.monthly(USER, query);

      expect(months.map((m) => [m.period, m.balance])).toEqual([
        ['2026-09', '1300.00'],
        ['2026-10', '1300.00'],
      ]);
      expect(prisma.transaction.groupBy.mock.calls[0][0].where).toEqual({
        householdId: USER,
        date: { lt: new Date('2026-09-01T00:00:00Z') },
      });
    });
  });

  describe('byCategory', () => {
    it('sorts categories by total and computes their share', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        { categoryId: 'a', _sum: { amount: new Decimal('250') }, _count: { _all: 2 } },
        { categoryId: 'b', _sum: { amount: new Decimal('750') }, _count: { _all: 5 } },
      ]);
      prisma.category.findMany.mockResolvedValue([
        { id: 'a', name: 'Lazer', color: '#8b5cf6', icon: null },
        { id: 'b', name: 'Moradia', color: '#f97316', icon: 'home' },
      ]);

      const query = Object.assign(new CategoryReportQueryDto(), {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      const result = await service.byCategory(USER, query);

      expect(result.total).toBe('1000.00');
      expect(result.categories).toEqual([
        { categoryId: 'b', name: 'Moradia', color: '#f97316', icon: 'home', total: '750.00', count: 5, percentage: 75 },
        { categoryId: 'a', name: 'Lazer', color: '#8b5cf6', icon: null, total: '250.00', count: 2, percentage: 25 },
      ]);
      expect(prisma.transaction.groupBy.mock.calls[0][0].where.type).toBe('EXPENSE');
    });

    it('rejects an inverted range', async () => {
      const query = Object.assign(new CategoryReportQueryDto(), {
        startDate: '2026-10-31',
        endDate: '2026-10-01',
      });
      await expect(service.byCategory(USER, query)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('budgetVsActual', () => {
    it('sums budgets and isolates spending outside any budget', async () => {
      budgets.findAllForMonth.mockResolvedValue([
        { monthlyLimit: '1000.00', spent: '1200.00', status: 'EXCEEDED' },
        { monthlyLimit: '500.00', spent: '100.00', status: 'ON_TRACK' },
      ]);
      prisma.transaction.groupBy.mockResolvedValue([
        { type: 'EXPENSE', _sum: { amount: new Decimal('1700.00') } },
      ]);

      const result = await service.budgetVsActual(USER, { year: 2026, month: 10 });

      expect(result.totals).toEqual({
        limit: '1500.00',
        spent: '1300.00',
        remaining: '200.00',
        percentUsed: 86.67,
      });
      expect(result.unbudgetedSpent).toBe('400.00');
      expect(result.exceededCount).toBe(1);
    });
  });
});
