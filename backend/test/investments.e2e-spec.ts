import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../src/investments/yield-engine.js';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Investments with deterministic market data (test-app's fake provider:
 * CDI 0.05% per weekday, IPCA 0.4% per month).
 */
describe('Investments (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let eve: Session;
  let checkingId: string;
  let cdbId: string;
  let cdbAccountId: string;
  let stocksId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    ana = await registerUser(ctx, 'Ana');
    eve = await registerUser(ctx, 'Eve');
    const { body } = await ctx.http().get('/api/accounts').set(ana.auth).expect(200);
    checkingId = body.data[0].id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates a CDI investment funded from checking, and it grows with the CDI', async () => {
    const start = addDays(today(), -60);
    const res = await ctx
      .http()
      .post('/api/investments')
      .set(ana.auth)
      .send({ name: 'CDB Banco X', assetClass: 'FIXED_INCOME', yieldMode: 'CDI_PERCENT', rate: 110, startDate: start, initialAmount: 1000, fromAccountId: checkingId })
      .expect(201);
    cdbId = res.body.id;
    cdbAccountId = res.body.account.id;
    expect(res.body).toMatchObject({ yieldMode: 'CDI_PERCENT', rate: '110.0000', invested: '1000.00', account: { type: 'INVESTMENT' } });
    expect(Number(res.body.value)).toBeGreaterThan(1000);
    expect(res.body.percentOfCdi).toBeCloseTo(110, 0);
    expect(res.body.movements).toEqual([expect.objectContaining({ kind: 'CONTRIBUTION', amount: '1000.00' })]);

    // The money left checking (a transfer, not an expense).
    const { body: accounts } = await ctx.http().get('/api/accounts').set(ana.auth).expect(200);
    expect(accounts.data.find((a: { id: string }) => a.id === checkingId).balance).toBe('-1000.00');
    const { body: summary } = await ctx.http().get(`/api/reports/summary?year=${start.slice(0, 4)}&month=${Number(start.slice(5, 7))}`).set(ana.auth).expect(200);
    expect(summary.expense).toBe('0.00');
  });

  it('validates the rate for each yield mode', async () => {
    const base = { name: 'X', assetClass: 'FIXED_INCOME', startDate: today() };
    await ctx.http().post('/api/investments').set(ana.auth).send({ ...base, yieldMode: 'CDI_PERCENT' }).expect(400);
    await ctx.http().post('/api/investments').set(ana.auth).send({ ...base, yieldMode: 'CDI_PERCENT', rate: 0.5 }).expect(400);
    await ctx.http().post('/api/investments').set(ana.auth).send({ ...base, yieldMode: 'FIXED_RATE', rate: 150 }).expect(400);
    await ctx.http().post('/api/investments').set(ana.auth).send({ ...base, yieldMode: 'MANUAL', startDate: addDays(today(), 3) }).expect(400);
    await ctx.http().post('/api/investments').set(ana.auth).send({ ...base, yieldMode: 'MANUAL', assetClass: 'GOLD' }).expect(400);
  });

  it('manual investments follow recorded valuations', async () => {
    const start = addDays(today(), -40);
    const res = await ctx
      .http()
      .post('/api/investments')
      .set(ana.auth)
      .send({ name: 'Ações', assetClass: 'STOCKS', yieldMode: 'MANUAL', startDate: start, initialAmount: 2000 })
      .expect(201);
    stocksId = res.body.id;
    expect(res.body).toMatchObject({ value: '2000.00', invested: '2000.00', profit: '0.00', rate: null });

    const valued = await ctx.http().post(`/api/investments/${stocksId}/valuations`).set(ana.auth).send({ date: addDays(today(), -10), value: 2300 }).expect(201);
    expect(valued.body).toMatchObject({ value: '2300.00', profit: '300.00', profitPercent: 15 });
    // Same day again replaces the value.
    const replaced = await ctx.http().post(`/api/investments/${stocksId}/valuations`).set(ana.auth).send({ date: addDays(today(), -10), value: 2200 }).expect(201);
    expect(replaced.body.valuations).toHaveLength(1);
    expect(replaced.body.value).toBe('2200.00');
    await ctx.http().post(`/api/investments/${stocksId}/valuations`).set(ana.auth).send({ date: addDays(today(), 1), value: 1 }).expect(400);
    await ctx.http().post(`/api/investments/${stocksId}/valuations`).set(ana.auth).send({ date: addDays(start, -1), value: 1 }).expect(400);

    const removed = await ctx.http().delete(`/api/investments/${stocksId}/valuations/${replaced.body.valuations[0].id}`).set(ana.auth).expect(200);
    expect(removed.body.value).toBe('2000.00');
  });

  it('portfolio sums everything and compares with CDI and IPCA', async () => {
    await ctx.http().post(`/api/investments/${stocksId}/valuations`).set(ana.auth).send({ date: today(), value: 2100 }).expect(201);
    const { body } = await ctx.http().get('/api/investments').set(ana.auth).expect(200);
    expect(body.items).toHaveLength(2);
    expect(body.summary.invested).toBe('3000.00');
    const value = Number(body.summary.value);
    expect(value).toBeCloseTo(body.items.reduce((acc: number, i: { value: string }) => acc + Number(i.value), 0), 2);
    expect(Number(body.summary.cdiValue)).toBeGreaterThan(3000);
    expect(Number(body.summary.ipcaValue)).toBeGreaterThan(3000);
    expect(body.allocation.map((a: { assetClass: string }) => a.assetClass).sort()).toEqual(['FIXED_INCOME', 'STOCKS']);
    expect(body.market).toMatchObject({ cdiAnnual: expect.any(Number), ipca12m: expect.any(Number) });
  });

  it('history gives month ends with value, invested and the benchmarks', async () => {
    const { body } = await ctx.http().get('/api/investments/history?months=4').set(ana.auth).expect(200);
    expect(body).toHaveLength(4);
    expect(body.at(-1).date).toBe(today());
    expect(body.at(-1)).toMatchObject({ invested: '3000.00' });
    const one = await ctx.http().get(`/api/investments/history?months=3&investmentId=${cdbId}`).set(ana.auth).expect(200);
    expect(one.body.at(-1).invested).toBe('1000.00');
  });

  it('a recurring transfer rule makes scheduled contributions', async () => {
    const rule = await ctx
      .http()
      .post('/api/recurring')
      .set(ana.auth)
      .send({ description: 'Aporte mensal', amount: 300, type: 'EXPENSE', frequency: 'MONTHLY', accountId: checkingId, toAccountId: cdbAccountId, startDate: addDays(today(), -35) })
      .expect(201);
    expect(rule.body).toMatchObject({ category: null, toAccount: { id: cdbAccountId }, generatedCount: 2 });

    const { body } = await ctx.http().get(`/api/investments/${cdbId}`).set(ana.auth).expect(200);
    expect(body.invested).toBe('1600.00');
    expect(body.scheduled).toEqual([expect.objectContaining({ description: 'Aporte mensal', amount: '300.00' })]);

    // Either a category or a destination, never both or neither.
    const { body: cats } = await ctx.http().get('/api/categories?type=EXPENSE').set(ana.auth).expect(200);
    const base = { description: 'x', amount: 1, type: 'EXPENSE', frequency: 'MONTHLY', startDate: today() };
    await ctx.http().post('/api/recurring').set(ana.auth).send(base).expect(400);
    await ctx.http().post('/api/recurring').set(ana.auth).send({ ...base, categoryId: cats.data[0].id, toAccountId: cdbAccountId }).expect(400);
    await ctx.http().post('/api/recurring').set(ana.auth).send({ ...base, type: 'INCOME', toAccountId: cdbAccountId }).expect(400);
  });

  it('an expense rule can be moved to an investment, past expenses included', async () => {
    const { body: cats } = await ctx.http().get('/api/categories?type=EXPENSE').set(ana.auth).expect(200);
    const rule = await ctx
      .http()
      .post('/api/recurring')
      .set(ana.auth)
      .send({ description: 'Aplicação Tesouro', amount: 200, type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cats.data[0].id, accountId: checkingId, startDate: addDays(today(), -65) })
      .expect(201);
    expect(rule.body.generatedCount).toBe(3);

    const moved = await ctx.http().post(`/api/recurring/${rule.body.id}/move-to-investment`).set(ana.auth).send({ investmentId: stocksId, convertPast: true }).expect(200);
    expect(moved.body).toMatchObject({ category: null, generatedCount: 3, nextDate: rule.body.nextDate });
    await ctx.http().get(`/api/recurring/${rule.body.id}`).set(ana.auth).expect(404);
    const expenses = await ctx.http().get('/api/transactions?search=Tesouro').set(ana.auth).expect(200);
    expect(expenses.body.meta.total).toBe(0);
    const { body: stocks } = await ctx.http().get(`/api/investments/${stocksId}`).set(ana.auth).expect(200);
    expect(stocks.movements.filter((m: { kind: string }) => m.kind === 'CONTRIBUTION')).toHaveLength(3);

    await ctx.http().post(`/api/recurring/${moved.body.id}/move-to-investment`).set(ana.auth).send({ investmentId: stocksId }).expect(400);
  });

  it('an existing savings account can be tracked as an investment', async () => {
    const acc = await ctx.http().post('/api/accounts').set(ana.auth).send({ name: 'Reserva', type: 'SAVINGS', initialBalance: 5000 }).expect(201);
    const res = await ctx
      .http()
      .post('/api/investments')
      .set(ana.auth)
      .send({ accountId: acc.body.id, assetClass: 'FIXED_INCOME', yieldMode: 'CDI_PERCENT', rate: 100, startDate: addDays(today(), -5) })
      .expect(201);
    expect(res.body.account).toMatchObject({ name: 'Reserva', type: 'SAVINGS' });
    expect(res.body.invested).toBe('5000.00');
    await ctx.http().post('/api/investments').set(ana.auth).send({ accountId: acc.body.id, assetClass: 'FIXED_INCOME', yieldMode: 'MANUAL' }).expect(409);
    await ctx.http().post('/api/investments').set(ana.auth).send({ accountId: checkingId, assetClass: 'FIXED_INCOME', yieldMode: 'MANUAL', initialAmount: 5 }).expect(400);
  });

  it('can switch yield mode, archive, and refuses deleting history', async () => {
    const updated = await ctx.http().patch(`/api/investments/${cdbId}`).set(ana.auth).send({ yieldMode: 'FIXED_RATE', rate: 12, name: 'CDB Pré' }).expect(200);
    expect(updated.body).toMatchObject({ yieldMode: 'FIXED_RATE', rate: '12.0000', account: { name: 'CDB Pré' } });
    // Switching mode re-validates the rate (a % of the CDI must be between 1 and 300).
    await ctx.http().patch(`/api/investments/${cdbId}`).set(ana.auth).send({ yieldMode: 'CDI_PERCENT', rate: 0.5 }).expect(400);
    await ctx.http().delete(`/api/investments/${cdbId}`).set(ana.auth).expect(409); // has history
    const archived = await ctx.http().patch(`/api/investments/${cdbId}`).set(ana.auth).send({ archived: true }).expect(200);
    expect(archived.body.archived).toBe(true);

    const empty = await ctx.http().post('/api/investments').set(ana.auth).send({ name: 'Vazio', assetClass: 'OTHER', yieldMode: 'MANUAL' }).expect(201);
    await ctx.http().delete(`/api/investments/${empty.body.id}`).set(ana.auth).expect(204);
    await ctx.http().get(`/api/investments/${empty.body.id}`).set(ana.auth).expect(404);
  });

  it('other households cannot see or touch investments (BOLA)', async () => {
    await ctx.http().get(`/api/investments/${cdbId}`).set(eve.auth).expect(404);
    await ctx.http().patch(`/api/investments/${cdbId}`).set(eve.auth).send({ name: 'x' }).expect(404);
    await ctx.http().delete(`/api/investments/${cdbId}`).set(eve.auth).expect(404);
    await ctx.http().post(`/api/investments/${cdbId}/valuations`).set(eve.auth).send({ date: today(), value: 1 }).expect(404);
    await ctx.http().get(`/api/investments/history?investmentId=${cdbId}`).set(eve.auth).expect(404);
    const { body } = await ctx.http().get('/api/investments').set(eve.auth).expect(200);
    expect(body.items).toHaveLength(0);
    // Eve cannot fund from or point rules at Ana's accounts either.
    await ctx.http().post('/api/investments').set(eve.auth).send({ name: 'x', assetClass: 'OTHER', yieldMode: 'MANUAL', initialAmount: 10, fromAccountId: checkingId }).expect(404);
    await ctx.http().post('/api/recurring').set(eve.auth).send({ description: 'x', amount: 1, type: 'EXPENSE', frequency: 'MONTHLY', toAccountId: cdbAccountId, startDate: today() }).expect(404);
    const { body: rules } = await ctx.http().get('/api/recurring').set(ana.auth).expect(200);
    await ctx.http().post(`/api/recurring/${rules[0].id}/move-to-investment`).set(eve.auth).send({ investmentId: cdbId }).expect(404);
  });
});
