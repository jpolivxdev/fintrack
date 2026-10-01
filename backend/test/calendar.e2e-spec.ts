import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/** A couple shares a household; a third person lives elsewhere. */
describe('Shared calendar (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let joao: Session;
  let outsider: Session;
  let dinnerId: string;
  let privateId: string;

  const feed = (s: Session, from = '2026-10-01T00:00:00-03:00', to = '2026-11-01T00:00:00-03:00') =>
    ctx.http().get('/api/calendar').query({ from, to }).set(s.auth);
  const titles = (body: { events: Array<{ title: string }> }) => body.events.map((e) => e.title).sort();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    ana = await registerUser(ctx, 'Ana');
    joao = await registerUser(ctx, 'Joao');
    outsider = await registerUser(ctx, 'Outsider');
    const { body: invite } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/household/join').set(joao.auth).send({ code: invite.code }).expect(200);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('a shared dinner on Friday at 22:00 shows up for both', async () => {
    const res = await ctx
      .http()
      .post('/api/events')
      .set(ana.auth)
      .send({ title: 'Jantar', startAt: '2026-10-02T22:00:00-03:00', endAt: '2026-10-02T23:30:00-03:00', estimatedCost: 220 })
      .expect(201);
    dinnerId = res.body.id;
    // Stored as an absolute instant: 22:00 in Brasília is 01:00 UTC on Saturday.
    expect(res.body).toMatchObject({ startAt: '2026-10-03T01:00:00.000Z', visibility: 'SHARED', estimatedCost: '220.00', isMine: true });

    const forJoao = await feed(joao).expect(200);
    expect(forJoao.body.events).toEqual([
      expect.objectContaining({ title: 'Jantar', isMine: false, createdBy: { id: ana.user.id, name: 'Ana' } }),
    ]);
  });

  it('an event late on the last day of the month is not lost to UTC', async () => {
    await ctx
      .http()
      .post('/api/events')
      .set(ana.auth)
      .send({ title: 'Halloween', startAt: '2026-10-31T22:00:00-03:00', endAt: '2026-10-31T23:59:00-03:00' })
      .expect(201);
    expect(titles((await feed(ana).expect(200)).body)).toContain('Halloween');
    // ...and does not leak into November.
    const nov = await feed(ana, '2026-11-01T00:00:00-03:00', '2026-12-01T00:00:00-03:00').expect(200);
    expect(titles(nov.body)).not.toContain('Halloween');
  });

  it('private events exist only for their creator', async () => {
    const res = await ctx
      .http()
      .post('/api/events')
      .set(joao.auth)
      .send({ title: 'Surpresa para a Ana', startAt: '2026-10-05T12:00:00-03:00', endAt: '2026-10-05T13:00:00-03:00', visibility: 'PRIVATE' })
      .expect(201);
    privateId = res.body.id;

    expect(titles((await feed(joao).expect(200)).body)).toContain('Surpresa para a Ana');
    expect(titles((await feed(ana).expect(200)).body)).not.toContain('Surpresa para a Ana');
    await ctx.http().get(`/api/events/${privateId}`).set(ana.auth).expect(404);
    await ctx.http().patch(`/api/events/${privateId}`).set(ana.auth).send({ title: 'x' }).expect(404);
    await ctx.http().delete(`/api/events/${privateId}`).set(ana.auth).expect(404);
  });

  it('either partner can edit a shared event, but only its creator can make it private', async () => {
    const res = await ctx.http().patch(`/api/events/${dinnerId}`).set(joao.auth).send({ location: 'Liberdade' }).expect(200);
    expect(res.body.location).toBe('Liberdade');
    await ctx.http().patch(`/api/events/${dinnerId}`).set(joao.auth).send({ visibility: 'PRIVATE' }).expect(400);
  });

  it('outsiders see nothing of the household calendar', async () => {
    const res = await feed(outsider).expect(200);
    expect(res.body.events).toEqual([]);
    await ctx.http().get(`/api/events/${dinnerId}`).set(outsider.auth).expect(404);
  });

  it('shows recurring bills in the window, marking those already paid', async () => {
    const cats = await ctx.http().get('/api/categories?type=EXPENSE&limit=100').set(ana.auth);
    const home = cats.body.data.find((c: { name: string }) => c.name === 'Moradia');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${now.getUTCFullYear() - 1}-${pad(now.getUTCMonth() + 1)}-01`;
    await ctx
      .http()
      .post('/api/recurring')
      .set(ana.auth)
      .send({ description: 'Aluguel', amount: 1800, type: 'EXPENSE', frequency: 'MONTHLY', categoryId: home.id, startDate: start })
      .expect(201);

    const thisMonth = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    const res = await feed(joao, `${thisMonth}-01T00:00:00-03:00`, `${next.toISOString().slice(0, 7)}-01T00:00:00-03:00`).expect(200);
    const rent = res.body.bills.filter((b: { description: string }) => b.description === 'Aluguel');
    expect(rent).toHaveLength(2);
    expect(rent[0]).toMatchObject({ date: `${thisMonth}-01`, done: true, amount: '1800.00' });
    expect(rent[1].done).toBe(false);
  });

  it('validates times and windows', async () => {
    const base = { title: 'X', startAt: '2026-10-02T22:00:00-03:00' };
    await ctx.http().post('/api/events').set(ana.auth).send({ ...base, endAt: '2026-10-02T21:00:00-03:00' }).expect(400);
    // No time zone: ambiguous, refused.
    await ctx.http().post('/api/events').set(ana.auth).send({ title: 'X', startAt: '2026-10-02T22:00:00', endAt: '2026-10-02T23:00:00' }).expect(400);
    await feed(ana, '2026-01-01T00:00:00Z', '2027-06-01T00:00:00Z').expect(400);
    await feed(ana, '2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z').expect(400);
  });
});
