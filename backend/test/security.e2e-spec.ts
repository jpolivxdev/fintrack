import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/**
 * Security-focused end-to-end suite: injection, input validation,
 * mass assignment, stored XSS, authorization (BOLA) and authentication.
 */
describe('Security (e2e)', () => {
  let ctx: TestContext;
  let alice: Session;
  let expenseCategoryId: string;

  const createTransaction = (session: Session, body: Record<string, unknown>) =>
    ctx
      .http()
      .post('/api/transactions')
      .set(session.auth)
      .send({
        description: 'Default',
        amount: 10,
        type: 'EXPENSE',
        date: '2026-09-10',
        categoryId: expenseCategoryId,
        ...body,
      });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    alice = await registerUser(ctx, 'Alice');
    const categories = await ctx
      .http()
      .get('/api/categories?type=EXPENSE&limit=1')
      .set(alice.auth);
    expenseCategoryId = categories.body.data[0].id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('SQL injection', () => {
    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      '" OR 1=1 --',
      "1'; UPDATE transactions SET amount = 0; --",
      '%_\\',
    ];

    it.each(payloads)('stores %j as plain text', async (payload) => {
      const res = await createTransaction(alice, { description: payload, notes: payload }).expect(201);
      expect(res.body.description).toBe(payload);
      expect(res.body.notes).toBe(payload);
    });

    it('treats injection in the search filter as a literal string', async () => {
      const res = await ctx
        .http()
        .get('/api/transactions')
        .query({ search: "' OR '1'='1" })
        .set(alice.auth)
        .expect(200);
      // Only the row whose description literally contains the payload matches.
      expect(res.body.data.map((t: { description: string }) => t.description)).toEqual(["' OR '1'='1"]);
    });

    it('leaves the schema intact', async () => {
      expect(await ctx.prisma.user.count()).toBeGreaterThan(0);
      const amounts = await ctx.prisma.transaction.findMany({ select: { amount: true } });
      expect(amounts.every((t) => t.amount.toFixed(2) === '10.00')).toBe(true);
    });

    it('rejects injection through sort and enum parameters', async () => {
      await ctx.http().get('/api/transactions?sortBy=amount;DROP TABLE users').set(alice.auth).expect(400);
      await ctx.http().get("/api/transactions?type=EXPENSE' OR 1=1").set(alice.auth).expect(400);
      await ctx.http().get("/api/transactions?categoryId=1' OR '1'='1").set(alice.auth).expect(400);
    });
  });

  describe('Input validation', () => {
    it('rejects NUL and other control characters with 400 instead of a 500', async () => {
      await createTransaction(alice, { description: 'abc\u0000def' }).expect(400);
      await createTransaction(alice, { description: 'bell\u0007' }).expect(400);
      await ctx.http().get('/api/transactions').query({ search: 'a\u0000b' }).set(alice.auth).expect(400);
    });

    it('keeps line breaks in multiline notes', async () => {
      const res = await createTransaction(alice, { notes: 'line 1\nline 2\ttab' }).expect(201);
      expect(res.body.notes).toBe('line 1\nline 2\ttab');
    });

    it('accepts only calendar dates in YYYY-MM-DD', async () => {
      await createTransaction(alice, { date: '2026-10-01T23:59:00-03:00' }).expect(400);
      await createTransaction(alice, { date: '2026-02-30' }).expect(400);
      await createTransaction(alice, { date: '1850-01-01' }).expect(400);
      await createTransaction(alice, { date: '01/10/2026' }).expect(400);
    });

    it('rejects wrong types instead of coercing them', async () => {
      await createTransaction(alice, { amount: '10' }).expect(400);
      await createTransaction(alice, { amount: [10] }).expect(400);
      await createTransaction(alice, { description: { $ne: null } }).expect(400);
      await createTransaction(alice, { type: 'TRANSFER' }).expect(400);
    });

    it('enforces length limits', async () => {
      await createTransaction(alice, { description: 'x'.repeat(121) }).expect(400);
      await createTransaction(alice, { notes: 'x'.repeat(501) }).expect(400);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'a@a.dev', password: 'x'.repeat(129) })
        .expect(400);
    });

    it('rejects oversized bodies with 413', async () => {
      await createTransaction(alice, { description: 'x'.repeat(40 * 1024) }).expect(413);
    });

    it('rejects malformed JSON with 400', async () => {
      await ctx
        .http()
        .post('/api/transactions')
        .set(alice.auth)
        .set('Content-Type', 'application/json')
        .send('{"description": "broken"')
        .expect(400);
    });
  });

  describe('Mass assignment', () => {
    it('rejects fields that are not in the DTO (userId, role, id)', async () => {
      const bob = await registerUser(ctx, 'Bob');

      const res = await createTransaction(alice, { userId: bob.user.id }).expect(400);
      expect(res.body.message).toContain('property userId should not exist');

      await createTransaction(alice, { role: 'admin' }).expect(400);
      await createTransaction(alice, { id: '00000000-0000-0000-0000-000000000000' }).expect(400);
      await ctx
        .http()
        .post('/api/auth/register')
        .send({ name: 'Eve', email: 'eve@test.dev', password: 'Passw0rd!', role: 'admin' })
        .expect(400);

      expect(await ctx.prisma.transaction.count({ where: { userId: bob.user.id } })).toBe(0);
    });

    it('is not vulnerable to prototype pollution', async () => {
      await ctx
        .http()
        .post('/api/transactions')
        .set(alice.auth)
        .set('Content-Type', 'application/json')
        .send('{"description":"x","amount":1,"type":"EXPENSE","date":"2026-09-10","categoryId":"' +
          expenseCategoryId + '","__proto__":{"isAdmin":true}}')
        .expect((res) => expect([201, 400]).toContain(res.status));
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    });
  });

  describe('Stored XSS', () => {
    const xss = '<script>alert(document.cookie)</script><img src=x onerror=alert(1)>';

    it('stores markup verbatim and serves it only as JSON', async () => {
      const res = await createTransaction(alice, { description: xss }).expect(201);

      // Returned exactly as typed (no lossy server-side "sanitizing")...
      expect(res.body.description).toBe(xss);
      // ...inside a JSON document the browser is told never to sniff as HTML.
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
