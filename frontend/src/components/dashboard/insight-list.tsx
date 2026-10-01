import { AlertTriangle, CalendarClock, CircleCheck, Info, Lightbulb, TrendingDown, TrendingUp, Trophy, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { formatDate, formatMoney, formatPercent } from '@/lib/format'
import type { Insight, InsightSeverity } from '@/lib/types'
import { cn } from '@/lib/utils'

const money = (v: unknown) => formatMoney(String(v ?? 0))
const pct = (v: unknown) => formatPercent(Number(v ?? 0))

/** Turns the API's structured insight into a sentence (the API stays language-neutral). */
export function phrase(insight: Insight): { title: string; detail: string; icon: LucideIcon } {
  const d = insight.data
  switch (insight.kind) {
    case 'BUDGET_EXCEEDED':
      return { icon: AlertTriangle, title: `Orçamento de ${d.categoryName} estourado`, detail: `${money(d.spent)} gastos de ${money(d.limit)} (${pct(d.percentUsed)}).` }
    case 'BUDGET_PACE':
      return { icon: TrendingUp, title: `${d.categoryName} vai passar do limite`, detail: `No ritmo atual, o mês fecha em ${money(d.projected)} de ${money(d.limit)}.` }
    case 'BUDGET_WARNING':
      return { icon: AlertTriangle, title: `${d.categoryName} perto do limite`, detail: `${pct(d.percentUsed)} do orçamento já foi usado.` }
    case 'CATEGORY_SPIKE':
      return { icon: TrendingUp, title: `${d.categoryName} acima do normal`, detail: `${money(d.current)} neste mês, ${pct(d.changePercent)} a mais que a média de ${money(d.average)}.` }
    case 'CATEGORY_DROP':
      return { icon: TrendingDown, title: `Você gastou menos com ${d.categoryName}`, detail: `${money(d.current)} contra a média de ${money(d.average)}.` }
    case 'SPENT_MORE_THAN_EARNED':
      return { icon: AlertTriangle, title: 'Gastos maiores que a renda', detail: `As despesas passaram as receitas em ${money(d.difference)}.` }
    case 'SAVINGS_GOOD':
      return { icon: CircleCheck, title: `Você guardou ${pct(d.savingsRate)} da renda`, detail: `${money(d.saved)} sobraram no mês.` }
    case 'BIGGEST_EXPENSE':
      return { icon: Info, title: `Maior gasto: ${d.description}`, detail: `${money(d.amount)} em ${formatDate(String(d.date))} (${pct(d.shareOfExpenses)} das despesas).` }
    case 'UPCOMING_BILLS':
      return { icon: CalendarClock, title: `${d.count} conta(s) nos próximos 7 dias`, detail: `${money(d.total)} a pagar em breve.` }
    case 'GOAL_BEHIND':
      return {
        icon: Lightbulb,
        title: `Meta "${d.goalName}" ${Number(d.overdue) ? 'com prazo vencido' : 'atrasada'}`,
        detail: d.monthlyNeeded ? `Precisa de ${money(d.monthlyNeeded)}/mês; o ritmo atual é ${money(d.monthlyPace)}.` : 'Reveja o prazo ou aumente os aportes.',
      }
    case 'GOAL_COMPLETED':
      return { icon: Trophy, title: `Meta "${d.goalName}" alcançada`, detail: 'Hora de comemorar (com moderação).' }
    case 'UNBUDGETED_SPENDING':
      return { icon: Lightbulb, title: `${pct(d.shareOfExpenses)} dos gastos fora de orçamentos`, detail: `${money(d.amount)} sem limite definido. Que tal criar orçamentos para eles?` }
  }
}

const TONE: Record<InsightSeverity, string> = {
  danger: 'text-expense bg-expense/12',
  warning: 'text-warning bg-warning/12',
  positive: 'text-income bg-income/12',
  info: 'text-primary bg-primary/12',
}

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="grid min-w-0 grid-cols-1 gap-2">
      {insights.map((insight, i) => {
        const { icon: Icon, title, detail } = phrase(insight)
        return (
          <motion.li
            key={insight.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex gap-3 rounded-xl p-2"
          >
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE[insight.severity])}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-sm text-muted-foreground">{detail}</span>
            </span>
          </motion.li>
        )
      })}
    </ul>
  )
}
