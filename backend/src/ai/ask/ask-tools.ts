import { z } from 'zod';
import { formatDateOnly, parseDateOnly } from '../../common/utils/date.js';
import { formatMoney, toDecimal } from '../../common/utils/money.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AiToolDeclaration } from '../providers/ai-provider.js';
import { normalizeForMatch } from '../text.js';

/**
 * The only things the model can do: four read-only queries, written by us,
 * always filtered by the household of the logged-in user (which the model
 * never sees nor chooses). Arguments are validated strictly before running;
 * the model writes no SQL and touches no other table.
 */

export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const dateOnly = z
  .string()
  .regex(/^(20\d{2}|2100)-\d{2}-\d{2}$/)
  .refine((v) => formatDateOnly(parseDateOnly(v)) === v, 'data inexistente');

const period = z
  .object({ inicio: dateOnly, fim: dateOnly })
  .strict()
  .refine((p) => p.inicio <= p.fim, 'inicio depois de fim')
  .refine((p) => (parseDateOnly(p.fim).getTime() - parseDateOnly(p.inicio).getTime()) / DAY_MS < MAX_RANGE_DAYS, `período maior que ${MAX_RANGE_DAYS} dias`);

const periodShape = {
  inicio: { type: 'string', description: 'Data inicial, AAAA-MM-DD (inclusiva)' },
  fim: { type: 'string', description: 'Data final, AAAA-MM-DD (inclusiva). No máximo 366 dias depois do início' },
};

interface ToolDef {
  declaration: AiToolDeclaration;
  args: z.ZodType;
  run: (prisma: PrismaService, householdId: string, args: never) => Promise<unknown>;
}

type Period = { inicio: string; fim: string };
const dateFilter = (p: Period) => ({ gte: parseDateOnly(p.inicio), lte: parseDateOnly(p.fim) });

const TOOLS: Record<string, ToolDef> = {
  resumoDoPeriodo: {
    declaration: {
      name: 'resumoDoPeriodo',
      description: 'Total de receitas, despesas, saldo e quantidade de transações num período.',
      parameters: { type: 'object', properties: periodShape, required: ['inicio', 'fim'] },
    },
    args: period,
    run: async (prisma, householdId, p: Period) => {
      const groups = await prisma.transaction.groupBy({
        by: ['type'],
        where: { householdId, date: dateFilter(p) },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const income = toDecimal(groups.find((g) => g.type === 'INCOME')?._sum.amount);
      const expense = toDecimal(groups.find((g) => g.type === 'EXPENSE')?._sum.amount);
      return {
        periodo: p,
        receitas: formatMoney(income),
        despesas: formatMoney(expense),
        saldo: formatMoney(income.minus(expense)),
        transacoes: groups.reduce((n, g) => n + g._count._all, 0),
      };
    },
  },

  gastosPorCategoria: {
    declaration: {
      name: 'gastosPorCategoria',
      description: 'Despesas de um período agrupadas por categoria, da maior para a menor.',
      parameters: { type: 'object', properties: periodShape, required: ['inicio', 'fim'] },
    },
    args: period,
    run: async (prisma, householdId, p: Period) => {
      const [groups, categories] = await Promise.all([
        prisma.transaction.groupBy({
          by: ['categoryId'],
          where: { householdId, type: 'EXPENSE', date: dateFilter(p) },
          _sum: { amount: true },
        }),
        prisma.category.findMany({ where: { householdId }, select: { id: true, name: true } }),
      ]);
      const names = new Map(categories.map((c) => [c.id, c.name]));
      return {
        periodo: p,
        categorias: groups
          .map((g) => ({ categoria: names.get(g.categoryId) ?? 'Sem categoria', total: toDecimal(g._sum.amount) }))
          .sort((a, b) => b.total.comparedTo(a.total))
          .slice(0, 20)
          .map((g) => ({ categoria: g.categoria, total: formatMoney(g.total) })),
      };
    },
  },

  totalPorCategoria: {
    declaration: {
      name: 'totalPorCategoria',
      description: 'Total gasto (ou recebido) numa categoria específica num período. Use o nome da categoria.',
      parameters: {
        type: 'object',
        properties: { categoria: { type: 'string', description: 'Nome da categoria, ex.: Alimentação' }, ...periodShape },
        required: ['categoria', 'inicio', 'fim'],
      },
    },
    args: z
      .object({ categoria: z.string().min(1).max(60), inicio: dateOnly, fim: dateOnly })
      .strict()
      .refine((p) => p.inicio <= p.fim, 'inicio depois de fim')
      .refine((p) => (parseDateOnly(p.fim).getTime() - parseDateOnly(p.inicio).getTime()) / DAY_MS < MAX_RANGE_DAYS, `período maior que ${MAX_RANGE_DAYS} dias`),
    run: async (prisma, householdId, p: Period & { categoria: string }) => {
      const categories = await prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, type: true } });
      const wanted = normalizeForMatch(p.categoria);
      const matches = categories.filter((c) => normalizeForMatch(c.name) === wanted);
      if (matches.length === 0) {
        return { erro: 'Categoria não encontrada', categoriasDisponiveis: categories.map((c) => c.name).slice(0, 40) };
      }
      const agg = await prisma.transaction.aggregate({
        where: { householdId, categoryId: { in: matches.map((c) => c.id) }, date: dateFilter(p) },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return {
        periodo: { inicio: p.inicio, fim: p.fim },
        categoria: matches[0].name,
        tipo: matches[0].type === 'INCOME' ? 'receita' : 'despesa',
        total: formatMoney(agg._sum.amount),
        transacoes: agg._count._all,
      };
    },
  },

  maioresDespesas: {
    declaration: {
      name: 'maioresDespesas',
      description: 'As maiores despesas individuais de um período (no máximo 5).',
      parameters: {
        type: 'object',
        properties: { ...periodShape, limite: { type: 'integer', description: 'Quantas trazer, de 1 a 5' } },
        required: ['inicio', 'fim'],
      },
    },
    args: z
      .object({ inicio: dateOnly, fim: dateOnly, limite: z.number().int().min(1).max(5).optional() })
      .strict()
      .refine((p) => p.inicio <= p.fim, 'inicio depois de fim')
      .refine((p) => (parseDateOnly(p.fim).getTime() - parseDateOnly(p.inicio).getTime()) / DAY_MS < MAX_RANGE_DAYS, `período maior que ${MAX_RANGE_DAYS} dias`),
    run: async (prisma, householdId, p: Period & { limite?: number }) => {
      const rows = await prisma.transaction.findMany({
        where: { householdId, type: 'EXPENSE', date: dateFilter(p) },
        orderBy: [{ amount: 'desc' }, { date: 'desc' }],
        take: p.limite ?? 5,
        select: { description: true, amount: true, date: true, category: { select: { name: true } } },
      });
      return {
        periodo: { inicio: p.inicio, fim: p.fim },
        despesas: rows.map((r) => ({
          descricao: r.description.slice(0, 80),
          valor: formatMoney(r.amount),
          data: formatDateOnly(r.date),
          categoria: r.category.name,
        })),
      };
    },
  },
};

export const TOOL_DECLARATIONS: AiToolDeclaration[] = Object.values(TOOLS).map((t) => t.declaration);
export const TOOL_NAMES = Object.keys(TOOLS);

export type ToolOutcome =
  | { ok: true; args: unknown; result: unknown }
  | { ok: false; kind: 'unknown_tool' | 'invalid_args' | 'not_found'; result: unknown };

/** Validates and runs one tool call from the model. Never throws for bad input from the model. */
export async function runTool(prisma: PrismaService, householdId: string, name: string, args: unknown): Promise<ToolOutcome> {
  const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : undefined;
  if (!tool) return { ok: false, kind: 'unknown_tool', result: { erro: `Ferramenta inexistente. Use apenas: ${TOOL_NAMES.join(', ')}` } };
  const parsed = tool.args.safeParse(args);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, kind: 'invalid_args', result: { erro: `Parâmetros inválidos: ${issue?.path.join('.') || 'argumentos'} ${issue?.message ?? ''}`.trim() } };
  }
  const result = await tool.run(prisma, householdId, parsed.data as never);
  // A query that found nothing usable (e.g. a category this household doesn't have) is not data to show.
  if (result && typeof result === 'object' && 'erro' in result) return { ok: false, kind: 'not_found', result };
  return { ok: true, args: parsed.data, result };
}
