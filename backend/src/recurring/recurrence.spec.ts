import { describe, expect, it } from 'vitest';
import { nextOccurrenceAfter, occurrence, occurrencesBetween } from './recurrence.js';

describe('occurrence', () => {
  it('monthly on the 31st clamps to month end without drifting', () => {
    const dates = [0, 1, 2, 3].map((n) => occurrence('2026-01-31', 'MONTHLY', n));
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('weekly adds 7 days across month and year boundaries', () => {
    expect([0, 1, 2].map((n) => occurrence('2026-12-24', 'WEEKLY', n))).toEqual([
      '2026-12-24',
      '2026-12-31',
      '2027-01-07',
    ]);
  });

  it('yearly on Feb 29 falls on Feb 28 in common years', () => {
    expect([0, 1, 4].map((n) => occurrence('2028-02-29', 'YEARLY', n))).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2032-02-29',
    ]);
  });
});

describe('occurrencesBetween', () => {
  const rule = { startDate: '2026-01-05', frequency: 'MONTHLY' as const };

  it('returns the occurrences inside the window', () => {
    expect(occurrencesBetween(rule, '2026-03-01', '2026-05-10')).toEqual(['2026-03-05', '2026-04-05', '2026-05-05']);
  });

  it('respects the end date', () => {
    expect(occurrencesBetween({ ...rule, endDate: '2026-02-20' }, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-05',
      '2026-02-05',
    ]);
  });

  it('caps the number of generated dates', () => {
    expect(occurrencesBetween({ startDate: '2000-01-01', frequency: 'WEEKLY' }, '2000-01-01', '2030-01-01', 10)).toHaveLength(10);
  });
});

describe('nextOccurrenceAfter', () => {
  it('finds the next date strictly after the given one', () => {
    expect(nextOccurrenceAfter({ startDate: '2026-01-05', frequency: 'MONTHLY' }, '2026-03-05')).toBe('2026-04-05');
  });

  it('returns null once the rule has ended', () => {
    expect(nextOccurrenceAfter({ startDate: '2026-01-05', frequency: 'MONTHLY', endDate: '2026-03-31' }, '2026-03-05')).toBeNull();
  });
});
