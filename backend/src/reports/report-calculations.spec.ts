import { describe, expect, it } from 'vitest';
import { Decimal } from '../common/utils/money.js';
import { buildMonthlySeries, percentChange, savingsRate } from './report-calculations.js';

const d = (v: string) => new Decimal(v);

describe('buildMonthlySeries', () => {
  it('fills empty months with zeros and accumulates the balance', () => {
    const series = buildMonthlySeries(
      [
        { period: '2026-08', type: 'INCOME', total: '5000.00' },
        { period: '2026-08', type: 'EXPENSE', total: d('3200.50') },
        // September has no transactions at all
        { period: '2026-10', type: 'EXPENSE', total: '100' },
      ],
      { year: 2026, month: 8 },
      3,
      d('1000'),
    );

    expect(series).toEqual([
      { period: '2026-08', year: 2026, month: 8, income: '5000.00', expense: '3200.50', net: '1799.50', balance: '2799.50' },
      { period: '2026-09', year: 2026, month: 9, income: '0.00', expense: '0.00', net: '0.00', balance: '2799.50' },
      { period: '2026-10', year: 2026, month: 10, income: '0.00', expense: '100.00', net: '-100.00', balance: '2699.50' },
    ]);
  });

  it('crosses year boundaries', () => {
    const series = buildMonthlySeries([], { year: 2025, month: 11 }, 4, d('0'));
    expect(series.map((p) => p.period)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('percentChange', () => {
  it('computes the relative change', () => {
    expect(percentChange(d('1200'), d('1000'))).toBe(20);
    expect(percentChange(d('750'), d('1000'))).toBe(-25);
  });

  it('returns null without a baseline', () => {
    expect(percentChange(d('500'), d('0'))).toBeNull();
  });
});

describe('savingsRate', () => {
  it('is the share of income not spent', () => {
    expect(savingsRate(d('5000'), d('3500'))).toBe(30);
  });

  it('is negative when spending exceeds income', () => {
    expect(savingsRate(d('1000'), d('1500'))).toBe(-50);
  });

  it('is null without income', () => {
    expect(savingsRate(d('0'), d('200'))).toBeNull();
  });
});
