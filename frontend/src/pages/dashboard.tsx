import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { Bar, CartesianGrid, ComposedChart, Line, Pie, PieChart, XAxis, YAxis, Cell } from 'recharts'
import { AccountIcon } from '@/components/accounts/account-icon'
import { BudgetBar } from '@/components/budget-bar'
import { InsightList } from '@/components/dashboard/insight-list'
import { BUDGET_STATUS } from '@/components/budget-status'
import { CategoryIcon } from '@/components/category-icon'
import { EmptyState } from '@/components/empty-state'
import { useDialogs } from '@/components/dialogs/dialogs-context'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { useBudgetVsActual, useByCategory, useMonthly, useSummary, useTransactions } from '@/hooks/queries'
import { useAccounts, useCalendar, useGoals, useInsights } from '@/hooks/queries-more'
import { useAuth } from '@/lib/auth'
import { formatTime, instantToLocalDate, localDateKey, toLocalIso } from '@/lib/datetime'
import { formatMoney, formatMoneyCompact, formatPercent, formatShortDate, monthLabel } from '@/lib/format'
import { useMonth } from '@/lib/month'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

function Panel({ className, children, delay = 0 }: { className?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      className={cn('min-w-0 rounded-2xl border bg-card p-5 sm:p-6', className)}
    >
      {children}
    </motion.section>
  )
}

function PanelTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  )
}

/** Change vs previous month. For expenses, going up is the bad direction. */
function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">sem base no mês anterior</span>
  const up = value >= 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular', good ? 'text-income' : 'text-expense')}>
      <Icon className="size-3.5" />
      {formatPercent(Math.abs(value))}
      <span className="ml-1 font-normal text-muted-foreground">vs. mês anterior</span>
    </span>
  )
}

function Summary() {
  const { year, month } = useMonth()
  const { data, isLoading } = useSummary(year, month)

  if (isLoading || !data) {
    return (
      <Panel className="grid gap-6 lg:grid-cols-[1.3fr_1fr_1fr]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </Panel>
    )
  }

  const net = Number(data.net)
  return (
    <Panel className="grid gap-6 lg:grid-cols-[1.3fr_1fr_1fr] lg:gap-0 lg:divide-x">
      <div className="lg:pr-8">
        <p className="text-sm text-muted-foreground">Saldo acumulado</p>
        <p className="mt-1 text-4xl font-semibold tracking-[-0.03em] tabular">{formatMoney(data.balance)}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {monthLabel(year, month)}:{' '}
          <span className={cn('font-medium tabular', net >= 0 ? 'text-income' : 'text-expense')}>
            {net >= 0 ? '+' : ''}
            {formatMoney(data.net)}
          </span>
          {data.savingsRate !== null && (
            <>
              {' · '}
              {data.savingsRate >= 0
                ? `você guardou ${formatPercent(data.savingsRate)} da renda`
                : `gastou ${formatPercent(Math.abs(data.savingsRate))} além da renda`}
            </>
          )}
        </p>
      </div>
      <div className="lg:px-8">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-income" aria-hidden /> Receitas
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular">{formatMoney(data.income)}</p>
        <div className="mt-2">
          <Change value={data.incomeChange} />
        </div>
      </div>
      <div className="lg:pl-8">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-expense" aria-hidden /> Despesas
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular">{formatMoney(data.expense)}</p>
        <div className="mt-2">
          <Change value={data.expenseChange} invert />
        </div>
      </div>
    </Panel>
  )
}

const monthlyConfig = {
  income: { label: 'Receitas', color: 'var(--income)' },
  expense: { label: 'Despesas', color: 'var(--expense)' },
  balance: { label: 'Saldo', color: 'var(--primary)' },
} satisfies ChartConfig

function MonthlyEvolution() {
  const { year, month } = useMonth()
  const { data, isLoading } = useMonthly(year, month, 6)
  const rows = (data ?? []).map((p) => ({
    label: monthLabel(p.year, p.month, 'short'),
    income: Number(p.income),
    expense: Number(p.expense),
    balance: Number(p.balance),
  }))

  return (
    <Panel delay={0.05} className="xl:col-span-3">
      <PanelTitle>Evolução nos últimos 6 meses</PanelTitle>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ChartContainer config={monthlyConfig} className="h-64 w-full">
          <ComposedChart data={rows} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              yAxisId="money"
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(v: number) => formatMoneyCompact(v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{monthlyConfig[name as keyof typeof monthlyConfig]?.label}</span>
                    <span className="font-medium tabular">{formatMoney(Number(value))}</span>
                  </div>
                )} />
              }
            />
            <Bar yAxisId="money" dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar yAxisId="money" dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line yAxisId="money" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2.5} dot={false} type="monotone" />
          </ComposedChart>
        </ChartContainer>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(monthlyConfig).map(([key, c]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', key === 'balance' ? 'h-0.5 w-3 rounded-none' : '')} style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
    </Panel>
  )
}

function SpendingByCategory() {
  const { start, end } = useMonth()
  const { data, isLoading } = useByCategory(start, end)
  const items = data?.categories ?? []
  const top = items.slice(0, 5)
  const config: ChartConfig = Object.fromEntries(items.map((c) => [c.categoryId, { label: c.name, color: c.color ?? 'var(--chart-1)' }]))

  return (
    <Panel delay={0.1} className="xl:col-span-2">
      <PanelTitle>Gastos por categoria</PanelTitle>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhuma despesa neste mês." />
      ) : (
        <div className="grid gap-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center xl:grid-cols-1">
          <ChartContainer config={config} className="mx-auto aspect-square h-40">
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent hideLabel nameKey="categoryId" formatter={(value, _n, item) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{(item.payload as { name: string }).name}</span>
                    <span className="font-medium tabular">{formatMoney(Number(value))}</span>
                  </div>
                )} />}
              />
              <Pie
                data={items.map((c) => ({ ...c, value: Number(c.total) }))}
                dataKey="value"
                nameKey="categoryId"
                innerRadius="62%"
                outerRadius="100%"
                strokeWidth={2}
                stroke="var(--card)"
              >
                {items.map((c) => (
                  <Cell key={c.categoryId} fill={c.color ?? 'var(--chart-1)'} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="grid min-w-0 grid-cols-1 gap-3">
            {top.map((c) => (
              <li key={c.categoryId} className="flex items-center gap-3 text-sm">
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular">{formatPercent(c.percentage)}</span>
                <span className="shrink-0 text-right font-medium tabular">{formatMoney(c.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}


function BudgetsSnapshot() {
  const { year, month } = useMonth()
  const { data, isLoading } = useBudgetVsActual(year, month)
  const budgets = [...(data?.budgets ?? [])].sort((a, b) => b.percentUsed - a.percentUsed).slice(0, 4)

  return (
    <Panel delay={0.15} className="xl:col-span-2">
      <PanelTitle
        action={
          <Button variant="link" size="sm" asChild className="px-0">
            <Link to="/orcamentos">Ver todos</Link>
          </Button>
        }
      >
        Orçamentos do mês
      </PanelTitle>
      {isLoading ? (
        <div className="grid gap-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : budgets.length === 0 ? (
        <EmptyState text="Nenhum orçamento definido para este mês." action={<Button variant="outline" size="sm" asChild><Link to="/orcamentos">Definir orçamentos</Link></Button>} />
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-5">
          {budgets.map((b) => (
            <li key={b.id} className="grid gap-2">
              <div className="flex items-center gap-3 text-sm">
                <CategoryIcon icon={b.category.icon} color={b.category.color} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{b.category.name}</span>
                <span className={cn('text-xs font-medium', BUDGET_STATUS[b.status].text)}>{BUDGET_STATUS[b.status].label}</span>
              </div>
              <BudgetBar percent={b.percentUsed} status={b.status} />
              <div className="flex justify-between text-xs text-muted-foreground tabular">
                <span>
                  {formatMoney(b.spent)} de {formatMoney(b.monthlyLimit)}
                </span>
                <span>{formatPercent(b.percentUsed)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RecentTransactions() {
  const { start, end } = useMonth()
  const { editTransaction: openEdit } = useDialogs()
  const { data, isLoading } = useTransactions({ page: 1, limit: 6, startDate: start, endDate: end, sortBy: 'date', order: 'desc' })

  return (
    <Panel delay={0.2} className="xl:col-span-3">
      <PanelTitle
        action={
          <Button variant="link" size="sm" asChild className="px-0">
            <Link to="/transacoes">Ver todas</Link>
          </Button>
        }
      >
        Últimas transações
      </PanelTitle>
      {isLoading ? (
        <div className="grid gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : !data?.data.length ? (
        <EmptyState text="Nenhuma transação neste mês." />
      ) : (
        <ul className="-mx-2 grid">
          {data.data.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openEdit(t)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
              >
                <CategoryIcon icon={t.category.icon} color={t.category.color} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{t.description}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.category.name} · {formatShortDate(t.date)}
                  </span>
                </span>
                <span className={cn('font-medium tabular', t.type === 'INCOME' ? 'text-income' : 'text-foreground')}>
                  {t.type === 'INCOME' ? '+' : '−'} {formatMoney(t.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}


function InsightsPanel() {
  const { year, month } = useMonth()
  const { data: insights, isLoading } = useInsights(year, month)
  return (
    <Panel delay={0.05} className="xl:col-span-3">
      <PanelTitle>O que chama atenção</PanelTitle>
      {isLoading ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !insights?.length ? (
        <EmptyState text="Tudo tranquilo por aqui. Os destaques aparecem conforme você registra o mês." />
      ) : (
        <InsightList insights={insights.slice(0, 5)} />
      )}
    </Panel>
  )
}

function AccountsPanel() {
  const { data, isLoading } = useAccounts()
  return (
    <Panel delay={0.1} className="xl:col-span-2">
      <PanelTitle
        action={
          <Button variant="link" size="sm" asChild className="px-0">
            <Link to="/contas">Ver contas</Link>
          </Button>
        }
      >
        Onde está o dinheiro
      </PanelTitle>
      {isLoading ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-3">
          {(data?.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-sm">
              <AccountIcon type={a.type} color={a.color} className="size-9 [&_svg]:size-4" />
              <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
              <span className={cn('font-medium tabular', Number(a.balance) < 0 && 'text-expense')}>{formatMoney(a.balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function UpcomingPanel() {
  const { editEvent } = useDialogs()
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 8)
  const { data, isLoading } = useCalendar(toLocalIso(now), toLocalIso(end))
  const today = localDateKey(new Date())
  const items = [
    ...(data?.events ?? []).map((e) => ({ kind: 'event' as const, key: e.id, date: instantToLocalDate(e.startAt), sort: e.startAt, event: e })),
    ...(data?.bills ?? [])
      .filter((b) => !b.done && b.date >= today)
      .map((b) => ({ kind: 'bill' as const, key: b.ruleId + b.date, date: b.date, sort: `${b.date}T12`, bill: b })),
  ]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .slice(0, 6)

  return (
    <Panel delay={0.25} className="xl:col-span-3">
      <PanelTitle
        action={
          <Button variant="link" size="sm" asChild className="px-0">
            <Link to="/calendario">Abrir agenda</Link>
          </Button>
        }
      >
        Próximos 7 dias
      </PanelTitle>
      {isLoading ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum compromisso ou conta nos próximos dias." />
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-1">
          {items.map((item) => (
            <li key={item.key}>
              {item.kind === 'event' ? (
                <button type="button" onClick={() => editEvent(item.event)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60">
                  <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: item.event.color ?? 'var(--primary)' }} />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground first-letter:uppercase">{relativeDay(item.date, today)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.event.title}</span>
                  <span className="text-xs text-muted-foreground tabular">{item.event.allDay ? 'dia todo' : formatTime(item.event.startAt)}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
                  <span className={cn('w-1 self-stretch rounded-full', item.bill.type === 'INCOME' ? 'bg-income' : 'bg-expense')} />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground first-letter:uppercase">{relativeDay(item.date, today)}</span>
                  <span className="min-w-0 flex-1 truncate">{item.bill.description}</span>
                  <span className={cn('font-medium tabular', item.bill.type === 'INCOME' && 'text-income')}>{formatMoney(item.bill.amount)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function relativeDay(date: string, today: string): string {
  if (date === today) return 'hoje'
  const t = new Date(`${today}T12:00:00`)
  t.setDate(t.getDate() + 1)
  if (date === localDateKey(t)) return 'amanhã'
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric' }).format(new Date(y, m - 1, d)).replace('.', '')
}

function GoalsPanel() {
  const { data: goals, isLoading } = useGoals()
  return (
    <Panel delay={0.3} className="xl:col-span-2">
      <PanelTitle
        action={
          <Button variant="link" size="sm" asChild className="px-0">
            <Link to="/metas">Ver metas</Link>
          </Button>
        }
      >
        Metas
      </PanelTitle>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !goals?.length ? (
        <EmptyState text="Nenhuma meta ainda." action={<Button variant="outline" size="sm" asChild><Link to="/metas">Criar meta</Link></Button>} />
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-4">
          {goals.slice(0, 3).map((g) => (
            <li key={g.id} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{g.name}</span>
                <span className="text-xs text-muted-foreground tabular">{Math.floor(g.percent)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: g.color ?? 'var(--primary)' }} initial={{ width: 0 }} animate={{ width: `${g.percent}%` }} transition={{ duration: 0.7, ease }} />
              </div>
              <span className="text-xs text-muted-foreground tabular">
                {formatMoney(g.saved)} de {formatMoney(g.targetAmount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">
        {user ? `Olá, ${user.name.split(' ')[0]}` : 'Visão geral'}
      </h1>
      <Summary />
      <div className="grid min-w-0 gap-5 sm:gap-6 xl:grid-cols-5">
        <InsightsPanel />
        <AccountsPanel />
        <MonthlyEvolution />
        <SpendingByCategory />
        <UpcomingPanel />
        <GoalsPanel />
        <BudgetsSnapshot />
        <RecentTransactions />
      </div>
    </div>
  )
}
