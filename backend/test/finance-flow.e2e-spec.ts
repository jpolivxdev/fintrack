import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/**
 * Main user journey: register → category → transactions → list/filter →
 * budget → reports, plus the guarantee that one user can never touch
 * another user's data.
 */
describe('Finance flow (e2e)', () => {
  let ctx: TestContext;
  let alice: Session;
  let bob: Session;
  let categoryId: string;
  let incomeCategoryId: string;
  let transactionId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    alice = await registerUser(ctx, 'Alice');
    bob = await registerUser(ctx, 'Bob');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('as the owner', () => {
    it('creates a category', async () => {
      const res = await ctx
        .http()
        .post('/api/categories')
        .set(alice.auth)
        .send({ name: 'Pets', type: 'EXPENSE', color: '#a855f7' })
        .expect(201);
      categoryId = res.body.id;
      expect(res.body).toMatchObject({ name: 'Pets', type: 'EXPENSE', transactionCount: 0 });

      const income = await ctx
        .http()
        .get('/api/categories?type=INCOME')
        .set(alice.auth)
        .expect(200);
      expect(income.body.data.every((c: { type: string }) => c.type === 'INCOME')).toBe(true);
      incomeCategoryId = income.body.data[0].id;
    });

    it('creates transactions with exact decimal amounts', async () => {
      const res = await ctx
        .http()
        .post('/api/transactions')
        .set(alice.auth)
        .send({
          description: 'Ração',
          amount: 0.1,
          type: 'EXPENSE',
          date: '2026-09-10',
          categoryId,
        })
        .expect(201);
      transactionId = res.body.id;
      expect(res.body).toMatchObject({ amount: '0.10', date: '2026-09-10' });

      await ctx
        .http()
        .post('/api/transactions')
        .set(alice.auth)
        .send({ description: 'Veterinário', amount: 0.2, type: 'EXPENSE', date: '2026-09-20', categoryId })
        .expect(201);
      await ctx
        .http()
        .post('/api/transactions')
        .set(alice.auth)
        .send({ description: 'Salário', amount: 5000, type: 'INCOME', date: '2026-09-05', categoryId: incomeCategoryId })
        .expect(201);
    });

    it('rejects a transaction whose type does not match the category', async () => {
      await ctx
        .http()
        .post('/api/transactions')
        .set(alice.auth)
        .send({ description: 'Errado', amount: 10, type: 'INCOME', date: '2026-09-10', categoryId })
        .expect(400);
    });

    it('rejects amounts with more than 2 decimals or not positive', async () => {
      for (const amount of [10.123, 0, -5]) {
        await ctx
          .http()
          .post('/api/transactions')
          .set(alice.auth)
          .send({ description: 'X', amount, type: 'EXPENSE', date: '2026-09-10', categoryId })
          .expect(400);
      }
    });

    it('lists with filters, pagination and totals (0.1 + 0.2 = 0.30 exactly)', async () => {
      const res = await ctx
        .http()
        .get('/api/transactions')
        .query({ categoryId, startDate: '2026-09-01', endDate: '2026-09-30', limit: 1, sortBy: 'amount', order: 'asc' })
        .set(alice.auth)
        .expect(200);

      expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 1, totalPages: 2 });
      expect(res.body.data[0].description).toBe('Ração');
      expect(res.body.totals).toEqual({ income: '0.00', expense: '0.30', net: '-0.30' });
    });

    it('searches by description', async () => {
      const res = await ctx
        .http()
        .get('/api/transactions?search=veter')
        .set(alice.auth)
        .expect(200);
      expect(res.body.data.map((t: { description: string }) => t.description)).toEqual(['Veterinário']);
    });

    it('creates a budget and tracks its progress', async () => {
      const res = await ctx
        .http()
        .post('/api/budgets')
        .set(alice.auth)
        .send({ categoryId, year: 2026, month: 9, monthlyLimit: 0.35 })
        .expect(201);
      expect(res.body).toMatchObject({
        monthlyLimit: '0.35',
        spent: '0.30',
        remaining: '0.05',
        percentUsed: 85.71,
        status: 'WARNING',
      });

      await ctx
        .http()
        .post('/api/budgets')
        .set(alice.auth)
        .send({ categoryId: incomeCategoryId, year: 2026, month: 9, monthlyLimit: 100 })
        .expect(400);
    });

    it('reflects everything in the reports', async () => {
      const summary = await ctx
        .http()
        .get('/api/reports/summary?year=2026&month=9')
        .set(alice.auth)
        .expect(200);
      expect(summary.body).toMatchObject({
        income: '5000.00',
        expense: '0.30',
        net: '4999.70',
        balance: '4999.70',
        transactionCount: 3,
      });

      const byCategory = await ctx
        .http()
        .get('/api/reports/by-category?startDate=2026-09-01&endDate=2026-09-30')
        .set(alice.auth)
        .expect(200);
      expect(byCategory.body.categories).toEqual([
        expect.objectContaining({ name: 'Pets', total: '0.30', count: 2, percentage: 100 }),
      ]);

      const monthly = await ctx
        .http()
        .get('/api/reports/monthly?year=2026&month=10&months=2')
        .set(alice.auth)
        .expect(200);
      expect(monthly.body.months.map((m: { period: string; balance: string }) => [m.period, m.balance])).toEqual([
        ['2026-09', '4999.70'],
        ['2026-10', '4999.70'],
      ]);
    });

    it('updates a transaction', async () => {
      const res = await ctx
        .http()
        .patch(`/api/transactions/${transactionId}`)
        .set(alice.auth)
        .send({ amount: 15.5, notes: 'Pacote grande' })
        .expect(200);
      expect(res.body).toMatchObject({ amount: '15.50', notes: 'Pacote grande' });
    });

    it('refuses to delete a category that still has transactions', async () => {
      await ctx.http().delete(`/api/categories/${categoryId}`).set(alice.auth).expect(409);
    });
  });

  describe('data isolation between users', () => {
    it("Bob cannot read, update or delete Alice's transaction", async () => {
      await ctx.http().get(`/api/transactions/${transactionId}`).set(bob.auth).expect(404);
      await ctx
        .http()
        .patch(`/api/transactions/${transactionId}`)
        .set(bob.auth)
        .send({ amount: 1 })
        .expect(404);
      await ctx.http().delete(`/api/transactions/${transactionId}`).set(bob.auth).expect(404);

      // Still intact for Alice.
      const res = await ctx.http().get(`/api/transactions/${transactionId}`).set(alice.auth).expect(200);
      expect(res.body.amount).toBe('15.50');
    });

    it("Bob cannot use Alice's category", async () => {
      await ctx.http().get(`/api/categories/${categoryId}`).set(bob.auth).expect(404);
      await ctx
        .http()
        .post('/api/transactions')
        .set(bob.auth)
        .send({ description: 'Hack', amount: 1, type: 'EXPENSE', date: '2026-09-10', categoryId })
        .expect(404);
      await ctx
        .http()
        .post('/api/budgets')
        .set(bob.auth)
        .send({ categoryId, year: 2026, month: 9, monthlyLimit: 1 })
        .expect(404);
    });

    it("Bob's listings and reports contain none of Alice's data", async () => {
      const list = await ctx.http().get('/api/transactions').set(bob.auth).expect(200);
      expect(list.body.meta.total).toBe(0);

      const summary = await ctx
        .http()
        .get('/api/reports/summary?year=2026&month=9')
        .set(bob.auth)
        .expect(200);
      expect(summary.body).toMatchObject({ income: '0.00', expense: '0.00', transactionCount: 0 });

      const budgets = await ctx.http().get('/api/budgets?year=2026&month=9').set(bob.auth).expect(200);
      expect(budgets.body.data).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('deletes the transactions and then the category', async () => {
      const list = await ctx.http().get(`/api/transactions?categoryId=${categoryId}`).set(alice.auth);
      for (const t of list.body.data) {
        await ctx.http().delete(`/api/transactions/${t.id}`).set(alice.auth).expect(204);
      }
      await ctx.http().delete(`/api/categories/${categoryId}`).set(alice.auth).expect(204);
      await ctx.http().get(`/api/categories/${categoryId}`).set(alice.auth).expect(404);
    });

    it('rejects malformed ids with 400', async () => {
      await ctx.http().get('/api/transactions/not-a-uuid').set(alice.auth).expect(400);
    });
  });
});
