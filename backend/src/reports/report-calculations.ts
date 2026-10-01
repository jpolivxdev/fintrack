import { addMonths } from '../common/utils/date.js';
import { Decimal, formatMoney, toDecimal } from '../common/utils/money.js';
import type { TransactionType } from '../generated/prisma/client.js';

export interface MonthlyAggregateRow {
  /** "YYYY-MM" */
  period: string;
  type: TransactionType;
  total: Decimal | string | number;
}

export interface MonthlyPoint {
  period: string;
  year: number;
  month: number;
  income: string;
  expense: string;
  net: string;
  /** Accumulated balance at the end of the month (includes opening balance). */
  balance: string;
}

export const toPeriod = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

/**
 * Turns sparse SQL aggregates into a continuous monthly series: months with no
 * transactions appear as zeros, and the running balance starts from
 * `openingBalance` (everything before the first month).
 */
export function buildMonthlySeries(
  rows: MonthlyAggregateRow[],
  first: { year: number; month: number },
  count: number,
  openingBalance: Decimal,
): MonthlyPoint[] {
  const byPeriod = new Map<string, { income: Decimal; expense: Decimal }>();
  for (const row of rows) {
    const entry = byPeriod.get(row.period) ?? {
      income: new Decimal(0),
      expense: new Decimal(0),
    };
    const amount = toDecimal(row.total);
    if (row.type === 'INCOME') entry.income = entry.income.plus(amount);
    else entry.expense = entry.expense.plus(amount);
    byPeriod.set(row.period, entry);
  }

  let balance = openingBalance;
  return Array.from({ length: count }, (_, i) => {
    const { year, month } = addMonths(first.year, first.month, i);
    const period = toPeriod(year, month);
    const { income, expense } = byPeriod.get(period) ?? {
      income: new Decimal(0),
      expense: new Decimal(0),
    };
    const net = income.minus(expense);
    balance = balance.plus(net);
    return {
      period,
      year,
      month,
      income: formatMoney(income),
      expense: formatMoney(expense),
      net: formatMoney(net),
      balance: formatMoney(balance),
    };
  });
}

/**
 * Relative change in percent, rounded to 2 decimals.
 * `null` when there is no baseline (previous = 0): "+∞%" is not meaningful.
 */
export function percentChange(current: Decimal, previous: Decimal): number | null {
  if (previous.isZero()) return null;
  return current.minus(previous).div(previous.abs()).mul(100).toDecimalPlaces(2).toNumber();
}

/** Share of income that was not spent. Negative when spending exceeds income. */
export function savingsRate(income: Decimal, expense: Decimal): number | null {
  if (income.isZero()) return null;
  return income.minus(expense).div(income).mul(100).toDecimalPlaces(2).toNumber();
}
