import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useSummary } from '@/hooks/queries'
import { useAccounts, useUpcoming } from '@/hooks/queries-more'
import { useAnimatedNumber } from '@/hooks/use-animated-number'
import { formatMoney, formatPercent, monthLabel } from '@/lib/format'
import { useMonth } from '@/lib/month'
import { cn } from '@/lib/utils'

type Tone = 'calm' | 'tight' | 'danger'

const TONE: Record<Tone, { glowA: string; glowB: string; label: string; chip: string }> = {
  calm: { glowA: 'oklch(0.62 0.21 293 / 0.55)', glowB: 'oklch(0.7 0.15 160 / 0.35)', label: 'Mês tranquilo', chip: 'bg-income/15 text-income' },
  tight: { glowA: 'oklch(0.62 0.21 293 / 0.45)', glowB: 'oklch(0.8 0.15 75 / 0.45)', label: 'Mês apertado', chip: 'bg-warning/15 text-warning' },
  danger: { glowA: 'oklch(0.62 0.2 25 / 0.5)', glowB: 'oklch(0.62 0.21 293 / 0.35)', label: 'No vermelho', chip: 'bg-expense/15 text-expense' },
}

const money = (n: number) => formatMoney(n)

function daysLeftInMonth(year: number, month: number): number {
  const now = new Date()
  const last = new Date(year, month, 0).getDate()
  return Math.max(0, last - now.getDate())
}

/**
 * The first thing on the home screen: how much can still be spent this month,
 * counting what is still to come (salary, fixed bills, installments,
 * scheduled contributions). Its glow tells the month's mood at a glance and
 * the number rolls to its new value whenever something is registered.
 */
export function SpendHero() {
  const { year, month } = useMonth()
  const now = new Date()
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month
  const daysLeft = isCurrent ? daysLeftInMonth(year, month) : 0
  const { data, isLoading } = useSummary(year, month)
  const { data: upcoming = [] } = useUpcoming(Math.max(1, daysLeft))
  // Same number as the Accounts screen (future-dated installments are not money spent yet).
  const { data: accounts } = useAccounts()

  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const coming = isCurrent ? upcoming.filter((u) => u.date <= monthEnd) : []
  const comingIn = coming.filter((u) => u.type === 'INCOME' && !u.toAccount).reduce((a, u) => a + Number(u.amount), 0)
  const comingOut = coming.filter((u) => u.type === 'EXPENSE' || u.toAccount).reduce((a, u) => a + Number(u.amount), 0)
  const nextIncome = coming.find((u) => u.type === 'INCOME' && !u.toAccount)

  const income = Number(data?.income ?? 0)
  const expense = Number(data?.expense ?? 0)
  const free = isCurrent ? income + comingIn - expense - comingOut : income - expense
  const perDay = isCurrent && daysLeft > 0 && free > 0 ? free / (daysLeft + 1) : null
  const totalIn = income + comingIn
  const tone: Tone = free < 0 ? 'danger' : totalIn > 0 && free < totalIn * 0.1 ? 'tight' : 'calm'
  const { text, changed } = useAnimatedNumber(free, money)

  if (isLoading || !data) {
    return (
      <section className="grid gap-4 rounded-3xl border bg-card p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-4 w-56" />
      </section>
    )
  }

  const t = TONE[tone]
  const spentToDate = Number(data.toDate?.expense ?? data.expense)
  const earnedToDate = Number(data.toDate?.income ?? data.income)
  const change = data.expenseChange

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative isolate overflow-hidden rounded-3xl border bg-card p-6 sm:p-8"
      aria-labelledby="spend-hero-title"
    >
      {/* Mood glow: two slow drifting lights, colored by the month's health. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="aurora-a absolute -top-24 -left-16 size-72 rounded-full blur-3xl transition-colors duration-700" style={{ background: t.glowA }} />
        <span className="aurora-b absolute -right-20 -bottom-28 size-80 rounded-full blur-3xl transition-colors duration-700" style={{ background: t.glowB }} />
        <span className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="spend-hero-title" className="text-sm font-medium text-muted-foreground">
          {isCurrent ? `Para gastar até o fim de ${monthLabel(year, month).split(' ')[0].toLowerCase()}` : `Resultado de ${monthLabel(year, month).toLowerCase()}`}
        </p>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', t.chip)}>{isCurrent ? t.label : free >= 0 ? 'Sobrou' : 'Faltou'}</span>
      </div>

      <div className="relative mt-2">
        <p className="sr-only">{formatMoney(free)}</p>
        <motion.p aria-hidden className={cn('text-[2.75rem] leading-none font-semibold tracking-[-0.04em] tabular sm:text-6xl', free < 0 && 'text-expense')}>
          {text}
        </motion.p>
        {/* A soft pulse when the number changes after something is registered. */}
        <AnimatePresence>
          {changed > 0 && (
            <motion.span
              key={changed}
              aria-hidden
              initial={{ opacity: 0.6, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.25 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute -inset-x-3 -inset-y-2 rounded-2xl ring-2 ring-primary/60"
            />
          )}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {perDay !== null
          ? `≈ ${formatMoney(perDay)} por dia nos ${daysLeft + 1} dias que faltam`
          : isCurrent && free < 0
            ? `O previsto para o mês passa ${formatMoney(Math.abs(free))} do que entra. Dá tempo de ajustar.`
            : isCurrent
              ? 'Último dia do mês.'
              : `${formatMoney(income)} de entradas e ${formatMoney(expense)} de saídas.`}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-6">
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDownLeft className="size-3.5 text-income" /> {isCurrent ? 'Entrou até hoje' : 'Entrou'}
          </dt>
          <dd className="mt-0.5 font-semibold tabular">{formatMoney(earnedToDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpRight className="size-3.5 text-expense" /> {isCurrent ? 'Saiu até hoje' : 'Saiu'}
          </dt>
          <dd className="mt-0.5 font-semibold tabular">{formatMoney(spentToDate)}</dd>
        </div>
        {isCurrent && (comingIn > 0 || comingOut + (expense - spentToDate) > 0) && (
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" /> Ainda no mês
            </dt>
            <dd className="mt-0.5 text-sm tabular">
              {comingIn > 0 && <span className="font-semibold text-income">+{formatMoney(comingIn)}</span>}
              {comingIn > 0 && comingOut + (expense - spentToDate) > 0 && <span className="text-muted-foreground"> · </span>}
              {comingOut + (expense - spentToDate) > 0 && <span className="font-semibold">−{formatMoney(comingOut + (expense - spentToDate))}</span>}
              {nextIncome && (
                <span className="block text-xs text-muted-foreground">
                  {nextIncome.description} dia {Number(nextIncome.date.slice(8))}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <span>
          {data.comparedThroughDay !== null && data.comparedThroughDay < 7 ? (
            'Cedo para comparar com o mês passado: a comparação aparece a partir do dia 7'
          ) : change !== null && data.comparedThroughDay ? (
            <>
              Gastos <span className={cn('font-medium', change <= 0 ? 'text-income' : 'text-foreground')}>{change <= 0 ? `${formatPercent(Math.abs(change))} menores` : `${formatPercent(change)} maiores`}</span> que até o dia{' '}
              {data.comparedThroughDay} do mês passado
            </>
          ) : change !== null ? (
            <>Gastos {change <= 0 ? `${formatPercent(Math.abs(change))} menores` : `${formatPercent(change)} maiores`} que no mês anterior</>
          ) : (
            'Sem base de comparação com o mês passado ainda'
          )}
        </span>
        <Link to="/contas" className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground hover:underline md:min-h-0">
          Saldo nas contas: <span className="tabular">{formatMoney(accounts?.totalBalance ?? data.balance)}</span>
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </motion.section>
  )
}
