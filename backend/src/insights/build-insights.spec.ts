import { describe, expect, it } from 'vitest';
import { Decimal } from '../common/utils/money.js';
import { buildInsights, type InsightInput } from './build-insights.js';

const d = (v: number | string) => new Decimal(v);
const cat = (name: string) => ({ id: `cat-${name}`, name, color: '#8b5cf6', icon: null });

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    isCurrentMonth: false,
    elapsedFraction: 1,
    income: d(5000),
    expense: d(3000),
    categories: [],
    budgets: [],
    biggestExpense: null,
    upcomingBills: [],
    goals: [],
    ...overrides,
  };
}

const kinds = (i: InsightInput) => buildInsights(i).map((x) => x.kind);

describe('buildInsights', () => {
  it('flags a category 25% and R$50 above its 3-month average', () => {
    const [spike] = buildInsights(input({ categories: [{ category: cat('Lazer'), current: d(500), average: d(300) }] }));
    expect(spike).toMatchObject({
      kind: 'CATEGORY_SPIKE',
      severity: 'warning',
      data: { categoryName: 'Lazer', current: '500.00', average: '300.00', changePercent: 66.67 },
    });
  });

  it('ignores small absolute differences even when the ratio is high', () => {
    expect(kinds(input({ categories: [{ category: cat('Café'), current: d(60), average: d(30) }] }))).not.toContain('CATEGORY_SPIKE');
  });

  it('celebrates drops only in finished months', () => {
    const categories = [{ category: cat('Uber'), current: d(100), average: d(400) }];
    expect(kinds(input({ categories }))).toContain('CATEGORY_DROP');
    expect(kinds(input({ categories, isCurrentMonth: true, elapsedFraction: 0.3 }))).not.toContain('CATEGORY_DROP');
  });

  it('projects budgets at the current pace during the month', () => {
    const [pace] = buildInsights(
      input({
        isCurrentMonth: true,
        elapsedFraction: 0.5,
        budgets: [{ category: cat('Lazer'), limit: d(400), spent: d(260), status: 'ON_TRACK' }],
      }),
    );
    expect(pace).toMatchObject({ kind: 'BUDGET_PACE', data: { projected: '520.00', limit: '400.00' } });
  });

  it('reports exceeded budgets as danger, before everything else', () => {
    const result = buildInsights(
      input({
        budgets: [{ category: cat('Mercado'), limit: d(1000), spent: d(1200), status: 'EXCEEDED' }],
        biggestExpense: { description: 'TV', amount: d(2500), date: '2026-09-10', categoryName: 'Casa' },
      }),
    );
    expect(result[0]).toMatchObject({ kind: 'BUDGET_EXCEEDED', severity: 'danger' });
    // Sorted by severity: danger, warning, positive, info.
    const order = ['danger', 'warning', 'positive', 'info'];
    const ranks = result.map((i) => order.indexOf(i.severity));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(result.map((i) => i.kind)).toContain('BIGGEST_EXPENSE');
  });

  it('warns when spending exceeds income and praises a 20%+ savings rate', () => {
    expect(buildInsights(input({ income: d(3000), expense: d(3600) }))[0]).toMatchObject({
      kind: 'SPENT_MORE_THAN_EARNED',
      data: { difference: '600.00' },
    });
    expect(buildInsights(input({ income: d(5000), expense: d(3500) }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'SAVINGS_GOOD', data: { savingsRate: 30, saved: '1500.00' } })]),
    );
  });

  it('sums the bills of the next days in the current month', () => {
    const result = buildInsights(
      input({
        isCurrentMonth: true,
        elapsedFraction: 0.2,
        upcomingBills: [
          { amount: d(1800), type: 'EXPENSE' },
          { amount: d(55.9), type: 'EXPENSE' },
          { amount: d(6500), type: 'INCOME' },
        ],
      }),
    );
    expect(result.find((i) => i.kind === 'UPCOMING_BILLS')?.data).toEqual({ count: 2, total: '1855.90' });
  });

  it('reports goals behind schedule and completed', () => {
    const result = kinds(
      input({
        goals: [
          { id: 'g1', name: 'Viagem', status: 'BEHIND', monthlyNeeded: '800.00', monthlyPace: '600.00', percent: 40 },
          { id: 'g2', name: 'Celular', status: 'COMPLETED', monthlyNeeded: null, monthlyPace: '0.00', percent: 100 },
          { id: 'g3', name: 'Casa', status: 'ON_TRACK', monthlyNeeded: '100.00', monthlyPace: '200.00', percent: 10 },
        ],
      }),
    );
    expect(result).toEqual(expect.arrayContaining(['GOAL_BEHIND', 'GOAL_COMPLETED']));
    expect(result.filter((k) => k.startsWith('GOAL'))).toHaveLength(2);
  });

  it('suggests budgets when most spending is outside them', () => {
    const result = buildInsights(input({ expense: d(3000), budgets: [{ category: cat('Mercado'), limit: d(1500), spent: d(1000), status: 'ON_TRACK' }] }));
    expect(result.find((i) => i.kind === 'UNBUDGETED_SPENDING')?.data).toEqual({ amount: '2000.00', shareOfExpenses: 66.67 });
  });

  it('says nothing about an empty month', () => {
    expect(buildInsights(input({ income: d(0), expense: d(0) }))).toEqual([]);
  });
});
