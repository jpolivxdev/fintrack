import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../src/investments/yield-engine.js';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;
const today = () => new Date().toISOString().slice(0, 10);

/** Full household backup: export from one account, restore into another. */
describe('Backup (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let bia: Session;
  let novo: Session;
  let file: Record<string, unknown> & { transactions: unknown[]; events: Array<{ title: string }> };

  const get = (s: Session, path: string) => ctx.http().get(path).set(s.auth).expect(200).then((r) => r.body);

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    ana = await registerUser(ctx, 'Ana');
    bia = await registerUser(ctx, 'Bia');
    novo = await registerUser(ctx, 'Novo');

    // Ana's household: Bia joins, so there is someone else's private event to keep out.
    const { body: invite } = await ctx.http().post('/api/household/invites').set(ana.auth).expect(201);
    await ctx.http().post('/api/household/join').set(bia.auth).send({ code: invite.code }).expect(200);

    const { body: accounts } = await ctx.http().get('/api/accounts').set(ana.auth).expect(200);
    const checking = accounts.data[0].id;
    const card = (await ctx.http().post('/api/accounts').set(ana.auth).send({ name: 'Cartão', type: 'CREDIT_CARD' }).expect(201)).body.id;
    const pets = (await ctx.http().post('/api/categories').set(ana.auth).send({ name: 'Pets', type: 'EXPENSE', color: '#22c55e', icon: 'paw-print' }).expect(201)).body.id;
    const { body: cats } = await ctx.http().get('/api/categories?type=INCOME').set(ana.auth).expect(200);

    await ctx.http().post('/api/transactions').set(ana.auth).send({ description: 'Ração', amount: 120, type: 'EXPENSE', date: addDays(today(), -10), categoryId: pets, accountId: checking }).expect(201);
    await ctx.http().post('/api/transactions').set(ana.auth).send({ description: 'Notebook', amount: 3000, type: 'EXPENSE', date: addDays(today(), -40), categoryId: pets, accountId: card, installments: 3 }).expect(201);
    await ctx.http().post('/api/recurring').set(ana.auth).send({ description: 'Salário', amount: 5000, type: 'INCOME', frequency: 'MONTHLY', categoryId: cats.data[0].id, accountId: checking, startDate: addDays(today(), -65) }).expect(201);
    await ctx.http().post('/api/transfers').set(ana.auth).send({ fromAccountId: checking, toAccountId: card, amount: 800, date: addDays(today(), -5) }).expect(201);
    await ctx.http().post('/api/budgets').set(ana.auth).send({ categoryId: pets, year: Number(today().slice(0, 4)), month: Number(today().slice(5, 7)), monthlyLimit: 300 }).expect(201);
    const goal = (await ctx.http().post('/api/goals').set(ana.auth).send({ name: 'Viagem', targetAmount: 5000 }).expect(201)).body;
    await ctx.http().post(`/api/goals/${goal.id}/contributions`).set(ana.auth).send({ amount: 700, date: addDays(today(), -3) }).expect(201);
    const inv = (await ctx.http().post('/api/investments').set(ana.auth).send({ name: 'CDB', assetClass: 'FIXED_INCOME', yieldMode: 'CDI_PERCENT', rate: 110, startDate: addDays(today(), -30), initialAmount: 1000, fromAccountId: checking }).expect(201)).body;
    await ctx.http().post('/api/recurring').set(ana.auth).send({ description: 'Aporte', amount: 100, type: 'EXPENSE', frequency: 'MONTHLY', accountId: checking, toAccountId: inv.account.id, startDate: addDays(today(), -35) }).expect(201);
    await ctx.http().post(`/api/investments/${inv.id}/valuations`).set(ana.auth).send({ date: addDays(today(), -1), value: 1250 }).expect(201);
    const at = (d: number, h: string) => `${addDays(today(), d)}T${h}:00-03:00`;
    await ctx.http().post('/api/events').set(ana.auth).send({ title: 'Jantar', startAt: at(2, '20:00'), endAt: at(2, '22:00'), visibility: 'SHARED' }).expect(201);
    await ctx.http().post('/api/events').set(ana.auth).send({ title: 'Meu privado', startAt: at(3, '10:00'), endAt: at(3, '11:00'), visibility: 'PRIVATE' }).expect(201);
    await ctx.http().post('/api/events').set(bia.auth).send({ title: 'Segredo da Bia', startAt: at(4, '10:00'), endAt: at(4, '11:00'), visibility: 'PRIVATE' }).expect(201);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('exports the whole household as a downloadable file, without other people\'s private events', async () => {
    const res = await ctx.http().get('/api/backup').set(ana.auth).expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="fintrack-backup-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers['cache-control']).toBe('no-store');
    file = res.body;
    expect(file).toMatchObject({ kind: 'fintrack-backup', version: 1, exportedBy: 'Ana' });
    expect(file.events.map((e) => e.title).sort()).toEqual(['Jantar', 'Meu privado']);
    expect((file.transactions as unknown[]).length).toBeGreaterThanOrEqual(6); // ração + 3 parcelas + salários
  });

  it('restores everything into another account, with the same balances and investment value', async () => {
    const before = await get(ana, '/api/accounts');
    const portfolioBefore = await get(ana, '/api/investments');

    const res = await ctx.http().post('/api/backup/restore').set(novo.auth).send(file).expect(200);
    expect(res.body).toMatchObject({ accounts: 4, transfers: expect.any(Number), recurring: 2, goals: 1, investments: 1, events: 2, budgets: 1 });

    const after = await get(novo, '/api/accounts');
    const balances = (list: { data: Array<{ name: string; balance: string }> }) =>
      list.data.map((a) => `${a.name}=${a.balance}`).sort();
    expect(balances(after)).toEqual(balances(before)); // the empty default account was dropped
    const portfolio = await get(novo, '/api/investments');
    expect(portfolio.summary.value).toBe(portfolioBefore.summary.value);
    expect(portfolio.summary.invested).toBe(portfolioBefore.summary.invested);

    const goals = await get(novo, '/api/goals');
    expect(goals[0]).toMatchObject({ name: 'Viagem', saved: '700.00' });
    const cats = await get(novo, '/api/categories?type=EXPENSE&limit=100');
    expect(cats.data.filter((c: { name: string }) => c.name === 'Alimentação')).toHaveLength(1); // reused, not duplicated
    expect(cats.data.find((c: { name: string }) => c.name === 'Pets')).toMatchObject({ icon: 'paw-print' });
  });

  it('keeps installments grouped and recurring rules continuing without duplicates', async () => {
    const txs = await get(novo, '/api/transactions?search=Notebook&limit=10');
    expect(txs.data).toHaveLength(3);
    expect(new Set(txs.data.map((t: { installment: { groupId: string } }) => t.installment.groupId)).size).toBe(1);

    const count = async () => (await get(novo, '/api/transactions?search=Sal%C3%A1rio&limit=100')).meta.total;
    const salaries = await count();
    // Any request materializes due rules; the restored rule must not recreate past dates.
    await get(novo, '/api/recurring');
    await new Promise((r) => setTimeout(r, 50));
    expect(await count()).toBe(salaries);
    const rules = await get(novo, '/api/recurring');
    expect(rules.find((r: { description: string }) => r.description === 'Salário').generatedCount).toBe(salaries);
  });

  it('rejects inconsistent or foreign files and leaves nothing behind', async () => {
    const broken = structuredClone(file) as typeof file & { transactions: Array<Record<string, unknown>> };
    broken.transactions[0].accountRef = 'nao-existe';
    const other = await registerUser(ctx, 'Outra');
    const res = await ctx.http().post('/api/backup/restore').set(other.auth).send(broken).expect(400);
    expect(res.body.message).toMatch(/Invalid backup/);
    expect((await get(other, '/api/transactions')).meta.total).toBe(0);

    await ctx.http().post('/api/backup/restore').set(other.auth).send({ ...file, version: 2 }).expect(400);
    await ctx.http().post('/api/backup/restore').set(other.auth).send({ ...file, kind: 'vida-app' }).expect(400);
    const typeMismatch = structuredClone(file) as typeof file & { transactions: Array<Record<string, unknown>> };
    typeMismatch.transactions[0].type = typeMismatch.transactions[0].type === 'INCOME' ? 'EXPENSE' : 'INCOME';
    await ctx.http().post('/api/backup/restore').set(other.auth).send(typeMismatch).expect(400);
    await ctx.http().post('/api/backup/restore').set(other.auth).send({ ...file, accounts: [{ ...(file.accounts as object[])[0], ownerId: 'x' }] }).expect(400); // unknown field
    await ctx.http().post('/api/backup/restore').send(file).expect(401);
  });

  it('only touches the restoring user\'s household, and the demo account cannot restore', async () => {
    const anaTxs = (await get(ana, '/api/transactions')).meta.total;
    await ctx.prisma.user.update({ where: { id: bia.user.id }, data: { email: 'demo@fintrack.dev' } });
    await ctx.http().post('/api/backup/restore').set(bia.auth).send(file).expect(403);
    expect((await get(ana, '/api/transactions')).meta.total).toBe(anaTxs);
  });
});
