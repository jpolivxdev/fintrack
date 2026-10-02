import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, sentMail, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

const tokenFrom = (text: string) => text.match(/#token=([A-Za-z0-9_-]{43})/)![1];

/** Forgot password, invite lookup and the fair month-to-date summary. */
describe('Password reset, invite lookup and summary (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let bia: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    ana = await registerUser(ctx, 'Ana');
    bia = await registerUser(ctx, 'Bia');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const forgot = (email: string) => ctx.http().post('/api/auth/forgot-password').send({ email });
  const settle = () => new Promise((r) => setTimeout(r, 50)); // the e-mail goes out in the background

  it('exposes whether password reset is available', async () => {
    const res = await ctx.http().get('/api/auth/capabilities').expect(200);
    expect(res.body).toEqual({ passwordReset: true });
  });

  it('answers the same for known and unknown e-mails, and only mails the real one', async () => {
    sentMail.length = 0;
    const known = await forgot(ana.email).expect(202);
    const unknown = await forgot('ninguem@test.dev').expect(202);
    expect(known.body).toEqual(unknown.body);
    await settle();
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe(ana.email);
    expect(sentMail[0].text).toMatch(/\/redefinir-senha#token=/);
    // Only the hash is stored.
    const stored = await ctx.prisma.passwordResetToken.findMany();
    expect(JSON.stringify(stored)).not.toContain(tokenFrom(sentMail[0].text));
  });

  it('resets the password once, signs out every session, and the old password stops working', async () => {
    sentMail.length = 0;
    await forgot(ana.email).expect(202);
    await settle();
    const token = tokenFrom(sentMail[0].text);

    await ctx.http().post('/api/auth/reset-password').send({ token, password: 'fraca' }).expect(400);
    await ctx.http().post('/api/auth/reset-password').send({ token, password: 'N0vaSenha!' }).expect(200);
    await ctx.http().post('/api/auth/reset-password').send({ token, password: 'Outra123!' }).expect(400); // single use

    await ctx.http().post('/api/auth/refresh').send({ refreshToken: ana.refreshToken }).expect(401);
    await ctx.http().post('/api/auth/login').send({ email: ana.email, password: ana.password }).expect(401);
    await ctx.http().post('/api/auth/login').send({ email: ana.email, password: 'N0vaSenha!' }).expect(200);
  });

  it('only the newest link works, and links expire', async () => {
    sentMail.length = 0;
    await forgot(bia.email).expect(202);
    await forgot(bia.email).expect(202);
    await settle();
    const [older, newer] = sentMail.map((m) => tokenFrom(m.text));
    await ctx.http().post('/api/auth/reset-password').send({ token: older, password: 'N0vaSenha!' }).expect(400);

    await ctx.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await ctx.http().post('/api/auth/reset-password').send({ token: newer, password: 'N0vaSenha!' }).expect(400);
    await ctx.http().post('/api/auth/reset-password').send({ token: 'x'.repeat(43), password: 'N0vaSenha!' }).expect(400);
    await ctx.http().post('/api/auth/reset-password').send({ token: 'short', password: 'N0vaSenha!' }).expect(400);
  });

  it('the demo account never gets reset links', async () => {
    sentMail.length = 0;
    await ctx.prisma.user.update({ where: { id: bia.user.id }, data: { email: 'demo@fintrack.dev' } });
    await forgot('demo@fintrack.dev').expect(202);
    await settle();
    expect(sentMail).toHaveLength(0);
    await ctx.prisma.user.update({ where: { id: bia.user.id }, data: { email: bia.email } });
  });

  it('identifies an invite code without using it', async () => {
    const login = await ctx.http().post('/api/auth/login').send({ email: ana.email, password: 'N0vaSenha!' }).expect(200);
    const anaAuth = { Authorization: `Bearer ${login.body.accessToken}` };
    const { body: cal } = await ctx.http().post('/api/calendar/shares/invites').set(anaAuth).expect(201);
    const { body: hh } = await ctx.http().post('/api/household/invites').set(anaAuth).expect(201);

    const a = await ctx.http().post('/api/invites/lookup').set(bia.auth).send({ code: cal.code }).expect(200);
    expect(a.body).toEqual({ kind: 'CALENDAR', inviterName: 'Ana' });
    const b = await ctx.http().post('/api/invites/lookup').set(bia.auth).send({ code: hh.code.toLowerCase() }).expect(200);
    expect(b.body).toEqual({ kind: 'HOUSEHOLD', inviterName: 'Ana' });
    // Not consumed: it still works afterwards.
    await ctx.http().post('/api/calendar/shares/join').set(bia.auth).send({ code: cal.code }).expect(200);
    await ctx.http().post('/api/invites/lookup').set(bia.auth).send({ code: cal.code }).expect(404); // now used
    await ctx.http().post('/api/invites/lookup').set(bia.auth).send({ code: 'ABCD-EFGH' }).expect(404);
    await ctx.http().post('/api/invites/lookup').send({ code: hh.code }).expect(401);
  });

  it('summary compares the current month with the same days of the previous one', async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const { body: cats } = await ctx.http().get('/api/categories?type=EXPENSE').set(bia.auth).expect(200);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const add = (date: string, amount: number) =>
      ctx.http().post('/api/transactions').set(bia.auth).send({ description: 'x', amount, type: 'EXPENSE', date, categoryId: cats.data[0].id }).expect(201);

    // Previous month: one expense inside days 1..today, one after.
    const prevSameDay = new Date(Date.UTC(y, m - 2, Math.min(day, 28)));
    const prevLate = new Date(Date.UTC(y, m - 1, 0)); // last day of the previous month
    await add(iso(prevSameDay), 100);
    if (prevLate.getUTCDate() > Math.min(day, 28)) await add(iso(prevLate), 900);
    // This month: today, plus a future installment-like entry.
    await add(iso(now), 50);
    const future = new Date(Date.UTC(y, m - 1, day + 1));
    if (future.getUTCMonth() === m - 1) await add(iso(future), 70);

    const { body } = await ctx.http().get(`/api/reports/summary?year=${y}&month=${m}`).set(bia.auth).expect(200);
    expect(body.comparedThroughDay).toBe(Math.min(day, new Date(Date.UTC(y, m - 1, 0)).getUTCDate()));
    expect(body.previousMonth.expense).toBe('100.00');
    expect(body.toDate.expense).toBe('50.00');
    expect(body.expenseChange).toBe(-50);

    const past = await ctx.http().get(`/api/reports/summary?year=${prevLate.getUTCFullYear()}&month=${prevLate.getUTCMonth() + 1}`).set(bia.auth).expect(200);
    expect(past.body.comparedThroughDay).toBeNull();
    expect(past.body.toDate).toBeNull();
  });
});
