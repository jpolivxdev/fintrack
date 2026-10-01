import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/** A closed month (June 2026) with three months of history before it. */
describe('Insights (e2e)', () => {
  let ctx: TestContext;
  let me: Session;
  let other: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    me = await registerUser(ctx, 'Me');
    other = await registerUser(ctx, 'Other');

    const cats = (await ctx.http().get('/api/categories?limit=100').set(me.auth)).body.data as Array<{ id: string; name: string }>;
    const id = (name: string) => cats.find((c) => c.name === name)!.id;
    const tx = (description: string, amount: number, type: string, date: string, category: string) =>
      ctx.http().post('/api/transactions').set(me.auth).send({ description, amount, type, date, categoryId: id(category) }).expect(201);

    for (const month of ['03', '04', '05']) {
      await tx('Salário', 5000, 'INCOME', `2026-${month}-05`, 'Salário');
      await tx('Cinema', 200, 'EXPENSE', `2026-${month}-12`, 'Lazer');
      await tx('Mercado', 900, 'EXPENSE', `2026-${month}-15`, 'Alimentação');
    }
    await tx('Salário', 5000, 'INCOME', '2026-06-05', 'Salário');
    await tx('Show', 650, 'EXPENSE', '2026-06-12', 'Lazer'); // 200 on average before
    await tx('Mercado', 950, 'EXPENSE', '2026-06-15', 'Alimentação');
    await ctx.http().post('/api/budgets').set(me.auth).send({ categoryId: id('Lazer'), year: 2026, month: 6, monthlyLimit: 400 }).expect(201);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('turns the month into structured, severity-sorted insights', async () => {
    const res = await ctx.http().get('/api/insights?year=2026&month=6').set(me.auth).expect(200);
    expect(res.body).toMatchObject({ year: 2026, month: 6 });
    const byKind = Object.fromEntries(res.body.insights.map((i: { kind: string }) => [i.kind, i]));

    expect(byKind.BUDGET_EXCEEDED).toMatchObject({ severity: 'danger', data: { categoryName: 'Lazer', limit: '400.00', spent: '650.00' } });
    expect(byKind.CATEGORY_SPIKE).toMatchObject({ severity: 'warning', data: { categoryName: 'Lazer', current: '650.00', average: '200.00', changePercent: 225 } });
    expect(byKind.SAVINGS_GOOD).toMatchObject({ data: { savingsRate: 68, saved: '3400.00' } });
    expect(byKind.BIGGEST_EXPENSE).toMatchObject({ data: { description: 'Mercado', amount: '950.00' } });
    // Groceries moved only 5.6%: not worth a line.
    const groceryTrend = res.body.insights.filter(
      (i: { kind: string; data: { categoryName?: string } }) => i.kind.startsWith('CATEGORY_') && i.data.categoryName === 'Alimentação',
    );
    expect(groceryTrend).toEqual([]);

    expect(res.body.insights[0].severity).toBe('danger');
  });

  it("never mixes another household's data", async () => {
    const res = await ctx.http().get('/api/insights?year=2026&month=6').set(other.auth).expect(200);
    expect(res.body.insights).toEqual([]);
  });
});
