/**
 * Demo account with categories, ~7 months of realistic transactions and
 * budgets, so anyone evaluating the project sees real data right away.
 *
 *   Demo login: demo@fintrack.dev / Demo@1234
 *
 * Idempotent: the demo user is deleted (cascading to its data) and recreated,
 * with dates relative to today.
 */
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { buildInstallments } from '../transactions/installments.js';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL, DEMO_PASSWORD } from './demo-accounts.js';

const MONTHS_OF_HISTORY = 6; // plus the current month

/** Deterministic PRNG so every seed run produces the same data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let random = mulberry32(42);
const between = (min: number, max: number) => min + random() * (max - min);
const money = (min: number, max: number) => new Prisma.Decimal(between(min, max).toFixed(2));
const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];

interface Recurring {
  category: string;
  description: string;
  day: number;
  amount: () => Prisma.Decimal;
  chance?: number;
}

interface Variable {
  category: string;
  descriptions: string[];
  perMonth: [number, number];
  amount: [number, number];
}

const RECURRING: Recurring[] = [
  { category: 'Salário', description: 'Salário — Empresa XYZ', day: 5, amount: () => new Prisma.Decimal('6500.00') },
  { category: 'Moradia', description: 'Aluguel', day: 10, amount: () => new Prisma.Decimal('1800.00') },
  { category: 'Moradia', description: 'Conta de luz', day: 15, amount: () => money(140, 260) },
  { category: 'Moradia', description: 'Internet fibra', day: 12, amount: () => new Prisma.Decimal('109.90') },
  { category: 'Assinaturas', description: 'Netflix', day: 8, amount: () => new Prisma.Decimal('55.90') },
  { category: 'Assinaturas', description: 'Spotify', day: 8, amount: () => new Prisma.Decimal('21.90') },
  { category: 'Educação', description: 'Curso online', day: 20, amount: () => new Prisma.Decimal('199.00') },
  { category: 'Freelance', description: 'Projeto freelance', day: 22, amount: () => money(800, 2500), chance: 0.6 },
  { category: 'Investimentos', description: 'Dividendos', day: 28, amount: () => money(60, 180), chance: 0.8 },
];

const VARIABLE: Variable[] = [
  { category: 'Alimentação', descriptions: ['Supermercado', 'Feira', 'Padaria', 'iFood', 'Restaurante'], perMonth: [7, 11], amount: [25, 320] },
  { category: 'Transporte', descriptions: ['Uber', 'Combustível', 'Metrô', 'Estacionamento'], perMonth: [5, 9], amount: [15, 180] },
  { category: 'Lazer', descriptions: ['Cinema', 'Bar com amigos', 'Show', 'Jogo na Steam'], perMonth: [2, 5], amount: [40, 220] },
  { category: 'Saúde', descriptions: ['Farmácia', 'Consulta médica', 'Academia'], perMonth: [1, 3], amount: [30, 280] },
];

const BUDGETS: Record<string, number> = {
  Alimentação: 1600,
  Transporte: 600,
  Lazer: 400,
  Moradia: 2200,
  Assinaturas: 80,
};

type AccountKey = 'nubank' | 'card' | 'cash' | 'reserve';

/** Where each kind of entry is paid from, like a real person would. */
function accountFor(category: string, description: string): AccountKey {
  if (['Salário', 'Freelance', 'Investimentos'].includes(category)) return 'nubank';
  if (['Feira', 'Padaria', 'Metrô'].includes(description)) return 'cash';
  if (category === 'Moradia' || category === 'Educação') return 'nubank';
  return 'card';
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

function dateOn(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

export async function seedDemo(prisma: PrismaClient): Promise<string> {
  random = mulberry32(42);
  // Reset: remove the demo household (cascades to its data) and both members.
  const previous = await prisma.user.findMany({
    where: { email: { in: [DEMO_EMAIL, DEMO_PARTNER_EMAIL] } },
    select: { membership: { select: { householdId: true } } },
  });
  const householdIds = previous.flatMap((u) => (u.membership ? [u.membership.householdId] : []));
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [DEMO_EMAIL, DEMO_PARTNER_EMAIL] } } });

  // A shared household of two, so the "couple" features have something to show.
  const household = await prisma.household.create({
    data: {
      name: 'Casa Demo',
      categories: { createMany: { data: [...DEFAULT_CATEGORIES] } },
    },
    include: { categories: true },
  });
  const user = await prisma.user.create({
    data: {
      name: 'Conta Demo',
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      membership: { create: { householdId: household.id, role: 'OWNER' } },
    },
  });
  // The partner cannot log in: its password is random and never stored anywhere.
  const partner = await prisma.user.create({
    data: {
      name: 'Bia',
      email: DEMO_PARTNER_EMAIL,
      passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
      membership: { create: { householdId: household.id, role: 'MEMBER' } },
    },
  });
  const categoryByName = new Map(household.categories.map((c) => [c.name, c]));

  const createAccount = (data: Omit<Prisma.AccountUncheckedCreateInput, 'householdId'>) =>
    prisma.account.create({ data: { ...data, householdId: household.id } });
  const accounts: Record<AccountKey, { id: string }> = {
    nubank: await createAccount({ name: 'Nubank', type: 'CHECKING', color: '#8b5cf6', icon: 'landmark', initialBalance: new Prisma.Decimal('2500') }),
    card: await createAccount({ name: 'Cartão Nubank', type: 'CREDIT_CARD', color: '#a855f7', icon: 'credit-card' }),
    cash: await createAccount({ name: 'Carteira', type: 'CASH', color: '#22c55e', icon: 'wallet', initialBalance: new Prisma.Decimal('150') }),
    reserve: await createAccount({ name: 'Reserva de emergência', type: 'SAVINGS', color: '#3b82f6', icon: 'piggy-bank', initialBalance: new Prisma.Decimal('8000') }),
  };
  /** Card spending per month (up to today), paid by transfer the next month. */
  const cardSpend = new Map<string, Prisma.Decimal>();
  const todayMidnight = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const trackCard = (date: Date, amount: Prisma.Decimal) => {
    if (date > todayMidnight) return;
    cardSpend.set(monthKey(date), (cardSpend.get(monthKey(date)) ?? new Prisma.Decimal(0)).plus(amount));
  };

  const today = new Date();
  const transactions: Prisma.TransactionCreateManyInput[] = [];

  for (let offset = MONTHS_OF_HISTORY; offset >= 0; offset--) {
    const ref = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
    const year = ref.getUTCFullYear();
    const monthIndex = ref.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const isCurrent = offset === 0;
    // In the current month only use days that already happened.
    const lastDay = isCurrent ? today.getUTCDate() : daysInMonth;
    const share = lastDay / daysInMonth;

    const add = (categoryName: string, description: string, day: number, amount: Prisma.Decimal) => {
      const category = categoryByName.get(categoryName)!;
      const account = accountFor(categoryName, description);
      const date = dateOn(year, monthIndex, Math.min(day, lastDay));
      if (account === 'card') trackCard(date, amount);
      transactions.push({
        accountId: accounts[account].id,
        householdId: household.id,
        // Roughly a third of the entries are registered by the partner.
        createdById: random() < 0.35 ? partner.id : user.id,
        categoryId: category.id,
        type: category.type,
        description,
        amount,
        date,
      });
    };

    for (const item of RECURRING) {
      // Only what already happened this month (fixed entries also have rules for later dates).
      if (isCurrent && item.day > lastDay) continue;
      if (item.chance !== undefined && random() > item.chance) continue;
      add(item.category, item.description, item.day, item.amount());
    }

    for (const item of VARIABLE) {
      const count = Math.max(1, Math.round(between(...item.perMonth) * share));
      for (let i = 0; i < count; i++) {
        add(item.category, pick(item.descriptions), 1 + Math.floor(random() * lastDay), money(...item.amount));
      }
    }
  }

  // A notebook bought in 10x on the card, 4 months ago: past installments
  // weigh on past bills, future ones show up as "upcoming" on the card.
  const firstInstallment = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 18));
  const groupId = randomUUID();
  for (const part of buildInstallments(new Prisma.Decimal('3600'), 10, firstInstallment.toISOString().slice(0, 10))) {
    const date = new Date(`${part.date}T00:00:00.000Z`);
    trackCard(date, part.amount);
    transactions.push({
      householdId: household.id,
      createdById: user.id,
      accountId: accounts.card.id,
      categoryId: categoryByName.get('Educação')!.id,
      type: 'EXPENSE',
      description: `Notebook (${part.number}/${part.total})`,
      amount: part.amount,
      date,
      installmentGroupId: groupId,
      installmentNumber: part.number,
      installmentTotal: part.total,
    });
  }

  await prisma.transaction.createMany({ data: transactions });

  // Transfers: monthly savings into the reserve, and paying last month's card bill.
  const transfers: Prisma.TransferCreateManyInput[] = [];
  for (let offset = MONTHS_OF_HISTORY; offset >= 0; offset--) {
    const ref = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
    const reserveDay = dateOn(ref.getUTCFullYear(), ref.getUTCMonth(), 6);
    if (reserveDay <= todayMidnight) {
      transfers.push({
        householdId: household.id, createdById: user.id, fromAccountId: accounts.nubank.id, toAccountId: accounts.reserve.id,
        amount: new Prisma.Decimal('500'), date: reserveDay, description: 'Aporte na reserva',
      });
    }
    const billDay = dateOn(ref.getUTCFullYear(), ref.getUTCMonth(), 7);
    const previous = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1));
    const bill = cardSpend.get(monthKey(previous));
    if (bill && billDay <= todayMidnight) {
      transfers.push({
        householdId: household.id, createdById: random() < 0.5 ? partner.id : user.id,
        fromAccountId: accounts.nubank.id, toAccountId: accounts.card.id,
        amount: bill, date: billDay, description: 'Pagamento da fatura',
      });
    }
  }
  await prisma.transfer.createMany({ data: transfers });

  const firstMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - MONTHS_OF_HISTORY, 1));
  const monthDate = (offset: number, day: number) =>
    dateOn(today.getUTCFullYear(), today.getUTCMonth() + offset, day);
  await prisma.goal.create({
    data: {
      householdId: household.id,
      createdById: user.id,
      name: 'Viagem para o Chile',
      targetAmount: new Prisma.Decimal('12000'),
      targetDate: monthDate(9, 1),
      color: '#3b82f6',
      icon: 'plane',
      contributions: {
        create: [-5, -4, -3, -2, -1].map((offset, i) => ({
          amount: new Prisma.Decimal(i === 0 ? '2500' : '900'),
          date: monthDate(offset, 6),
          createdById: i % 2 ? partner.id : user.id,
          note: i === 0 ? 'Começo da meta' : null,
        })),
      },
    },
  });
  await prisma.goal.create({
    data: {
      householdId: household.id,
      createdById: partner.id,
      name: 'Celular novo',
      targetAmount: new Prisma.Decimal('4500'),
      targetDate: monthDate(3, 15),
      color: '#ec4899',
      icon: 'smartphone',
      contributions: {
        create: [
          { amount: new Prisma.Decimal('400'), date: monthDate(-2, 20), createdById: partner.id },
          { amount: new Prisma.Decimal('-150'), date: monthDate(-1, 3), createdById: partner.id, note: 'Imprevisto' },
        ],
      },
    },
  });

  // Fixed-amount entries become rules; variable ones (power bill, freelance) do not.
  const FIXED = ['Salário — Empresa XYZ', 'Aluguel', 'Internet fibra', 'Netflix', 'Spotify', 'Curso online'];
  const rules = RECURRING.filter((r) => FIXED.includes(r.description));
  for (const r of rules) {
    const startDate = dateOn(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth(), r.day);
    const thisMonth = dateOn(today.getUTCFullYear(), today.getUTCMonth(), r.day);
    const next = thisMonth > todayMidnight ? thisMonth : dateOn(today.getUTCFullYear(), today.getUTCMonth() + 1, r.day);
    const category = categoryByName.get(r.category)!;
    await prisma.recurringRule.create({
      data: {
        householdId: household.id,
        createdById: user.id,
        description: r.description,
        amount: r.amount(),
        type: category.type,
        frequency: 'MONTHLY',
        categoryId: category.id,
        accountId: accounts[accountFor(r.category, r.description)].id,
        startDate,
        nextRunDate: next,
      },
    });
  }

  // Budgets for the current and the previous month.
  const budgets: Prisma.BudgetCreateManyInput[] = [];
  for (const offset of [1, 0]) {
    const ref = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
    for (const [name, limit] of Object.entries(BUDGETS)) {
      budgets.push({
        householdId: household.id,
        categoryId: categoryByName.get(name)!.id,
        year: ref.getUTCFullYear(),
        month: ref.getUTCMonth() + 1,
        monthlyLimit: new Prisma.Decimal(limit),
      });
    }
  }
  await prisma.budget.createMany({ data: budgets });

  return `Seeded ${DEMO_EMAIL} (+ partner) with ${household.categories.length} categories, ${transactions.length} transactions, ${transfers.length} transfers and ${budgets.length} budgets.`;
}
