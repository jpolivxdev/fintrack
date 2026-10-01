import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/**
 * Shared household ("couple") flow: invite → join with data merge → both see
 * the same data → leave / remove → access is gone immediately.
 */
describe('Household (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let joao: Session;
  let outsider: Session;

  const firstCategory = async (s: Session, type = 'EXPENSE', name?: string) => {
    const res = await ctx.http().get(`/api/categories?type=${type}&limit=100`).set(s.auth).expect(200);
    const list = res.body.data as Array<{ id: string; name: string }>;
    return name ? list.find((c) => c.name === name)! : list[0];
  };
  const addTx = async (s: Session, description: string, categoryId: string, amount = 50) =>
    (
      await ctx
        .http()
        .post('/api/transactions')
        .set(s.auth)
        .send({ description, amount, type: 'EXPENSE', date: '2026-09-10', categoryId })
        .expect(201)
    ).body;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    ana = await registerUser(ctx, 'Ana');
    joao = await registerUser(ctx, 'Joao');
    outsider = await registerUser(ctx, 'Outsider');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('every new account starts as owner of a personal household', async () => {
    const res = await ctx.http().get('/api/household').set(ana.auth).expect(200);
    expect(res.body).toMatchObject({ name: 'Casa de Ana', role: 'OWNER', invitesEnabled: true });
    expect(res.body.members).toEqual([expect.objectContaining({ name: 'Ana', role: 'OWNER', isYou: true })]);
  });

  it('only the owner can rename and invite', async () => {
    await ctx.http().patch('/api/household').set(ana.auth).send({ name: 'Casa da Ana e do João' }).expect(200);
    const invite = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    expect(invite.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // The code itself is never stored, only its hash.
    const stored = await ctx.prisma.householdInvite.findMany();
    expect(JSON.stringify(stored)).not.toContain(invite.body.code.replace('-', ''));
  });

  it('joining merges personal data: same-named categories unite, the rest moves', async () => {
    const anaFood = await firstCategory(ana, 'EXPENSE', 'Alimentação');
    await addTx(ana, 'Mercado da Ana', anaFood.id, 100);

    const joaoFood = await firstCategory(joao, 'EXPENSE', 'Alimentação');
    await addTx(joao, 'Feira do João', joaoFood.id, 40);
    const custom = await ctx
      .http()
      .post('/api/categories')
      .set(joao.auth)
      .send({ name: 'Games', type: 'EXPENSE' })
      .expect(201);
    await addTx(joao, 'Jogo novo', custom.body.id, 200);

    const { body: invite } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    const joined = await ctx
      .http()
      .post('/api/household/join')
      .set(joao.auth)
      .send({ code: invite.code.toLowerCase() }) // case and dash are ignored
      .expect(200);

    expect(joined.body.name).toBe('Casa da Ana e do João');
    expect(joined.body.role).toBe('MEMBER');
    expect(joined.body.members.map((m: { name: string }) => m.name)).toEqual(['Ana', 'Joao']);

    // Both now see the same three transactions...
    for (const s of [ana, joao]) {
      const list = await ctx.http().get('/api/transactions?startDate=2026-09-01&endDate=2026-09-30').set(s.auth).expect(200);
      expect(list.body.data.map((t: { description: string }) => t.description).sort()).toEqual(
        ['Feira do João', 'Jogo novo', 'Mercado da Ana'],
      );
    }
    // ...the two "Alimentação" categories became one, "Games" came along.
    const categories = await ctx.http().get('/api/categories?type=EXPENSE&limit=100').set(ana.auth).expect(200);
    const names = categories.body.data.map((c: { name: string }) => c.name);
    expect(names.filter((n: string) => n === 'Alimentação')).toHaveLength(1);
    expect(names).toContain('Games');
    const food = categories.body.data.find((c: { name: string }) => c.name === 'Alimentação');
    expect(food.transactionCount).toBe(2);

    // Who registered each entry is preserved.
    const list = await ctx.http().get('/api/transactions?search=Feira').set(ana.auth).expect(200);
    expect(list.body.data[0].createdBy).toEqual({ id: joao.user.id, name: 'Joao' });
  });

  it('an invite works only once', async () => {
    const { body: invite } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/household/join').set(outsider.auth).send({ code: invite.code }).expect(200);
    // Outsider leaves again so the next assertions stay simple.
    await ctx.http().post('/api/household/leave').set(outsider.auth).expect(200);

    const another = await registerUser(ctx, 'Late');
    await ctx.http().post('/api/household/join').set(another.auth).send({ code: invite.code }).expect(404);
  });

  it('rejects unknown, malformed and own-household codes', async () => {
    await ctx.http().post('/api/household/join').set(outsider.auth).send({ code: 'ABCD-EFGH' }).expect(404);
    await ctx.http().post('/api/household/join').set(outsider.auth).send({ code: 'nope' }).expect(400);
    const { body: invite } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/household/join').set(joao.auth).send({ code: invite.code }).expect(409);
  });

  it('members cannot invite, rename or remove others', async () => {
    await ctx.http().post('/api/household/invites').set(joao.auth).expect(403);
    await ctx.http().patch('/api/household').set(joao.auth).send({ name: 'Minha' }).expect(403);
    await ctx.http().delete(`/api/household/members/${ana.user.id}`).set(joao.auth).expect(403);
  });

  it('outsiders cannot see or touch the shared data (BOLA across households)', async () => {
    const shared = await ctx.http().get('/api/transactions?search=Mercado').set(ana.auth).expect(200);
    const txId = shared.body.data[0].id;
    await ctx.http().get(`/api/transactions/${txId}`).set(outsider.auth).expect(404);
    // The outsider owns their own household, so this is not a permission
    // problem: João is simply not a member there, and looks nonexistent.
    await ctx.http().delete(`/api/household/members/${joao.user.id}`).set(outsider.auth).expect(404);
  });

  it('a member who leaves loses access immediately and starts fresh', async () => {
    const shared = await ctx.http().get('/api/transactions?search=Mercado').set(ana.auth).expect(200);
    const txId = shared.body.data[0].id;
    await ctx.http().get(`/api/transactions/${txId}`).set(joao.auth).expect(200);

    const left = await ctx.http().post('/api/household/leave').set(joao.auth).expect(200);
    expect(left.body).toMatchObject({ name: 'Casa de Joao', role: 'OWNER' });

    // Same access token, but membership is checked on every request.
    await ctx.http().get(`/api/transactions/${txId}`).set(joao.auth).expect(404);
    const fresh = await ctx.http().get('/api/transactions').set(joao.auth).expect(200);
    expect(fresh.body.meta.total).toBe(0);
    // Shared data stays with the household.
    const kept = await ctx.http().get('/api/transactions?startDate=2026-09-01&endDate=2026-09-30').set(ana.auth).expect(200);
    expect(kept.body.meta.total).toBe(3);
  });

  it('the only member cannot leave', async () => {
    await ctx.http().post('/api/household/leave').set(joao.auth).expect(409);
  });

  it('the owner can remove a member; ownership passes on when the owner leaves', async () => {
    const { body: invite } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/household/join').set(joao.auth).send({ code: invite.code }).expect(200);

    const afterRemoval = await ctx.http().delete(`/api/household/members/${joao.user.id}`).set(ana.auth).expect(200);
    expect(afterRemoval.body.members).toHaveLength(1);

    const { body: invite2 } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/household/join').set(joao.auth).send({ code: invite2.code }).expect(200);
    await ctx.http().post('/api/household/leave').set(ana.auth).expect(200);

    const joaoView = await ctx.http().get('/api/household').set(joao.auth).expect(200);
    expect(joaoView.body.role).toBe('OWNER');
  });
});
