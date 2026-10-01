import { Decimal, formatMoney, percentage } from '../common/utils/money.js';

export const BUDGET_WARNING_THRESHOLD = 80;

export type BudgetStatus = 'ON_TRACK' | 'WARNING' | 'EXCEEDED';

export interface BudgetProgress {
  limit: string;
  spent: string;
  remaining: string;
  percentUsed: number;
  status: BudgetStatus;
}

/**
 * Pure calculation of how much of a budget has been consumed.
 * - ON_TRACK: below 80% of the limit
 * - WARNING:  between 80% and 100% (inclusive)
 * - EXCEEDED: above the limit
 * `remaining` is never negative; overspending shows up in `percentUsed` > 100.
 */
export function computeBudgetProgress(limit: Decimal, spent: Decimal): BudgetProgress {
  const percentUsed = percentage(spent, limit);
  const remaining = Decimal.max(limit.minus(spent), 0);

  let status: BudgetStatus = 'ON_TRACK';
  if (spent.greaterThan(limit)) status = 'EXCEEDED';
  else if (percentUsed >= BUDGET_WARNING_THRESHOLD) status = 'WARNING';

  return {
    limit: formatMoney(limit),
    spent: formatMoney(spent),
    remaining: formatMoney(remaining),
    percentUsed,
    status,
  };
}
