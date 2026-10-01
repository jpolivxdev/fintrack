import type { RecurrenceFrequency } from '../generated/prisma/client.js';

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** YYYY-MM-DD -> [year, month (1-12), day] */
function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function format(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function lastDayOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The n-th occurrence (0-based) of a rule anchored on `start`.
 * Always computed from the anchor, never from the previous occurrence, so a
 * rule on the 31st goes 31/01, 28/02, 31/03 instead of drifting to the 28th.
 */
export function occurrence(start: string, frequency: RecurrenceFrequency, n: number): string {
  const [y, m, d] = parts(start);
  if (frequency === 'WEEKLY') {
    const t = Date.UTC(y, m - 1, d) + n * 7 * DAY_MS;
    return new Date(t).toISOString().slice(0, 10);
  }
  const monthsAhead = frequency === 'MONTHLY' ? n : n * 12;
  const target = new Date(Date.UTC(y, m - 1 + monthsAhead, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  return format(ty, tm, Math.min(d, lastDayOf(ty, tm)));
}

/**
 * Every occurrence in [from, to] (inclusive, YYYY-MM-DD strings compare
 * lexicographically), stopping at `endDate` and after `limit` items.
 */
export function occurrencesBetween(
  rule: { startDate: string; frequency: RecurrenceFrequency; endDate?: string | null },
  from: string,
  to: string,
  limit = 1000,
): string[] {
  const result: string[] = [];
  const last = rule.endDate && rule.endDate < to ? rule.endDate : to;
  for (let n = 0; result.length < limit; n++) {
    const date = occurrence(rule.startDate, rule.frequency, n);
    if (date > last) break;
    if (date >= from) result.push(date);
  }
  return result;
}

/** First occurrence strictly after `after`, or null when the rule has ended. */
export function nextOccurrenceAfter(
  rule: { startDate: string; frequency: RecurrenceFrequency; endDate?: string | null },
  after: string,
): string | null {
  for (let n = 0; n < 100_000; n++) {
    const date = occurrence(rule.startDate, rule.frequency, n);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > after) return date;
  }
  return null;
}
