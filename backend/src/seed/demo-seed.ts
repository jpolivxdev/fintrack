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
import { randomBytes } from 'node:crypto';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
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
      transactions.push({
        householdId: household.id,
        // Roughly a third of the entries are registered by the partner.
        createdById: random() < 0.35 ? partner.id : user.id,
        categoryId: category.id,
        type: category.type,
        description,
        amount,
        date: dateOn(year, monthIndex, Math.min(day, lastDay)),
      });
    };

    for (const item of RECURRING) {
      if (isCurrent && item.day > lastDay && item.category !== 'Salário') continue;
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

  await prisma.transaction.createMany({ data: transactions });

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

  return `Seeded ${DEMO_EMAIL} (+ partner) with ${household.categories.length} categories, ${transactions.length} transactions and ${budgets.length} budgets.`;
}
