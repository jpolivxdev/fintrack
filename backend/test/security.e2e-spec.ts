import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

      expect(
        await ctx.prisma.transaction.count({
          where: { household: { members: { some: { userId: bob.user.id } } } },
        }),
      ).toBe(0);
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

  describe('Broken Object Level Authorization (BOLA / IDOR)', () => {
    let bob: Session;
    const owned: Record<'transactions' | 'categories' | 'budgets', string> = {
      transactions: '',
      categories: '',
      budgets: '',
    };
    const patchBodies = {
      transactions: { amount: 1, description: 'hijacked' },
      categories: { name: 'hijacked' },
      budgets: { monthlyLimit: 1 },
    };
    const MISSING_ID = '7f1c2b8e-3a4d-4f6b-9c1e-2d3f4a5b6c7d';

    beforeAll(async () => {
      bob = await registerUser(ctx, 'BobBola');
      const category = await ctx
        .http()
        .post('/api/categories')
        .set(alice.auth)
        .send({ name: 'Private', type: 'EXPENSE' })
        .expect(201);
      owned.categories = category.body.id;
      owned.transactions = (await createTransaction(alice, { categoryId: owned.categories, description: 'Secret' }).expect(201)).body.id;
      owned.budgets = (
        await ctx
          .http()
          .post('/api/budgets')
          .set(alice.auth)
          .send({ categoryId: owned.categories, year: 2026, month: 9, monthlyLimit: 500 })
          .expect(201)
      ).body.id;
    });

    const resources = ['transactions', 'categories', 'budgets'] as const;
    const verbs = ['get', 'patch', 'delete'] as const;
    const cases = resources.flatMap((resource) => verbs.map((verb) => [resource, verb] as const));

    const call = (session: Session, resource: (typeof resources)[number], verb: (typeof verbs)[number], id: string) => {
      const req = ctx.http()[verb](`/api/${resource}/${id}`).set(session.auth);
      return verb === 'patch' ? req.send(patchBodies[resource]) : req;
    };

    it.each(cases)("another user's %s → %s returns 404, indistinguishable from a missing id", async (resource, verb) => {
      const foreign = await call(bob, resource, verb, owned[resource]);
      const missing = await call(bob, resource, verb, MISSING_ID);

      expect(foreign.status).toBe(404);
      // Same status and same body: ids of other users cannot be enumerated.
      expect(foreign.body).toEqual(missing.body);
    });

    it("leaves the owner's data untouched after the attempts", async () => {
      const tx = await ctx.http().get(`/api/transactions/${owned.transactions}`).set(alice.auth).expect(200);
      expect(tx.body).toMatchObject({ description: 'Secret', amount: '10.00' });
      const category = await ctx.http().get(`/api/categories/${owned.categories}`).set(alice.auth).expect(200);
      expect(category.body.name).toBe('Private');
      const budget = await ctx.http().get(`/api/budgets/${owned.budgets}`).set(alice.auth).expect(200);
      expect(budget.body.monthlyLimit).toBe('500.00');
    });

    it("cannot reference another user's category when writing", async () => {
      await createTransaction(bob, { categoryId: owned.categories }).expect(404);
      await ctx
        .http()
        .post('/api/budgets')
        .set(bob.auth)
        .send({ categoryId: owned.categories, year: 2026, month: 10, monthlyLimit: 1 })
        .expect(404);

      const own = await ctx.http().get('/api/categories?type=EXPENSE&limit=1').set(bob.auth);
      const bobTx = (await createTransaction(bob, { categoryId: own.body.data[0].id }).expect(201)).body.id;
      // Moving his own transaction into Alice's category is blocked too.
      await ctx
        .http()
        .patch(`/api/transactions/${bobTx}`)
        .set(bob.auth)
        .send({ categoryId: owned.categories })
        .expect(404);
    });

    it("filters and reports never leak another user's data", async () => {
      const filtered = await ctx
        .http()
        .get(`/api/transactions?categoryId=${owned.categories}`)
        .set(bob.auth)
        .expect(200);
      expect(filtered.body.meta.total).toBe(0);

      const byCategory = await ctx
        .http()
        .get('/api/reports/by-category?startDate=2026-09-01&endDate=2026-09-30')
        .set(bob.auth)
        .expect(200);
      expect(byCategory.body.categories.map((c: { categoryId: string }) => c.categoryId)).not.toContain(owned.categories);

      const budgets = await ctx.http().get('/api/budgets?year=2026&month=9').set(bob.auth).expect(200);
      expect(budgets.body.data).toEqual([]);
    });
  });

  describe('Authentication and JWT', () => {
    const jwt = new JwtService({});
    const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
    let victim: Session;

    const getMe = (token: string) =>
      ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

    beforeAll(async () => {
      victim = await registerUser(ctx, 'Victim');
    });

    it('requires a token on protected routes', async () => {
      await ctx.http().get('/api/transactions').expect(401);
      await ctx.http().get('/api/reports/summary').set('Authorization', 'Bearer').expect(401);
      await ctx.http().get('/api/categories').set('Authorization', 'Basic dXNlcjpwYXNz').expect(401);
    });

    it('accepts a valid token', async () => {
      await getMe(victim.accessToken).expect(200);
    });

    it('rejects an expired token', async () => {
      const expired = await jwt.signAsync(
        { sub: victim.user.id, email: victim.email, iat: Math.floor(Date.now() / 1000) - 3600 },
        { secret: ACCESS_SECRET, expiresIn: '1s', algorithm: 'HS256' },
      );
      await getMe(expired).expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      const forged = await jwt.signAsync(
        { sub: victim.user.id, email: victim.email },
        { secret: 'attacker-guessed-secret-0123456789abcdef', algorithm: 'HS256' },
      );
      await getMe(forged).expect(401);
    });

    it('rejects a token whose payload was tampered with', async () => {
      const attacker = await registerUser(ctx, 'Attacker');
      const [header, , signature] = attacker.accessToken.split('.');
      // Same signature, payload swapped to impersonate the victim.
      const tampered = [header, b64url({ sub: victim.user.id, email: victim.email }), signature].join('.');
      await getMe(tampered).expect(401);
    });

    it('rejects "alg: none" and algorithm switching', async () => {
      const unsigned = [b64url({ alg: 'none', typ: 'JWT' }), b64url({ sub: victim.user.id }), ''].join('.');
      await getMe(unsigned).expect(401);

      const hs512 = await jwt.signAsync(
        { sub: victim.user.id, email: victim.email },
        { secret: ACCESS_SECRET, algorithm: 'HS512' },
      );
      await getMe(hs512).expect(401);
    });

    it('does not accept a refresh token as an access token', async () => {
      await getMe(victim.refreshToken).expect(401);
    });

    it("rejects tokens of a deleted user immediately", async () => {
      const doomed = await registerUser(ctx, 'Doomed');
      await getMe(doomed.accessToken).expect(200);

      await ctx.prisma.user.delete({ where: { id: doomed.user.id } });

      await getMe(doomed.accessToken).expect(401);
      await ctx.http().post('/api/auth/refresh').send({ refreshToken: doomed.refreshToken }).expect(401);
    });
  });

  describe('Rate limiting', () => {
    it('blocks the 6th login attempt from the same IP within the window', async () => {
      const ip = '203.0.113.10';
      const attempt = () =>
        ctx
          .http()
          .post('/api/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'target@test.dev', password: 'guess-1234' });

      for (let i = 0; i < 5; i++) await attempt().expect(401);
      const blocked = await attempt().expect(429);
      expect(blocked.body).toEqual({
        statusCode: 429,
        message: 'Too many requests, please try again later',
      });
      expect(blocked.headers['retry-after-credentials']).toBeDefined();
    });

    it('keeps serving other clients while one is blocked', async () => {
      await ctx
        .http()
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.11')
        .send({ email: 'target@test.dev', password: 'guess-1234' })
        .expect(401);
    });

    it('limits registration the same way', async () => {
      const ip = '203.0.113.20';
      for (let i = 0; i < 5; i++) {
        await ctx.http().post('/api/auth/register').set('X-Forwarded-For', ip).send({}).expect(400);
      }
      await ctx.http().post('/api/auth/register').set('X-Forwarded-For', ip).send({}).expect(429);
    });

    it('does not apply the strict limit to regular endpoints', async () => {
      const ip = '203.0.113.30';
      for (let i = 0; i < 8; i++) {
        await ctx.http().get('/api/transactions').set('X-Forwarded-For', ip).set(alice.auth).expect(200);
      }
    });
  });

  describe('Security headers, CORS and error responses', () => {
    it('sends a locked-down CSP and hardening headers on API responses', async () => {
      const res = await ctx.http().get('/api/health').expect(200);
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'",
      );
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
    });

    it('allows only configured origins', async () => {
      const allowed = await ctx.http().get('/api/health').set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();

      const evil = await ctx.http().get('/api/health').set('Origin', 'https://evil.example');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('restricts preflight methods and headers', async () => {
      const res = await ctx
        .http()
        .options('/api/transactions')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'PATCH');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
      expect(res.headers['access-control-allow-headers']).toBe('Authorization,Content-Type,X-Request-Id');
    });

    it('hides internals on unexpected errors and returns a requestId', async () => {
      const spy = vi
        .spyOn(ctx.prisma.transaction, 'findMany')
        .mockRejectedValueOnce(new Error('connection to db-internal.prod:5432 failed, password=hunter2'));

      const res = await ctx.http().get('/api/transactions').set(alice.auth).expect(500);
      spy.mockRestore();

      expect(res.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        requestId: res.headers['x-request-id'],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/hunter2|db-internal|stack/);
    });

    it('keeps useful messages for client errors', async () => {
      const notFound = await ctx
        .http()
        .get('/api/transactions/7f1c2b8e-3a4d-4f6b-9c1e-2d3f4a5b6c7d')
        .set(alice.auth)
        .expect(404);
      expect(notFound.body).toEqual({ statusCode: 404, message: 'Transaction not found', error: 'Not Found' });

      const tooLarge = await createTransaction(alice, { description: 'x'.repeat(40 * 1024) }).expect(413);
      expect(tooLarge.body).toEqual({
        statusCode: 413,
        message: 'request entity too large',
        error: 'Payload Too Large',
      });
    });
  });

  describe('Security audit logging', () => {
    it('logs failed logins with a masked email and never the password', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'someone.private@test.dev', password: 'Sup3rSecretGuess!' })
        .expect(401);

      const logged = JSON.stringify(warn.mock.calls);
      warn.mockRestore();
      expect(logged).toContain('login_failed');
      expect(logged).toContain('so***@test.dev');
      expect(logged).not.toContain('someone.private');
      expect(logged).not.toContain('Sup3rSecretGuess!');
    });

    it('raises an error-level event when a refresh token is reused', async () => {
      const error = vi.spyOn(Logger.prototype, 'error');
      const session = await registerUser(ctx, 'Reuse');
      await ctx.http().post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
      await ctx.http().post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);

      const logged = JSON.stringify(error.mock.calls);
      error.mockRestore();
      expect(logged).toContain('refresh_token_reuse_detected');
      expect(logged).toContain(session.user.id);
      expect(logged).not.toContain(session.refreshToken);
    });
  });
});
