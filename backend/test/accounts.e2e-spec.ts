import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const TODAY = isoDate(new Date());
const YESTERDAY = isoDate(new Date(Date.now() - 86_400_000));

describe('Accounts, transfers and installments (e2e)', () => {
  let ctx: TestContext;
  let me: Session;
  let other: Session;
  let checkingId: string;
  let cardId: string;
  let expenseCategoryId: string;
  let incomeCategoryId: string;

  const get = (path: string, s = me) => ctx.http().get(path).set(s.auth);
  const post = (path: string, body: object, s = me) => ctx.http().post(path).set(s.auth).send(body);
  const balanceOf = async (id: string) => (await get(`/api/accounts/${id}`).expect(200)).body;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    me = await registerUser(ctx, 'Me');
    other = await registerUser(ctx, 'Other');
    const cats = await get('/api/categories?limit=100').expect(200);
    expenseCategoryId = cats.body.data.find((c: { type: string }) => c.type === 'EXPENSE').id;
    incomeCategoryId = cats.body.data.find((c: { type: string }) => c.type === 'INCOME').id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('new households start with one active account', async () => {
    const res = await get('/api/accounts').expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ name: 'Conta principal', type: 'CHECKING', balance: '0.00', archived: false }),
    ]);
    checkingId = res.body.data[0].id;
  });

  it('computes balances from the initial balance and entries up to today', async () => {
    await ctx.http().patch(`/api/accounts/${checkingId}`).set(me.auth).send({ initialBalance: 1000 }).expect(200);
    cardId = (await post('/api/accounts', { name: 'Cartão', type: 'CREDIT_CARD' }).expect(201)).body.id;

    await post('/api/transactions', { description: 'Salário', amount: 3000, type: 'INCOME', date: YESTERDAY, categoryId: incomeCategoryId }).expect(201);
    await post('/api/transactions', { description: 'Mercado', amount: 250.5, type: 'EXPENSE', date: TODAY, categoryId: expenseCategoryId, accountId: cardId }).expect(201);

    expect((await balanceOf(checkingId)).balance).toBe('4000.00'); // default account got the salary
    expect((await balanceOf(cardId)).balance).toBe('-250.50');
  });

  it('transfers move money between accounts without touching income/expense', async () => {
    const before = (await get('/api/reports/summary').expect(200)).body;
    await post('/api/transfers', { fromAccountId: checkingId, toAccountId: cardId, amount: 250.5, date: TODAY, description: 'Fatura' }).expect(201);

    expect((await balanceOf(checkingId)).balance).toBe('3749.50');
    expect((await balanceOf(cardId)).balance).toBe('0.00');

    const after = (await get('/api/reports/summary').expect(200)).body;
    expect(after).toMatchObject({ income: before.income, expense: before.expense, balance: before.balance });
    // initial 1000 + 3000 − 250.50 (the transfer nets to zero)
    expect(after.balance).toBe('3749.50');

    const total = (await get('/api/accounts').expect(200)).body.totalBalance;
    expect(total).toBe('3749.50');
  });

  it('validates transfers', async () => {
    await post('/api/transfers', { fromAccountId: cardId, toAccountId: cardId, amount: 10, date: TODAY }).expect(400);
    const foreign = (await get('/api/accounts', other).expect(200)).body.data[0].id;
    await post('/api/transfers', { fromAccountId: checkingId, toAccountId: foreign, amount: 10, date: TODAY }).expect(404);
  });

  it('splits installment purchases exactly and lists them as upcoming', async () => {
    const res = await post('/api/transactions', {
      description: 'TV',
      amount: 1000,
      type: 'EXPENSE',
      date: TODAY,
      categoryId: expenseCategoryId,
      accountId: cardId,
      installments: 3,
    }).expect(201);
    expect(res.body).toMatchObject({ description: 'TV (1/3)', amount: '333.34', installment: { number: 1, total: 3 } });

    const group = await ctx.prisma.transaction.findMany({
      where: { installmentGroupId: res.body.installment.groupId },
      orderBy: { installmentNumber: 'asc' },
    });
    expect(group.map((t) => t.amount.toFixed(2))).toEqual(['333.34', '333.33', '333.33']);

    const card = await balanceOf(cardId);
    expect(card.balance).toBe('-333.34'); // only the installment due today
    expect(card.upcoming).toBe('-666.66'); // the next two months
  });

  it('only expenses can be split, and update ignores installments', async () => {
    await post('/api/transactions', { description: 'Bônus', amount: 900, type: 'INCOME', date: TODAY, categoryId: incomeCategoryId, installments: 3 }).expect(400);
  });

  it('deletes an installment, the following ones, or the whole purchase', async () => {
    const res = await post('/api/transactions', {
      description: 'Sofá', amount: 400, type: 'EXPENSE', date: TODAY, categoryId: expenseCategoryId, accountId: cardId, installments: 4,
    }).expect(201);
    const groupId = res.body.installment.groupId;
    const second = await ctx.prisma.transaction.findFirstOrThrow({ where: { installmentGroupId: groupId, installmentNumber: 2 } });

    await ctx.http().delete(`/api/transactions/${second.id}?scope=future`).set(me.auth).expect(204);
    expect(await ctx.prisma.transaction.count({ where: { installmentGroupId: groupId } })).toBe(1);

    await ctx.http().delete(`/api/transactions/${res.body.id}?scope=all`).set(me.auth).expect(204);
    expect(await ctx.prisma.transaction.count({ where: { installmentGroupId: groupId } })).toBe(0);
  });

  it("cannot use another household's account (BOLA)", async () => {
    const foreign = (await get('/api/accounts', other).expect(200)).body.data[0].id;
    await get(`/api/accounts/${foreign}`).expect(404);
    await post('/api/transactions', { description: 'X', amount: 1, type: 'EXPENSE', date: TODAY, categoryId: expenseCategoryId, accountId: foreign }).expect(404);
    await ctx.http().patch(`/api/accounts/${foreign}`).set(me.auth).send({ name: 'hijack' }).expect(404);
  });

  it('accounts with history are archived, not deleted; one active account must remain', async () => {
    await ctx.http().delete(`/api/accounts/${cardId}`).set(me.auth).expect(409);
    await ctx.http().patch(`/api/accounts/${cardId}`).set(me.auth).send({ archived: true }).expect(200);
    await post('/api/transactions', { description: 'X', amount: 1, type: 'EXPENSE', date: TODAY, categoryId: expenseCategoryId, accountId: cardId }).expect(400);

    const active = (await get('/api/accounts').expect(200)).body.data;
    expect(active.map((a: { id: string }) => a.id)).toEqual([checkingId]);
    const all = (await get('/api/accounts?includeArchived=true').expect(200)).body.data;
    expect(all).toHaveLength(2);
    const notArchived = (await get('/api/accounts?includeArchived=false').expect(200)).body.data;
    expect(notArchived).toHaveLength(1);

    await ctx.http().patch(`/api/accounts/${checkingId}`).set(me.auth).send({ archived: true }).expect(409);

    const empty = (await post('/api/accounts', { name: 'Vazia', type: 'CASH' }).expect(201)).body.id;
    await ctx.http().delete(`/api/accounts/${empty}`).set(me.auth).expect(204);
  });
});
