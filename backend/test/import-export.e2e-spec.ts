import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase, TestContext } from './e2e/test-app.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('Import and export (e2e)', () => {
  let ctx: TestContext;
  let me: Session;
  let other: Session;
  let accountId: string;
  let foodId: string;
  let salaryId: string;

  const importRows = (rows: object[], extra: object = {}, s = me) =>
    ctx.http().post('/api/transactions/import').set(s.auth).send({ accountId, rows, ...extra });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    me = await registerUser(ctx, 'Me');
    other = await registerUser(ctx, 'Other');
    accountId = (await ctx.http().get('/api/accounts').set(me.auth)).body.data[0].id;
    const cats = (await ctx.http().get('/api/categories?limit=100').set(me.auth)).body.data as Array<{ id: string; name: string }>;
    foodId = cats.find((c) => c.name === 'Alimentação')!.id;
    salaryId = cats.find((c) => c.name === 'Salário')!.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('import', () => {
    const statement = [
      { date: '2026-09-05', description: 'Salário', amount: 6500, externalId: 'OFX-1' },
      { date: '2026-09-10', description: 'Supermercado', amount: -320.45, category: 'alimentação', externalId: 'OFX-2' },
      { date: '2026-09-12', description: 'Pet shop', amount: -89.9, category: 'Pets', externalId: 'OFX-3' },
      { date: '2026-09-15', description: 'Padaria', amount: -18.5 }, // no bank id (CSV)
    ];

    it('creates valid rows, matches categories by name and reports the rest', async () => {
      const res = await importRows(statement, { defaultIncomeCategoryId: salaryId }).expect(200);
      expect(res.body).toEqual({
        created: 2,
        skipped: 0,
        errors: [
          { row: 2, message: 'No category for expense "Pets"' },
          { row: 3, message: 'No category for expense ""' },
        ],
      });
      const list = await ctx.http().get('/api/transactions?startDate=2026-09-01&endDate=2026-09-30').set(me.auth).expect(200);
      expect(list.body.totals).toEqual({ income: '6500.00', expense: '320.45', net: '6179.55' });
    });

    it('re-importing the same statement never duplicates', async () => {
      const res = await importRows(statement, { defaultIncomeCategoryId: salaryId, defaultExpenseCategoryId: foodId }).expect(200);
      // Salary and supermarket already there (bank ids); pet shop and bakery are new now.
      expect(res.body).toMatchObject({ created: 2, skipped: 2, errors: [] });

      const again = await importRows(statement, { defaultIncomeCategoryId: salaryId, defaultExpenseCategoryId: foodId }).expect(200);
      expect(again.body).toMatchObject({ created: 0, skipped: 4 });
    });

    it('skips duplicates inside the same file too', async () => {
      const row = { date: '2026-09-20', description: 'Uber', amount: -25, category: 'Transporte' };
      const res = await importRows([row, { ...row, description: '  UBER ' }]).expect(200);
      expect(res.body).toMatchObject({ created: 1, skipped: 1 });
    });

    it('validates rows strictly', async () => {
      await importRows([{ date: '15/09/2026', description: 'X', amount: -1 }]).expect(400);
      await importRows([{ date: '2026-09-15', description: 'X', amount: 0 }]).expect(400);
      await importRows([{ date: '2026-09-15', description: 'X', amount: -1, userId: other.user.id }]).expect(400);
      await importRows([]).expect(400);
      const tooMany = Array.from({ length: 501 }, (_, i) => ({ date: '2026-09-15', description: `Linha ${i}`, amount: -1 }));
      await importRows(tooMany).expect(400);
      await importRows([{ date: '2026-09-15', description: 'X', amount: -1 }], { defaultExpenseCategoryId: salaryId }).expect(400);
    });

    it("cannot import into another household's account (BOLA)", async () => {
      const theirs = (await ctx.http().get('/api/accounts').set(other.auth)).body.data[0].id;
      await ctx
        .http()
        .post('/api/transactions/import')
        .set(me.auth)
        .send({ accountId: theirs, rows: [{ date: '2026-09-15', description: 'X', amount: 10 }], defaultIncomeCategoryId: salaryId })
        .expect(404);
    });
  });

  describe('export', () => {
    it('downloads a Brazilian-Excel CSV with formula injection neutralized', async () => {
      await ctx
        .http()
        .post('/api/transactions')
        .set(me.auth)
        .send({ description: '=HYPERLINK("http://evil.example","clique")', amount: 10, type: 'EXPENSE', date: '2026-09-25', categoryId: foodId })
        .expect(201);

      const res = await ctx.http().get('/api/transactions/export?startDate=2026-09-01&endDate=2026-09-30').set(me.auth).expect(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="fintrack-transacoes-\d{4}-\d{2}-\d{2}\.csv"$/);

      const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe('Data;Descrição;Categoria;Tipo;Conta;Valor;Parcela;Observações;Registrado por');
      expect(lines[1]).toBe('05/09/2026;Salário;Salário;Receita;Conta principal;6500,00;;;Me');
      const malicious = lines.find((l) => l.includes('HYPERLINK'))!;
      expect(malicious.startsWith('25/09/2026;"\'=HYPERLINK(""http://evil.example"",""clique"")"')).toBe(true);
      expect(malicious).toContain(';-10,00;');
    });

    it('only exports your own household', async () => {
      const res = await ctx.http().get('/api/transactions/export').set(other.auth).expect(200);
      expect(res.text.replace(/^﻿/, '').trim().split('\r\n')).toHaveLength(1); // header only
    });
  });
});
