import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/**
 * Calendar sharing without sharing finances: two people in separate
 * households see each other's shared events, and nothing else.
 */
describe('Calendar sharing (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let bia: Session;
  let eve: Session;
  let dinnerId: string;
  let privateId: string;

  const event = (s: Session, title: string, visibility: 'SHARED' | 'PRIVATE', day = '2026-10-09') =>
    ctx
      .http()
      .post('/api/events')
      .set(s.auth)
      .send({ title, startAt: `${day}T22:00:00-03:00`, endAt: `${day}T23:30:00-03:00`, visibility })
      .expect(201)
      .then((r) => r.body as { id: string });
  const feed = (s: Session) =>
    ctx
      .http()
      .get('/api/calendar?from=2026-10-01T00:00:00-03:00&to=2026-11-01T00:00:00-03:00')
      .set(s.auth)
      .expect(200)
      .then((r) => r.body as { events: Array<{ id: string; title: string; isMine: boolean; createdBy: { name: string } }>; bills: unknown[] });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    ana = await registerUser(ctx, 'Ana');
    bia = await registerUser(ctx, 'Bia');
    eve = await registerUser(ctx, 'Eve');

    dinnerId = (await event(ana, 'Jantar sexta', 'SHARED')).id;
    privateId = (await event(ana, 'Presente surpresa', 'PRIVATE')).id;
    // A bill of Ana's (finances must never leak to calendar partners).
    const { body: cats } = await ctx.http().get('/api/categories?type=EXPENSE').set(ana.auth).expect(200);
    await ctx
      .http()
      .post('/api/recurring')
      .set(ana.auth)
      .send({ description: 'Aluguel da Ana', amount: 1500, type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cats.data[0].id, startDate: '2026-10-20' })
      .expect(201);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('before sharing, nobody sees anybody', async () => {
    expect((await feed(bia)).events).toHaveLength(0);
    await ctx.http().get(`/api/events/${dinnerId}`).set(bia.auth).expect(404);
  });

  it('a one-time code connects the two calendars (households stay separate)', async () => {
    const { body: invite } = await ctx.http().post('/api/calendar/shares/invites').set(ana.auth).expect(201);
    expect(invite.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const stored = await ctx.prisma.calendarInvite.findMany();
    expect(JSON.stringify(stored)).not.toContain(invite.code.replace('-', ''));

    const joined = await ctx.http().post('/api/calendar/shares/join').set(bia.auth).send({ code: invite.code }).expect(200);
    expect(joined.body.partners).toEqual([expect.objectContaining({ userId: ana.user.id, name: 'Ana' })]);
    const anaSide = await ctx.http().get('/api/calendar/shares').set(ana.auth).expect(200);
    expect(anaSide.body.partners).toEqual([expect.objectContaining({ userId: bia.user.id, name: 'Bia' })]);

    // Finances untouched: each one still has their own household.
    const anaHousehold = await ctx.http().get('/api/household').set(ana.auth).expect(200);
    expect(anaHousehold.body.members).toHaveLength(1);
    await ctx.http().post('/api/calendar/shares/join').set(eve.auth).send({ code: invite.code }).expect(404); // single use
  });

  it('the partner sees shared events only: no private events, no bills', async () => {
    const view = await feed(bia);
    expect(view.events.map((e) => e.title)).toEqual(['Jantar sexta']);
    expect(view.events[0]).toMatchObject({ isMine: false, createdBy: { name: 'Ana' } });
    expect(view.bills).toHaveLength(0);
    await ctx.http().get(`/api/events/${privateId}`).set(bia.auth).expect(404);
    // And Ana's money stays invisible.
    const { body: txs } = await ctx.http().get('/api/recurring').set(bia.auth).expect(200);
    expect(txs).toHaveLength(0);
  });

  it('both sides see each other\'s shared events and can edit them', async () => {
    const lunch = await event(bia, 'Almoço com a sogra', 'SHARED', '2026-10-11');
    expect((await feed(ana)).events.map((e) => e.title)).toContain('Almoço com a sogra');

    await ctx.http().patch(`/api/events/${dinnerId}`).set(bia.auth).send({ title: 'Jantar sexta (japonês)' }).expect(200);
    expect((await feed(ana)).events.map((e) => e.title)).toContain('Jantar sexta (japonês)');
    // Only the creator can make it private (it would vanish for its owner).
    await ctx.http().patch(`/api/events/${lunch.id}`).set(ana.auth).send({ visibility: 'PRIVATE' }).expect(400);
    await ctx.http().patch(`/api/events/${privateId}`).set(bia.auth).send({ title: 'x' }).expect(404);
  });

  it('third parties see nothing', async () => {
    expect((await feed(eve)).events).toHaveLength(0);
    await ctx.http().get(`/api/events/${dinnerId}`).set(eve.auth).expect(404);
    await ctx.http().patch(`/api/events/${dinnerId}`).set(eve.auth).send({ title: 'hack' }).expect(404);
    await ctx.http().delete(`/api/events/${dinnerId}`).set(eve.auth).expect(404);
  });

  it('rejects own, reused, unknown and malformed codes', async () => {
    const { body: own } = await ctx.http().post('/api/calendar/shares/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/calendar/shares/join').set(ana.auth).send({ code: own.code }).expect(409);
    await ctx.http().post('/api/calendar/shares/join').set(bia.auth).send({ code: own.code }).expect(409); // already sharing
    await ctx.http().post('/api/calendar/shares/join').set(eve.auth).send({ code: 'ABCD-EFGH' }).expect(404);
    await ctx.http().post('/api/calendar/shares/join').set(eve.auth).send({ code: 'nope' }).expect(400);
  });

  it('either side can stop sharing, and access ends immediately', async () => {
    await ctx.http().delete(`/api/calendar/shares/${eve.user.id}`).set(bia.auth).expect(404);
    const res = await ctx.http().delete(`/api/calendar/shares/${ana.user.id}`).set(bia.auth).expect(200);
    expect(res.body.partners).toHaveLength(0);
    expect((await feed(bia)).events.map((e) => e.title)).toEqual(['Almoço com a sogra']);
    await ctx.http().get(`/api/events/${dinnerId}`).set(bia.auth).expect(404);
  });

  it('the demo account cannot share its calendar', async () => {
    await ctx.prisma.user.update({ where: { id: eve.user.id }, data: { email: 'demo@fintrack.dev' } });
    await ctx.http().post('/api/calendar/shares/invites').set(eve.auth).expect(403);
    const res = await ctx.http().get('/api/calendar/shares').set(eve.auth).expect(200);
    expect(res.body.invitesEnabled).toBe(false);
  });
});
