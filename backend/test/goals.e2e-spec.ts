import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('Savings goals (e2e)', () => {
  let ctx: TestContext;
  let me: Session;
  let other: Session;
  let goalId: string;

  const contribute = (amount: number, date = daysFromNow(-1), s = me) =>
    ctx.http().post(`/api/goals/${goalId}/contributions`).set(s.auth).send({ amount, date });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    me = await registerUser(ctx, 'Me');
    other = await registerUser(ctx, 'Other');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates a goal with zero progress', async () => {
    const res = await ctx
      .http()
      .post('/api/goals')
      .set(me.auth)
      .send({ name: 'Viagem', targetAmount: 6000, targetDate: daysFromNow(365), color: '#3b82f6', icon: 'plane' })
      .expect(201);
    goalId = res.body.id;
    expect(res.body).toMatchObject({ saved: '0.00', remaining: '6000.00', percent: 0, status: 'BEHIND', monthlyPace: '0.00', contributions: [] });
  });

  it('tracks contributions, pace and projection', async () => {
    await contribute(900).expect(201);
    const res = await contribute(600).expect(201);
    expect(res.body).toMatchObject({
      saved: '1500.00',
      remaining: '4500.00',
      percent: 25,
      monthlyPace: '500.00', // 1500 in the last 90 days / 3
      status: 'ON_TRACK', // 4500 / 500 = 9 months < 12
    });
    expect(res.body.contributions).toHaveLength(2);
    expect(res.body.contributions[0].createdBy).toEqual({ id: me.user.id, name: 'Me' });
  });

  it('allows withdrawals but never below zero', async () => {
    await contribute(-200).expect(201);
    const tooMuch = await contribute(-5000).expect(400);
    expect(tooMuch.body.message).toContain('1300.00');
    await contribute(0).expect(400);
  });

  it('completes when the target is reached', async () => {
    const res = await contribute(4700).expect(201);
    expect(res.body).toMatchObject({ saved: '6000.00', percent: 100, status: 'COMPLETED', projectedDate: null });
  });

  it('removing a deposit that funds a later withdrawal is refused', async () => {
    const goal = (await ctx.http().post('/api/goals').set(me.auth).send({ name: 'Teste', targetAmount: 100 }).expect(201)).body;
    const deposit = (await ctx.http().post(`/api/goals/${goal.id}/contributions`).set(me.auth).send({ amount: 50, date: daysFromNow(-2) }).expect(201)).body.contributions[0];
    await ctx.http().post(`/api/goals/${goal.id}/contributions`).set(me.auth).send({ amount: -30, date: daysFromNow(-1) }).expect(201);
    await ctx.http().delete(`/api/goals/${goal.id}/contributions/${deposit.id}`).set(me.auth).expect(400);
  });

  it('archives goals out of the default list', async () => {
    await ctx.http().patch(`/api/goals/${goalId}`).set(me.auth).send({ archived: true }).expect(200);
    const active = await ctx.http().get('/api/goals').set(me.auth).expect(200);
    expect(active.body.map((g: { id: string }) => g.id)).not.toContain(goalId);
    const all = await ctx.http().get('/api/goals?includeArchived=true').set(me.auth).expect(200);
    expect(all.body.map((g: { id: string }) => g.id)).toContain(goalId);
  });

  it('other households cannot see, fund or delete the goal (BOLA)', async () => {
    await ctx.http().get(`/api/goals/${goalId}`).set(other.auth).expect(404);
    await contribute(10, daysFromNow(-1), other).expect(404);
    await ctx.http().delete(`/api/goals/${goalId}`).set(other.auth).expect(404);
    const theirs = await ctx.http().get('/api/goals?includeArchived=true').set(other.auth).expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('validates input', async () => {
    await ctx.http().post('/api/goals').set(me.auth).send({ name: '', targetAmount: 100 }).expect(400);
    await ctx.http().post('/api/goals').set(me.auth).send({ name: 'X', targetAmount: -1 }).expect(400);
    await ctx.http().post('/api/goals').set(me.auth).send({ name: 'X', targetAmount: 10, targetDate: '2026-13-01' }).expect(400);
  });
});
