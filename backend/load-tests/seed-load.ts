/**
 * Volume data for load tests (LOCAL databases only).
 *
 * - 50 users  loadtest-{1..50}@fintrack.dev  ~300 transactions each
 * - 1 user    heavy@fintrack.dev             100,000 transactions over 5 years
 * Password for all: LoadTest@123
 *
 *   npm run load:seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

const url = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error('Refusing to seed load-test data into a non-local database');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const PASSWORD = 'LoadTest@123';
const LOAD_USERS = 50;
const TX_PER_LOAD_USER = 300;
const HEAVY_TX = 100_000;
const BATCH = 5_000;

let seed = 7;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};

async function createUser(email: string, passwordHash: string) {
  await prisma.user.deleteMany({ where: { email } });
  return prisma.user.create({
    data: {
      name: email.split('@')[0],
      email,
      passwordHash,
      categories: { createMany: { data: [...DEFAULT_CATEGORIES] } },
    },
    include: { categories: true },
  });
}

async function addTransactions(
  user: Awaited<ReturnType<typeof createUser>>,
  count: number,
  daysBack: number,
) {
  const today = Date.UTC(2026, 9, 1);
  let rows: Prisma.TransactionCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    // ~15% income, the rest spread over expense categories
    const income = random() < 0.15;
    const pool = user.categories.filter((c) => c.type === (income ? 'INCOME' : 'EXPENSE'));
    const category = pool[Math.floor(random() * pool.length)];
    rows.push({
      userId: user.id,
      categoryId: category.id,
      type: category.type,
      description: `${category.name} #${i}`,
      amount: new Prisma.Decimal((income ? 500 + random() * 6000 : 5 + random() * 400).toFixed(2)),
      date: new Date(today - Math.floor(random() * daysBack) * 86_400_000),
    });
    if (rows.length === BATCH) {
      await prisma.transaction.createMany({ data: rows });
      rows = [];
    }
  }
  if (rows.length) await prisma.transaction.createMany({ data: rows });
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (let n = 1; n <= LOAD_USERS; n++) {
    const user = await createUser(`loadtest-${n}@fintrack.dev`, passwordHash);
    await addTransactions(user, TX_PER_LOAD_USER, 365);
  }

  const heavy = await createUser('heavy@fintrack.dev', passwordHash);
  const expense = heavy.categories.filter((c) => c.type === 'EXPENSE');
  await prisma.budget.createMany({
    data: expense.map((c) => ({
      userId: heavy.id,
      categoryId: c.id,
      year: 2026,
      month: 9,
      monthlyLimit: new Prisma.Decimal(5000),
    })),
  });
  await addTransactions(heavy, HEAVY_TX, 5 * 365);

  const total = await prisma.transaction.count();
  console.log(`Load data ready: ${LOAD_USERS + 1} users, ${total} transactions in the table.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
