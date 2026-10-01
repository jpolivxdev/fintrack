/** Parses "YYYY-MM-DD" into a Date at UTC midnight (matches Postgres DATE). */
export function parseDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** Formats a Date as "YYYY-MM-DD" (UTC). */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** [start, end) of a month in UTC — end is the first day of the next month. */
export function monthRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function currentYearMonth(now = new Date()): {
  year: number;
  month: number;
} {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Shifts a (year, month) pair by `delta` months. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
