import { describe, expect, it } from 'vitest';
import { Decimal } from '../common/utils/money.js';
import { computeBudgetProgress } from './budget-progress.js';

const d = (v: string) => new Decimal(v);

describe('computeBudgetProgress', () => {
  it('is ON_TRACK below 80%', () => {
    expect(computeBudgetProgress(d('1000'), d('250.50'))).toEqual({
      limit: '1000.00',
      spent: '250.50',
      remaining: '749.50',
      percentUsed: 25.05,
      status: 'ON_TRACK',
    });
  });

  it('is WARNING from exactly 80%', () => {
    expect(computeBudgetProgress(d('1000'), d('800')).status).toBe('WARNING');
  });

  it('is WARNING when exactly at the limit', () => {
    const progress = computeBudgetProgress(d('500'), d('500'));
    expect(progress.status).toBe('WARNING');
    expect(progress.remaining).toBe('0.00');
    expect(progress.percentUsed).toBe(100);
  });

  it('is EXCEEDED above the limit and never reports negative remaining', () => {
    const progress = computeBudgetProgress(d('300'), d('300.01'));
    expect(progress.status).toBe('EXCEEDED');
    expect(progress.remaining).toBe('0.00');
    expect(progress.percentUsed).toBe(100);
  });

  it('shows percentages above 100 when overspent', () => {
    expect(computeBudgetProgress(d('200'), d('350')).percentUsed).toBe(175);
  });

  it('has no floating point drift', () => {
    // 0.1 + 0.2 !== 0.3 with floats
    const spent = d('0.1').plus(d('0.2'));
    expect(computeBudgetProgress(d('0.3'), spent)).toMatchObject({
      remaining: '0.00',
      percentUsed: 100,
    });
  });
});
