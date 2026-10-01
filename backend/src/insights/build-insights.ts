import { Decimal, formatMoney, percentage } from '../common/utils/money.js';

export type InsightSeverity = 'danger' | 'warning' | 'positive' | 'info';

export type InsightKind =
  | 'CATEGORY_SPIKE'
  | 'CATEGORY_DROP'
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_WARNING'
  | 'BUDGET_PACE'
  | 'SAVINGS_GOOD'
  | 'SPENT_MORE_THAN_EARNED'
  | 'BIGGEST_EXPENSE'
  | 'UPCOMING_BILLS'
  | 'GOAL_BEHIND'
  | 'GOAL_COMPLETED'
  | 'UNBUDGETED_SPENDING';

export interface Insight {
  /** Stable key (kind + subject), handy for dismissing on the client. */
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  /** Structured facts; the client turns them into a sentence in its language. */
  data: Record<string, string | number | null>;
}

interface CategoryRef {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface InsightInput {
  /** True while the month is still running (partial data). */
  isCurrentMonth: boolean;
  /** Fraction of the month already elapsed (1 for past months). */
  elapsedFraction: number;
  income: Decimal;
  expense: Decimal;
  /** Expenses per category this month and the average of the 3 previous months. */
  categories: Array<{ category: CategoryRef; current: Decimal; average: Decimal }>;
  budgets: Array<{ category: CategoryRef; limit: Decimal; spent: Decimal; status: 'ON_TRACK' | 'WARNING' | 'EXCEEDED' }>;
  biggestExpense: { description: string; amount: Decimal; date: string; categoryName: string } | null;
  upcomingBills: Array<{ amount: Decimal; type: 'INCOME' | 'EXPENSE' }>;
  goals: Array<{ id: string; name: string; status: string; monthlyNeeded: string | null; monthlyPace: string; percent: number }>;
}

const SPIKE_RATIO = 1.25;
const MIN_DIFF = new Decimal(50);
const SEVERITY_ORDER: InsightSeverity[] = ['danger', 'warning', 'positive', 'info'];

/** Rules that turn a month's numbers into a short list of things worth knowing. */
export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const money = (d: Decimal) => formatMoney(d);

  // 1. Categories far above (or, in closed months, below) their 3-month average.
  for (const { category, current, average } of input.categories) {
    if (average.isZero()) continue;
    const diff = current.minus(average);
    const changePercent = percentage(diff, average);
    const base = { categoryId: category.id, categoryName: category.name, color: category.color, icon: category.icon, current: money(current), average: money(average), changePercent };
    if (current.gte(average.mul(SPIKE_RATIO)) && diff.gte(MIN_DIFF)) {
      insights.push({ id: `CATEGORY_SPIKE:${category.id}`, kind: 'CATEGORY_SPIKE', severity: 'warning', data: base });
    } else if (!input.isCurrentMonth && current.lte(average.mul(2 - SPIKE_RATIO)) && diff.negated().gte(MIN_DIFF)) {
      // Only for finished months: early in a month everything looks "low".
      insights.push({ id: `CATEGORY_DROP:${category.id}`, kind: 'CATEGORY_DROP', severity: 'positive', data: base });
    }
  }

  // 2. Budgets: exceeded, in the warning zone, or heading over at the current pace.
  for (const b of input.budgets) {
    const data = { categoryId: b.category.id, categoryName: b.category.name, color: b.category.color, icon: b.category.icon, limit: money(b.limit), spent: money(b.spent), percentUsed: percentage(b.spent, b.limit) };
    if (b.status === 'EXCEEDED') {
      insights.push({ id: `BUDGET_EXCEEDED:${b.category.id}`, kind: 'BUDGET_EXCEEDED', severity: 'danger', data });
      continue;
    }
    if (input.isCurrentMonth && input.elapsedFraction > 0.1 && input.elapsedFraction < 1) {
      const projected = b.spent.div(input.elapsedFraction);
      if (projected.gt(b.limit)) {
        insights.push({
          id: `BUDGET_PACE:${b.category.id}`,
          kind: 'BUDGET_PACE',
          severity: 'warning',
          data: { ...data, projected: money(projected.toDecimalPlaces(2)) },
        });
        continue;
      }
    }
    if (b.status === 'WARNING') {
      insights.push({ id: `BUDGET_WARNING:${b.category.id}`, kind: 'BUDGET_WARNING', severity: 'warning', data });
    }
  }

  // 3. Savings: spending more than earning is the most important line of all.
  if (!input.income.isZero() || !input.expense.isZero()) {
    if (input.expense.gt(input.income) && !input.income.isZero()) {
      insights.push({
        id: 'SPENT_MORE_THAN_EARNED',
        kind: 'SPENT_MORE_THAN_EARNED',
        severity: 'danger',
        data: { income: money(input.income), expense: money(input.expense), difference: money(input.expense.minus(input.income)) },
      });
    } else if (!input.income.isZero()) {
      const rate = percentage(input.income.minus(input.expense), input.income);
      if (rate >= 20 && !input.isCurrentMonth) {
        insights.push({ id: 'SAVINGS_GOOD', kind: 'SAVINGS_GOOD', severity: 'positive', data: { savingsRate: rate, saved: money(input.income.minus(input.expense)) } });
      }
    }
  }

  // 4. The single biggest expense.
  if (input.biggestExpense) {
    const e = input.biggestExpense;
    insights.push({
      id: 'BIGGEST_EXPENSE',
      kind: 'BIGGEST_EXPENSE',
      severity: 'info',
      data: { description: e.description, amount: money(e.amount), date: e.date, categoryName: e.categoryName, shareOfExpenses: percentage(e.amount, input.expense) },
    });
  }

  // 5. Bills due in the next 7 days (current month only).
  const bills = input.upcomingBills.filter((b) => b.type === 'EXPENSE');
  if (input.isCurrentMonth && bills.length > 0) {
    const total = bills.reduce((acc, b) => acc.plus(b.amount), new Decimal(0));
    insights.push({ id: 'UPCOMING_BILLS', kind: 'UPCOMING_BILLS', severity: 'info', data: { count: bills.length, total: money(total) } });
  }

  // 6. Goals.
  for (const g of input.goals) {
    if (g.status === 'BEHIND' || g.status === 'OVERDUE') {
      insights.push({ id: `GOAL_BEHIND:${g.id}`, kind: 'GOAL_BEHIND', severity: 'warning', data: { goalId: g.id, goalName: g.name, monthlyNeeded: g.monthlyNeeded, monthlyPace: g.monthlyPace, overdue: g.status === 'OVERDUE' ? 1 : 0 } });
    } else if (g.status === 'COMPLETED') {
      insights.push({ id: `GOAL_COMPLETED:${g.id}`, kind: 'GOAL_COMPLETED', severity: 'positive', data: { goalId: g.id, goalName: g.name } });
    }
  }

  // 7. A large share of spending happens outside any budget.
  if (input.budgets.length > 0 && input.expense.gt(0)) {
    const budgeted = input.budgets.reduce((acc, b) => acc.plus(b.spent), new Decimal(0));
    const outside = input.expense.minus(budgeted);
    const share = percentage(outside, input.expense);
    if (share >= 30) {
      insights.push({ id: 'UNBUDGETED_SPENDING', kind: 'UNBUDGETED_SPENDING', severity: 'info', data: { amount: money(outside), shareOfExpenses: share } });
    }
  }

  return insights.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}
