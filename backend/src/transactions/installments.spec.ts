import { describe, expect, it } from 'vitest';
import { Decimal } from '../common/utils/money.js';
import { buildInstallments } from './installments.js';

const amounts = (total: string, n: number) =>
  buildInstallments(new Decimal(total), n, '2026-01-15').map((i) => i.amount.toFixed(2));

describe('buildInstallments', () => {
  it('splits evenly when possible', () => {
    expect(amounts('300.00', 3)).toEqual(['100.00', '100.00', '100.00']);
  });

  it('gives leftover cents to the first installments and keeps the exact total', () => {
    expect(amounts('100.00', 3)).toEqual(['33.34', '33.33', '33.33']);
    expect(amounts('0.05', 3)).toEqual(['0.02', '0.02', '0.01']);

    const parts = buildInstallments(new Decimal('1999.99'), 7, '2026-01-15');
    const sum = parts.reduce((acc, p) => acc.plus(p.amount), new Decimal(0));
    expect(sum.toFixed(2)).toBe('1999.99');
  });

  it('numbers installments and spaces them monthly across years', () => {
    const parts = buildInstallments(new Decimal('120'), 3, '2026-11-10');
    expect(parts.map((p) => [p.number, p.total, p.date])).toEqual([
      [1, 3, '2026-11-10'],
      [2, 3, '2026-12-10'],
      [3, 3, '2027-01-10'],
    ]);
  });

  it('clamps day 31 to the last day of shorter months', () => {
    const dates = buildInstallments(new Decimal('400'), 4, '2026-01-31').map((p) => p.date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(buildInstallments(new Decimal('20'), 2, '2028-01-31')[1].date).toBe('2028-02-29'); // leap year
  });

  it('rejects invalid input', () => {
    expect(() => buildInstallments(new Decimal('10'), 0, '2026-01-01')).toThrow();
    expect(() => buildInstallments(new Decimal('10.005'), 2, '2026-01-01')).toThrow();
  });
});
