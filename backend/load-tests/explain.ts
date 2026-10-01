/**
 * EXPLAIN ANALYZE of the hot queries for the heavy user (100k rows), mirroring
 * what the services send. Run: npx tsx load-tests/explain.ts
 */
import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const QUERIES: Record<string, string> = {
  'monthly (12 months)': `
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM'), "type", SUM("amount")
    FROM transactions WHERE "userId" = $1 AND "date" >= '2025-10-01' AND "date" < '2026-10-01'
    GROUP BY 1, 2`,
  'balance (all time)': `
    SELECT "type", SUM("amount") FROM transactions
    WHERE "userId" = $1 AND "date" < '2026-10-01' GROUP BY "type"`,
  'by-category (9 months)': `
    SELECT "categoryId", SUM("amount"), COUNT(*) FROM transactions
    WHERE "userId" = $1 AND "type" = 'EXPENSE' AND "date" BETWEEN '2026-01-01' AND '2026-09-30'
    GROUP BY "categoryId"`,
  'list page 1': `
    SELECT * FROM transactions WHERE "userId" = $1
    ORDER BY "date" DESC, "createdAt" DESC LIMIT 20`,
  'list count': `SELECT COUNT(*) FROM transactions WHERE "userId" = $1`,
};

await client.connect();
const { rows } = await client.query(`SELECT id FROM users WHERE email = 'heavy@fintrack.dev'`);
const userId = rows[0].id;
await client.query('ANALYZE transactions');

for (const [name, sql] of Object.entries(QUERIES)) {
  const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, [userId]);
  const lines = plan.rows.map((r) => r['QUERY PLAN'] as string);
  const scans = lines.filter((l) => /Scan|Sort|Aggregate/.test(l)).map((l) => l.trim().split('  (')[0]);
  const time = lines.find((l) => l.startsWith('Execution Time'));
  console.log(`\n## ${name}  —  ${time}\n  ${scans.join('\n  ')}`);
}
await client.end();
