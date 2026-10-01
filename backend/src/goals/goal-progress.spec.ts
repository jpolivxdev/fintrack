import { describe, expect, it } from 'vitest';
import { Decimal } from '../common/utils/money.js';
import { goalProgress, monthsUntil } from './goal-progress.js';

const d = (v: string | number) => new Decimal(v);
const TODAY = '2026-10-01';

describe('monthsUntil', () => {
  it('counts partial months as a full month, minimum 1', () => {
    expect(monthsUntil('2026-10-01', '2027-04-01')).toBe(6);
    expect(monthsUntil('2026-10-01', '2027-04-15')).toBe(7);
    expect(monthsUntil('2026-10-01', '2026-10-20')).toBe(1);
  });
});

describe('goalProgress', () => {
  it('is on track when the recent pace reaches the target in time', () => {
    const result = goalProgress({
      target: d(12000),
      targetDate: '2027-07-01',
      today: TODAY,
      contributions: [
        { amount: d(3000), date: '2026-03-10' }, // outside the 90-day window
        { amount: d(600), date: '2026-08-05' },
        { amount: d(600), date: '2026-09-05' },
        { amount: d(600), date: '2026-09-30' },
      ],
    });
    expect(result).toEqual({
      saved: '4800.00',
      remaining: '7200.00',
      percent: 40,
      monthlyNeeded: '800.00', // 7200 / 9 months
      monthlyPace: '600.00', // 1800 in the last 90 days / 3
      projectedDate: '2027-10-01', // 7200 / 600 = 12 months
      status: 'BEHIND',
    });
  });

  it('flags ON_TRACK when the projection lands before the date', () => {
    const result = goalProgress({
      target: d(3000),
      targetDate: '2027-06-01',
      today: TODAY,
      contributions: [{ amount: d(1500), date: '2026-09-15' }],
    });
    expect(result.monthlyPace).toBe('500.00');
    expect(result.projectedDate).toBe('2027-01-01');
    expect(result.status).toBe('ON_TRACK');
  });

  it('withdrawals reduce the saved amount and the pace', () => {
    const result = goalProgress({
      target: d(1000),
      targetDate: null,
      today: TODAY,
      contributions: [
        { amount: d(600), date: '2026-09-01' },
        { amount: d(-200), date: '2026-09-20' },
      ],
    });
    expect(result).toMatchObject({ saved: '400.00', monthlyPace: '133.33', status: 'NO_DEADLINE', monthlyNeeded: null });
  });

  it('is COMPLETED once the target is reached, capping percent at 100', () => {
    const result = goalProgress({ target: d(500), targetDate: '2026-12-01', today: TODAY, contributions: [{ amount: d(650), date: '2026-09-01' }] });
    expect(result).toMatchObject({ status: 'COMPLETED', remaining: '0.00', percent: 100, projectedDate: null });
  });

  it('is OVERDUE past the date, and BEHIND with no pace at all', () => {
    expect(goalProgress({ target: d(500), targetDate: '2026-09-01', today: TODAY, contributions: [] }).status).toBe('OVERDUE');
    const stalled = goalProgress({ target: d(500), targetDate: '2027-01-01', today: TODAY, contributions: [] });
    expect(stalled).toMatchObject({ status: 'BEHIND', projectedDate: null, monthlyNeeded: '166.67' });
  });
});
