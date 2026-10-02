import { describe, expect, it } from 'vitest';
import { addDays, BusinessCalendar, monthEnds, percentOfCdi, profitPercent, simulate, type MarketData } from './yield-engine.js';

/** Weekday CDI at a flat daily rate over [from, to]. */
function flatCdi(from: string, to: string, daily: number, holidays: string[] = []): Map<string, number> {
  const map = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.includes(d)) map.set(d, daily);
  }
  return map;
}

const noMarket: MarketData = { cdi: new Map(), ipca: new Map() };

describe('simulate', () => {
  it('CDI_PERCENT compounds the CDI times the percentage, only on business days', () => {
    // Mon 2026-09-07 .. Fri 2026-09-11 (5 business days) + weekend.
    const cdi = flatCdi('2026-09-07', '2026-09-13', 0.05);
    const result = simulate({
      mode: 'CDI_PERCENT',
      rate: 100,
      movements: [{ date: '2026-09-07', amount: 1000, external: true }],
      market: { cdi, ipca: new Map() },
      until: '2026-09-13',
    });
    expect(result.value).toBe(Math.round(1000 * 1.0005 ** 5 * 100) / 100);
    expect(result.invested).toBe(1000);
    expect(result.missingMarketData).toBe(false);
  });

  it('applies the percentage of the CDI (110%)', () => {
    const cdi = flatCdi('2026-09-07', '2026-09-11', 0.05);
    const result = simulate({
      mode: 'CDI_PERCENT',
      rate: 110,
      movements: [{ date: '2026-09-07', amount: 1000, external: true }],
      market: { cdi, ipca: new Map() },
      until: '2026-09-11',
    });
    expect(result.value).toBe(Math.round(1000 * (1 + 0.0005 * 1.1) ** 5 * 100) / 100);
  });

  it('skips holidays inside the published range', () => {
    const cdi = flatCdi('2026-09-07', '2026-09-11', 0.05, ['2026-09-07']); // 7 de setembro
    const result = simulate({
      mode: 'CDI_PERCENT',
      rate: 100,
      movements: [{ date: '2026-09-07', amount: 1000, external: true }],
      market: { cdi, ipca: new Map() },
      until: '2026-09-11',
    });
    expect(result.value).toBe(Math.round(1000 * 1.0005 ** 4 * 100) / 100);
  });

  it('reuses the last CDI on weekdays after the series ends', () => {
    const cdi = flatCdi('2026-09-07', '2026-09-08', 0.05);
    const result = simulate({
      mode: 'CDI_PERCENT',
      rate: 100,
      movements: [{ date: '2026-09-07', amount: 1000, external: true }],
      market: { cdi, ipca: new Map() },
      until: '2026-09-10',
    });
    expect(result.value).toBe(Math.round(1000 * 1.0005 ** 4 * 100) / 100);
  });

  it('FIXED_RATE grows 12% a.a. over 252 business days', () => {
    const cdi = flatCdi('2025-01-01', '2026-12-31', 0.04);
    const businessDays = [...cdi.keys()].filter((d) => d >= '2026-01-01' && d <= '2026-12-31').length;
    const result = simulate({
      mode: 'FIXED_RATE',
      rate: 12,
      movements: [{ date: '2026-01-01', amount: 1000, external: true }],
      market: { cdi, ipca: new Map() },
      until: '2026-12-31',
    });
    expect(result.value).toBeCloseTo(1000 * 1.12 ** (businessDays / 252), 1);
  });

  it('IPCA_PLUS spreads the month IPCA over its business days', () => {
    const cdi = flatCdi('2026-09-01', '2026-09-30', 0.05);
    const result = simulate({
      mode: 'IPCA_PLUS',
      rate: 0,
      movements: [{ date: '2026-09-01', amount: 1000, external: true }],
      market: { cdi, ipca: new Map([['2026-09', 0.5]]) },
      until: '2026-09-30',
    });
    expect(result.value).toBeCloseTo(1005, 2);
  });

  it('IPCA_PLUS uses the last known IPCA for months not published yet', () => {
    const cdi = flatCdi('2026-10-01', '2026-10-31', 0.05);
    const result = simulate({
      mode: 'IPCA_PLUS',
      rate: 0,
      movements: [{ date: '2026-10-01', amount: 1000, external: true }],
      market: { cdi, ipca: new Map([['2026-08', 1]]) },
      until: '2026-10-31',
    });
    expect(result.value).toBeCloseTo(1010, 2);
    expect(result.missingMarketData).toBe(false);
  });

  it('MANUAL only changes with movements and valuations', () => {
    const result = simulate({
      mode: 'MANUAL',
      rate: null,
      movements: [
        { date: '2026-01-10', amount: 1000, external: true },
        { date: '2026-03-10', amount: 500, external: true },
      ],
      valuations: [{ date: '2026-02-28', value: 1200 }],
      market: noMarket,
      until: '2026-04-01',
      checkpoints: ['2026-01-31', '2026-02-28', '2026-03-31'],
    });
    expect(result.points).toEqual([
      { date: '2026-01-31', value: 1000, invested: 1000 },
      { date: '2026-02-28', value: 1200, invested: 1000 },
      { date: '2026-03-31', value: 1700, invested: 1500 },
    ]);
    expect(result.value).toBe(1700);
  });

  it('a valuation anchors automatic modes too', () => {
    const cdi = flatCdi('2026-09-07', '2026-09-11', 0.05);
    const result = simulate({
      mode: 'CDI_PERCENT',
      rate: 100,
      movements: [{ date: '2026-09-07', amount: 1000, external: true }],
      valuations: [{ date: '2026-09-09', value: 2000 }],
      market: { cdi, ipca: new Map() },
      until: '2026-09-11',
    });
    expect(result.value).toBe(Math.round(2000 * 1.0005 ** 2 * 100) / 100);
  });

  it('withdrawals reduce invested; internal income is return, not investment', () => {
    const result = simulate({
      mode: 'MANUAL',
      rate: null,
      movements: [
        { date: '2026-01-01', amount: 1000, external: true },
        { date: '2026-01-15', amount: 30, external: false }, // dividends
        { date: '2026-01-20', amount: -400, external: true },
      ],
      market: noMarket,
      until: '2026-01-31',
    });
    expect(result.invested).toBe(600);
    expect(result.value).toBe(630);
  });

  it('flags missing market data instead of inventing a rate', () => {
    const result = simulate({
      mode: 'CDI_PERCENT',
      rate: 100,
      movements: [{ date: '2026-09-07', amount: 1000, external: true }],
      market: noMarket,
      until: '2026-09-11',
    });
    expect(result.value).toBe(1000);
    expect(result.missingMarketData).toBe(true);
  });

  it('ignores movements after `until` and zero-fills early checkpoints', () => {
    const result = simulate({
      mode: 'MANUAL',
      rate: null,
      movements: [
        { date: '2026-05-10', amount: 100, external: true },
        { date: '2026-12-10', amount: 100, external: true },
      ],
      market: noMarket,
      until: '2026-10-01',
      checkpoints: ['2026-04-30', '2026-05-31'],
    });
    expect(result.points).toEqual([
      { date: '2026-04-30', value: 0, invested: 0 },
      { date: '2026-05-31', value: 100, invested: 100 },
    ]);
    expect(result.invested).toBe(100);
  });
});

describe('helpers', () => {
  it('profitPercent and percentOfCdi', () => {
    expect(profitPercent(1100, 1000)).toBe(10);
    expect(profitPercent(0, 0)).toBeNull();
    expect(percentOfCdi(50, 100)).toBe(50);
    expect(percentOfCdi(10, 0)).toBeNull();
  });

  it('monthEnds caps the current month at today', () => {
    expect(monthEnds('2026-10-01', 3)).toEqual(['2026-08-31', '2026-09-30', '2026-10-01']);
    expect(monthEnds('2026-03-15', 2)).toEqual(['2026-02-28', '2026-03-15']);
  });

  it('BusinessCalendar counts business days per month', () => {
    const cal = new BusinessCalendar(flatCdi('2026-09-01', '2026-09-30', 0.05, ['2026-09-07']));
    expect(cal.businessDaysInMonth('2026-09')).toBe(21);
  });
});
