import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service.js';
import { addMonths, currentYearMonth, formatDateOnly, monthRange } from '../common/utils/date.js';
import { Decimal, toDecimal } from '../common/utils/money.js';
import { GoalsService } from '../goals/goals.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecurringService } from '../recurring/recurring.service.js';
import { buildInsights, type Insight } from './build-insights.js';

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
    private readonly goals: GoalsService,
    private readonly recurring: RecurringService,
  ) {}

  async forMonth(householdId: string, year?: number, month?: number): Promise<{ year: number; month: number; insights: Insight[] }> {
    const now = currentYearMonth();
    const y = year ?? now.year;
    const m = month ?? now.month;
    const isCurrentMonth = y === now.year && m === now.month;
    const { start, end } = monthRange(y, m);
    const historyStart = monthRange(addMonths(y, m, -3).year, addMonths(y, m, -3).month).start;

    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const elapsedFraction = isCurrentMonth ? new Date().getUTCDate() / daysInMonth : 1;

    const [totals, currentByCategory, historyByCategory, budgets, biggest, upcoming, goals] = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['type'], where: { householdId, date: { gte: start, lt: end } }, _sum: { amount: true } }),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { householdId, type: 'EXPENSE', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { householdId, type: 'EXPENSE', date: { gte: historyStart, lt: start } },
        _sum: { amount: true },
      }),
      this.budgets.findAllForMonth(householdId, y, m),
      this.prisma.transaction.findFirst({
        where: { householdId, type: 'EXPENSE', date: { gte: start, lt: end } },
        orderBy: [{ amount: 'desc' }, { date: 'desc' }],
        include: { category: { select: { name: true } } },
      }),
      isCurrentMonth ? this.recurring.upcoming(householdId, 7) : Promise.resolve([]),
      this.goals.findAll(householdId),
    ]);

    const categoryIds = [...new Set([...currentByCategory, ...historyByCategory].map((g) => g.categoryId))];
    const categories = await this.prisma.category.findMany({
      where: { householdId, id: { in: categoryIds } },
      select: { id: true, name: true, color: true, icon: true },
    });
    const historyMap = new Map(historyByCategory.map((g) => [g.categoryId, toDecimal(g._sum.amount)]));
    const currentMap = new Map(currentByCategory.map((g) => [g.categoryId, toDecimal(g._sum.amount)]));
    const sumOf = (type: 'INCOME' | 'EXPENSE') => toDecimal(totals.find((t) => t.type === type)?._sum.amount);

    const insights = buildInsights({
      isCurrentMonth,
      elapsedFraction,
      income: sumOf('INCOME'),
      expense: sumOf('EXPENSE'),
      categories: categories.map((category) => ({
        category,
        current: currentMap.get(category.id) ?? new Decimal(0),
        average: (historyMap.get(category.id) ?? new Decimal(0)).div(3).toDecimalPlaces(2),
      })),
      budgets: budgets.map((b) => ({
        category: { id: b.category.id, name: b.category.name, color: b.category.color, icon: b.category.icon },
        limit: toDecimal(b.monthlyLimit),
        spent: toDecimal(b.spent),
        status: b.status,
      })),
      biggestExpense: biggest
        ? { description: biggest.description, amount: toDecimal(biggest.amount), date: formatDateOnly(biggest.date), categoryName: biggest.category.name }
        : null,
      // Scheduled contributions to investments are savings, not bills.
      upcomingBills: upcoming.filter((u) => !u.toAccount).map((u) => ({ amount: toDecimal(u.amount), type: u.type })),
      goals: goals.map((g) => ({ id: g.id, name: g.name, status: g.status, monthlyNeeded: g.monthlyNeeded, monthlyPace: g.monthlyPace, percent: g.percent })),
    });

    return { year: y, month: m, insights };
  }
}
