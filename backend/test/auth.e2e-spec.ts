import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('registers, never stores the plain password, and seeds default categories', async () => {
    const res = await ctx
      .http()
      .post('/api/auth/register')
      .send({ name: 'Ana', email: '  ANA@Test.dev ', password: 'Passw0rd!' })
      .expect(201);

    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ana',
      email: 'ana@test.dev',
      createdAt: expect.any(String),
    });
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ana@test.dev' } });
    expect(stored.passwordHash).not.toContain('Passw0rd!');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/); // bcrypt, 10 rounds

    const categories = await ctx.prisma.category.count({ where: { userId: stored.id } });
    expect(categories).toBeGreaterThan(0);
  });

  it('rejects a duplicate email with 409', async () => {
    await ctx
      .http()
      .post('/api/auth/register')
      .send({ name: 'Ana 2', email: 'ana@test.dev', password: 'Passw0rd!' })
      .expect(409);
  });

  it('validates the payload and rejects unknown fields', async () => {
    const res = await ctx
      .http()
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short', isAdmin: true })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'property isAdmin should not exist',
        'email must be a valid email address',
      ]),
    );
  });

  it('logs in and reads the profile with the access token', async () => {
    const login = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'ana@test.dev', password: 'Passw0rd!' })
      .expect(200);

    const me = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('ana@test.dev');
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('rejects wrong credentials with a generic 401', async () => {
    const wrongPassword = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'ana@test.dev', password: 'Wrong123!' })
      .expect(401);
    const unknownEmail = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'ghost@test.dev', password: 'Wrong123!' })
      .expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('protects every non-auth route', async () => {
    await ctx.http().get('/api/auth/me').expect(401);
    await ctx.http().get('/api/transactions').expect(401);
    await ctx.http().get('/api/categories').set('Authorization', 'Bearer not-a-jwt').expect(401);
    await ctx.http().get('/api/health').expect(200);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { refreshToken } = await registerUser(ctx, 'Rotator');

    const first = await ctx.http().post('/api/auth/refresh').send({ refreshToken }).expect(200);
    const rotated = first.body.refreshToken as string;
    expect(rotated).not.toBe(refreshToken);

    // Reusing the original token is rejected...
    await ctx.http().post('/api/auth/refresh').send({ refreshToken }).expect(401);
    // ...and, as a theft signal, it also kills the newer session.
    await ctx.http().post('/api/auth/refresh').send({ refreshToken: rotated }).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await registerUser(ctx, 'Leaver');

    await ctx.http().post('/api/auth/logout').send({ refreshToken }).expect(204);
    await ctx.http().post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });
});
