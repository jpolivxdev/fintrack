import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecurringService } from '../src/recurring/recurring.service.js';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

const pad = (n: number) => String(n).padStart(2, '0');
const monthsAgo = (n: number, day: number) => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('Recurring rules (e2e)', () => {
  let ctx: TestContext;
  let me: Session;
  let other: Session;
  let expenseCategoryId: string;
  let incomeCategoryId: string;
  let ruleId: string;

  const countGenerated = (id: string) => ctx.prisma.transaction.count({ where: { recurringRuleId: id } });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    me = await registerUser(ctx, 'Me');
    other = await registerUser(ctx, 'Other');
    const cats = await ctx.http().get('/api/categories?limit=100').set(me.auth).expect(200);
    expenseCategoryId = cats.body.data.find((c: { name: string }) => c.name === 'Moradia').id;
    incomeCategoryId = cats.body.data.find((c: { type: string }) => c.type === 'INCOME').id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates past-due occurrences immediately (rent since 3 months ago, day 1)', async () => {
    const res = await ctx
      .http()
      .post('/api/recurring')
      .set(me.auth)
      .send({ description: 'Aluguel', amount: 1800, type: 'EXPENSE', frequency: 'MONTHLY', categoryId: expenseCategoryId, startDate: monthsAgo(3, 1) })
      .expect(201);
    ruleId = res.body.id;

    // 3 months ago, 2 months ago, last month and this month (day 1 has passed).
    expect(res.body.generatedCount).toBe(4);
    expect(res.body.nextDate).toBe(monthsAgo(-1, 1));
    expect(await countGenerated(ruleId)).toBe(4);

    const list = await ctx.http().get('/api/transactions?search=Aluguel').set(me.auth).expect(200);
    expect(list.body.data.every((t: { amount: string }) => t.amount === '1800.00')).toBe(true);
  });

  it('never duplicates, even when generation runs concurrently', async () => {
    const service = ctx.app.get(RecurringService);
    const household = (await ctx.http().get('/api/household').set(me.auth)).body.id;
    await ctx.prisma.recurringRule.update({ where: { id: ruleId }, data: { nextRunDate: new Date(`${monthsAgo(3, 1)}T00:00:00Z`) } });

    await Promise.all([service.materializeDue(household, true), service.materializeDue(household, true), service.materializeDue(household, true)]);
    expect(await countGenerated(ruleId)).toBe(4);
  });

  it('lists upcoming occurrences that do not exist yet', async () => {
    const res = await ctx.http().get('/api/recurring/upcoming?days=70').set(me.auth).expect(200);
    const rent = res.body.filter((o: { ruleId: string }) => o.ruleId === ruleId);
    expect(rent.length).toBeGreaterThanOrEqual(2);
    expect(rent[0]).toMatchObject({ description: 'Aluguel', amount: '1800.00', date: monthsAgo(-1, 1) });
  });

  it('updates apply to future occurrences only', async () => {
    await ctx.http().patch(`/api/recurring/${ruleId}`).set(me.auth).send({ amount: 1950 }).expect(200);
    const existing = await ctx.prisma.transaction.findMany({ where: { recurringRuleId: ruleId } });
    expect(existing.every((t) => t.amount.toFixed(2) === '1800.00')).toBe(true);
    const upcoming = await ctx.http().get('/api/recurring/upcoming?days=40').set(me.auth).expect(200);
    expect(upcoming.body[0].amount).toBe('1950.00');
  });

  it('pausing stops generation; a deleted occurrence is not recreated', async () => {
    const res = await ctx.http().patch(`/api/recurring/${ruleId}`).set(me.auth).send({ active: false }).expect(200);
    expect(res.body).toMatchObject({ active: false, nextDate: null });

    const one = await ctx.prisma.transaction.findFirstOrThrow({ where: { recurringRuleId: ruleId } });
    await ctx.http().delete(`/api/transactions/${one.id}`).set(me.auth).expect(204);
    await ctx.http().patch(`/api/recurring/${ruleId}`).set(me.auth).send({ active: true }).expect(200);
    expect(await countGenerated(ruleId)).toBe(3);
  });

  it('a rule past its end date deactivates itself', async () => {
    const res = await ctx
      .http()
      .post('/api/recurring')
      .set(me.auth)
      .send({ description: 'Curso', amount: 99.9, type: 'EXPENSE', frequency: 'MONTHLY', categoryId: expenseCategoryId, startDate: monthsAgo(4, 10), endDate: monthsAgo(2, 10) })
      .expect(201);
    expect(res.body).toMatchObject({ generatedCount: 3, active: false, nextDate: null });
  });

  it('a future rule creates nothing yet', async () => {
    const res = await ctx
      .http()
      .post('/api/recurring')
      .set(me.auth)
      .send({ description: 'Salário', amount: 5000, type: 'INCOME', frequency: 'MONTHLY', categoryId: incomeCategoryId, startDate: daysFromNow(3) })
      .expect(201);
    expect(res.body).toMatchObject({ generatedCount: 0, nextDate: daysFromNow(3) });
  });

  it('validates type/category and dates', async () => {
    const base = { description: 'X', amount: 10, frequency: 'MONTHLY', startDate: daysFromNow(1) };
    await ctx.http().post('/api/recurring').set(me.auth).send({ ...base, type: 'INCOME', categoryId: expenseCategoryId }).expect(400);
    await ctx.http().post('/api/recurring').set(me.auth).send({ ...base, type: 'EXPENSE', categoryId: expenseCategoryId, endDate: monthsAgo(1, 1) }).expect(400);
    await ctx.http().post('/api/recurring').set(me.auth).send({ ...base, type: 'EXPENSE', categoryId: expenseCategoryId, frequency: 'DAILY' }).expect(400);
  });

  it('a category used by a rule cannot be deleted', async () => {
    const cat = await ctx.http().post('/api/categories').set(me.auth).send({ name: 'Academia', type: 'EXPENSE' }).expect(201);
    await ctx
      .http()
      .post('/api/recurring')
      .set(me.auth)
      .send({ description: 'Mensalidade', amount: 120, type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cat.body.id, startDate: daysFromNow(5) })
      .expect(201);
    await ctx.http().delete(`/api/categories/${cat.body.id}`).set(me.auth).expect(409);
  });

  it("other households cannot see or change the rule (BOLA)", async () => {
    await ctx.http().get(`/api/recurring/${ruleId}`).set(other.auth).expect(404);
    await ctx.http().patch(`/api/recurring/${ruleId}`).set(other.auth).send({ amount: 1 }).expect(404);
    await ctx.http().delete(`/api/recurring/${ruleId}`).set(other.auth).expect(404);
    const theirs = await ctx.http().get('/api/recurring').set(other.auth).expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('deleting a rule keeps the transactions it generated', async () => {
    const before = await countGenerated(ruleId);
    await ctx.http().delete(`/api/recurring/${ruleId}`).set(me.auth).expect(204);
    const kept = await ctx.http().get('/api/transactions?search=Aluguel').set(me.auth).expect(200);
    expect(kept.body.meta.total).toBe(before);
  });
});
