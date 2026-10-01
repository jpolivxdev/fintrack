import { Decimal, formatMoney, percentage } from '../common/utils/money.js';

export type GoalStatus = 'COMPLETED' | 'ON_TRACK' | 'BEHIND' | 'OVERDUE' | 'NO_DEADLINE';

export interface GoalProgressInput {
  target: Decimal;
  /** YYYY-MM-DD or null */
  targetDate: string | null;
  contributions: Array<{ amount: Decimal; date: string }>;
  /** YYYY-MM-DD */
  today: string;
}

export interface GoalProgress {
  saved: string;
  remaining: string;
  percent: number;
  /** Per month to reach the target by the date (null without a date or when done). */
  monthlyNeeded: string | null;
  /** Average net contribution per month over the last 90 days. */
  monthlyPace: string;
  /** When the current pace reaches the target (null if done or no pace). */
  projectedDate: string | null;
  status: GoalStatus;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 86_400_000;

/** Whole months from `from` to `to`, rounding partial months up (min 1). */
export function monthsUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td > fd) months += 1;
  return Math.max(1, months);
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/**
 * Where a goal stands and where it is heading:
 * - monthlyNeeded = remaining / months left until the target date;
 * - pace = net contributions of the last 90 days / 3;
 * - projection = today + remaining / pace (months, rounded up);
 * - status compares the projection with the target date.
 */
export function goalProgress({ target, targetDate, contributions, today }: GoalProgressInput): GoalProgress {
  const saved = contributions.reduce((acc, c) => acc.plus(c.amount), new Decimal(0));
  const remaining = Decimal.max(target.minus(saved), 0);
  const done = remaining.isZero();

  const windowStart = new Date(Date.parse(today) - 90 * DAY).toISOString().slice(0, 10);
  const recent = contributions
    .filter((c) => c.date > windowStart && c.date <= today)
    .reduce((acc, c) => acc.plus(c.amount), new Decimal(0));
  const pace = Decimal.max(recent.div(3), 0).toDecimalPlaces(2);

  const projectedDate =
    done || pace.isZero() ? null : addMonths(today, remaining.div(pace).ceil().toNumber());

  let monthlyNeeded: Decimal | null = null;
  let status: GoalStatus;
  if (done) {
    status = 'COMPLETED';
  } else if (!targetDate) {
    status = 'NO_DEADLINE';
  } else if (targetDate < today) {
    status = 'OVERDUE';
  } else {
    monthlyNeeded = remaining.div(monthsUntil(today, targetDate)).toDecimalPlaces(2, Decimal.ROUND_UP);
    status = projectedDate && projectedDate <= targetDate ? 'ON_TRACK' : 'BEHIND';
  }

  return {
    saved: formatMoney(saved),
    remaining: formatMoney(remaining),
    percent: Math.min(percentage(saved, target), 100),
    monthlyNeeded: monthlyNeeded ? formatMoney(monthlyNeeded) : null,
    monthlyPace: formatMoney(pace),
    projectedDate,
    status,
  };
}
