import { BadRequestException, Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service.js';
import {
  addMonths,
  currentYearMonth,
  formatDateOnly,
  monthRange,
  parseDateOnly,
} from '../common/utils/date.js';
import { Decimal, formatMoney, percentage, toDecimal } from '../common/utils/money.js';
import type { Prisma, TransactionType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BudgetVsActualReportDto,
  CategoryReportDto,
  CategoryReportQueryDto,
  MonthlyReportDto,
  MonthlyReportQueryDto,
  MonthQueryDto,
  SummaryReportDto,
} from './dto/report.dto.js';
import {
  buildMonthlySeries,
  MonthlyAggregateRow,
  percentChange,
  savingsRate,
} from './report-calculations.js';

interface IncomeExpense {
  income: Decimal;
  expense: Decimal;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
  ) {}

  /** Headline numbers for a month, compared with the month before. */
  async summary(householdId: string, query: MonthQueryDto): Promise<SummaryReportDto> {
    const { year, month } = this.resolveMonth(query);
    const current = monthRange(year, month);
    const prev = addMonths(year, month, -1);
    const previous = monthRange(prev.year, prev.month);

    const [thisMonth, lastMonth, allTime, transactionCount, initial] = await Promise.all([
      this.totalsByType({ householdId, date: { gte: current.start, lt: current.end } }),
      this.totalsByType({ householdId, date: { gte: previous.start, lt: previous.end } }),
      this.totalsByType({ householdId, date: { lt: current.end } }),
      this.prisma.transaction.count({
        where: { householdId, date: { gte: current.start, lt: current.end } },
      }),
      this.initialBalances(householdId),
    ]);

    return {
      year,
      month,
      income: formatMoney(thisMonth.income),
      expense: formatMoney(thisMonth.expense),
      net: formatMoney(thisMonth.income.minus(thisMonth.expense)),
      balance: formatMoney(initial.plus(allTime.income).minus(allTime.expense)),
      savingsRate: savingsRate(thisMonth.income, thisMonth.expense),
      transactionCount,
      previousMonth: {
        income: formatMoney(lastMonth.income),
        expense: formatMoney(lastMonth.expense),
        net: formatMoney(lastMonth.income.minus(lastMonth.expense)),
      },
      incomeChange: percentChange(thisMonth.income, lastMonth.income),
      expenseChange: percentChange(thisMonth.expense, lastMonth.expense),
    };
  }

  /** Income, expense, net and running balance for the last N months. */
  async monthly(householdId: string, query: MonthlyReportQueryDto): Promise<MonthlyReportDto> {
    const last = this.resolveMonth(query);
    const first = addMonths(last.year, last.month, -(query.months - 1));
    const start = monthRange(first.year, first.month).start;
    const end = monthRange(last.year, last.month).end;

    // Grouping by month is not expressible with Prisma's groupBy, so this is
    // one parameterized SQL query (tagged template = no SQL injection).
    const [rows, opening, initial] = await Promise.all([
      this.prisma.$queryRaw<MonthlyAggregateRow[]>`
        SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS period,
               "type"::text AS type,
               SUM("amount") AS total
        FROM "transactions"
        WHERE "householdId" = ${householdId}::uuid
          AND "date" >= ${formatDateOnly(start)}::date
          AND "date" < ${formatDateOnly(end)}::date
        GROUP BY 1, 2
        ORDER BY 1`,
      this.totalsByType({ householdId, date: { lt: start } }),
      this.initialBalances(householdId),
    ]);

    return {
      months: buildMonthlySeries(
        rows,
        first,
        query.months,
        initial.plus(opening.income).minus(opening.expense),
      ),
    };
  }

  /** How a period's income or expenses split across categories. */
  async byCategory(householdId: string, query: CategoryReportQueryDto): Promise<CategoryReportDto> {
    const now = currentYearMonth();
    const defaultRange = monthRange(now.year, now.month);
    const startDate = query.startDate ?? formatDateOnly(defaultRange.start);
    const endDate =
      query.endDate ?? formatDateOnly(new Date(defaultRange.end.getTime() - 86_400_000));
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const groups = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        householdId,
        type: query.type,
        date: { gte: parseDateOnly(startDate), lte: parseDateOnly(endDate) },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const categories = await this.prisma.category.findMany({
      where: { householdId, id: { in: groups.map((g) => g.categoryId) } },
      select: { id: true, name: true, color: true, icon: true },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const total = groups.reduce((acc, g) => acc.plus(toDecimal(g._sum.amount)), new Decimal(0));

    const items = groups
      .map((g) => {
        const amount = toDecimal(g._sum.amount);
        const category = categoryById.get(g.categoryId);
        return {
          categoryId: g.categoryId,
          name: category?.name ?? 'Unknown',
          color: category?.color ?? null,
          icon: category?.icon ?? null,
          amount,
          count: g._count._all,
        };
      })
      .sort((a, b) => b.amount.comparedTo(a.amount))
      .map(({ amount, ...rest }) => ({
        ...rest,
        total: formatMoney(amount),
        percentage: percentage(amount, total),
      }));

    return { type: query.type, startDate, endDate, total: formatMoney(total), categories: items };
  }

  /** Every budget of the month against what was actually spent. */
  async budgetVsActual(householdId: string, query: MonthQueryDto): Promise<BudgetVsActualReportDto> {
    const { year, month } = this.resolveMonth(query);
    const { start, end } = monthRange(year, month);

    const [budgets, monthTotals] = await Promise.all([
      this.budgets.findAllForMonth(householdId, year, month),
      this.totalsByType({ householdId, type: 'EXPENSE', date: { gte: start, lt: end } }),
    ]);

    const limit = budgets.reduce((acc, b) => acc.plus(b.monthlyLimit), new Decimal(0));
    const spent = budgets.reduce((acc, b) => acc.plus(b.spent), new Decimal(0));

    return {
      year,
      month,
      budgets,
      totals: {
        limit: formatMoney(limit),
        spent: formatMoney(spent),
        remaining: formatMoney(Decimal.max(limit.minus(spent), 0)),
        percentUsed: percentage(spent, limit),
      },
      unbudgetedSpent: formatMoney(monthTotals.expense.minus(spent)),
      exceededCount: budgets.filter((b) => b.status === 'EXCEEDED').length,
    };
  }

  private resolveMonth(query: MonthQueryDto) {
    const now = currentYearMonth();
    return { year: query.year ?? now.year, month: query.month ?? now.month };
  }

  /** Transfers net to zero across the household; initial balances do not. */
  private async initialBalances(householdId: string): Promise<Decimal> {
    const { _sum } = await this.prisma.account.aggregate({
      where: { householdId },
      _sum: { initialBalance: true },
    });
    return toDecimal(_sum.initialBalance);
  }

  private async totalsByType(where: Prisma.TransactionWhereInput): Promise<IncomeExpense> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    });
    const sumOf = (type: TransactionType) =>
      toDecimal(groups.find((g) => g.type === type)?._sum.amount);
    return { income: sumOf('INCOME'), expense: sumOf('EXPENSE') };
  }
}
