import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, Gauge, Pencil, Plus, RefreshCw, Trash2, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { TransferForm } from '@/components/accounts/transfer-form'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { InvestmentForm } from '@/components/investments/investment-form'
import { CLASS_COLOR, CLASS_LABEL, describeYield } from '@/components/investments/labels'
import { ScheduledContributionForm, ValuationForm } from '@/components/investments/small-forms'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useDeleteInvestment,
  useAddValuation,
  useDeleteRecurring,
  useInvestment,
  useInvestmentHistory,
  usePortfolio,
  useRecurring,
  useRemoveValuation,
  useSaveInvestment,
} from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatDate, formatMoney, formatMoneyCompact, formatPercent, formatShortDate } from '@/lib/format'
import type { Investment, InvestmentHistoryPoint } from '@/lib/types'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

type Dialog =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'schedule'; accountId?: string }
  | { kind: 'detail'; id: string }
  | { kind: 'edit' | 'valuation' | 'contribute' | 'withdraw'; investment: Investment }

const chartConfig = {
  value: { label: 'Seu patrimônio', color: 'var(--primary)' },
  invested: { label: 'Total aportado', color: 'var(--muted-foreground)' },
  cdiValue: { label: 'Se fosse 100% do CDI', color: '#22c55e' },
  ipcaValue: { label: 'Aportes + inflação', color: '#f97316' },
} satisfies ChartConfig

const signed = (v: string | number) => `${Number(v) >= 0 ? '+' : '−'}${formatMoney(Math.abs(Number(v)))}`
const tone = (v: string | number | null) => (v === null ? '' : Number(v) >= 0 ? 'text-income' : 'text-expense')

function Panel({ className, children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
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

function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 truncate text-lg font-semibold tracking-[-0.02em] tabular sm:text-2xl', valueClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function EvolutionChart({ points: all, height = 'h-64' }: { points: InvestmentHistoryPoint[]; height?: string }) {
  // Months before the first investment are just zeros: keep only the last of them.
  const first = all.findIndex((p) => Number(p.value) !== 0 || Number(p.invested) !== 0)
  const points = first > 0 ? all.slice(first - 1) : all
  const rows = points.map((p) => {
    const [y, m] = p.date.split('-').map(Number)
    return {
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(y, m - 1, 1)).replace('.', '') + (points.length > 12 ? `/${String(y).slice(2)}` : ''),
      value: Number(p.value),
      invested: Number(p.invested),
      cdiValue: Number(p.cdiValue),
      ipcaValue: Number(p.ipcaValue),
    }
  })
  return (
    <>
      <ChartContainer config={chartConfig} className={cn(height, 'w-full')}>
        <ComposedChart data={rows} margin={{ left: 4, right: 4 }}>
          <defs>
            <linearGradient id="inv-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatMoneyCompact(v)} domain={['auto', 'auto']} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label}</span>
                    <span className="font-medium tabular">{formatMoney(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Area dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} fill="url(#inv-fill)" type="monotone" />
          <Line dataKey="invested" stroke="var(--color-invested)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} type="stepAfter" />
          <Line dataKey="cdiValue" stroke="var(--color-cdiValue)" strokeWidth={1.5} dot={false} type="monotone" />
          <Line dataKey="ipcaValue" stroke="var(--color-ipcaValue)" strokeWidth={1.5} dot={false} type="monotone" />
        </ComposedChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(chartConfig).map(([key, c]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn('h-0.5 w-3', key === 'invested' && 'border-t border-dashed bg-transparent')} style={{ background: key === 'invested' ? undefined : c.color, borderColor: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
    </>
  )
}

export function InvestmentsPage() {
  const { data, isLoading } = usePortfolio()
  const [months, setMonths] = useState<'6' | '12' | '24'>('12')
  const { data: history, isLoading: historyLoading } = useInvestmentHistory(Number(months))
  const { data: rules = [] } = useRecurring()
  const deleteRule = useDeleteRecurring()
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const close = () => setDialog({ kind: 'none' })

  const items = data?.items ?? []
  const active = items.filter((i) => !i.archived)
  const investmentAccounts = new Set(items.map((i) => i.account.id))
  const scheduled = rules.filter((r) => r.toAccount && investmentAccounts.has(r.toAccount.id))
  const s = data?.summary
  const backToDetail = (i: Investment) => setDialog({ kind: 'detail', id: i.id })

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Investimentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quanto você tem, quanto rendeu e como está indo contra o CDI e a inflação.</p>
        </div>
        <div className="flex gap-2">
          {active.length > 0 && (
            <Button variant="outline" onClick={() => setDialog({ kind: 'schedule' })}>
              <CalendarClock className="size-4" /> <span className="hidden sm:inline">Aporte programado</span>
            </Button>
          )}
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus className="size-4" /> Novo investimento
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          text="Cadastre seus investimentos (CDB, Tesouro, ações, cripto...) para ver quanto rendem e comparar com o CDI e a inflação. Aportes programados entram sozinhos todo mês."
          action={<Button size="sm" onClick={() => setDialog({ kind: 'create' })}>Cadastrar o primeiro</Button>}
        />
      ) : (
        s && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Patrimônio investido"
                value={formatMoney(s.value)}
                valueClass="text-foreground"
                sub={
                  <span className={tone(s.profit)}>
                    {signed(s.profit)}
                    {s.profitPercent !== null && ` (${formatPercent(s.profitPercent)})`}
                  </span>
                }
              />
              <Stat label="Total aportado" value={formatMoney(s.invested)} sub="Aportes menos resgates" />
              <Stat label="Rendeu este mês" value={signed(s.monthProfit)} valueClass={tone(s.monthProfit)} sub="Sem contar aportes do mês" />
              <Stat
                label="Comparado ao CDI"
                value={s.percentOfCdi === null ? '—' : `${formatPercent(s.percentOfCdi)} do CDI`}
                valueClass={s.percentOfCdi === null ? '' : s.percentOfCdi >= 100 ? 'text-income' : 'text-warning'}
                sub={`100% do CDI daria ${formatMoney(s.cdiValue)}`}
              />
            </div>

            <div className="grid min-w-0 gap-5 sm:gap-6 xl:grid-cols-5">
              <Panel className="xl:col-span-3" delay={0.05}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-[-0.01em]">Evolução</h2>
                  <SegmentedControl
                    ariaLabel="Período"
                    value={months}
                    onChange={setMonths}
                    options={[
                      { value: '6', label: '6 meses' },
                      { value: '12', label: '1 ano' },
                      { value: '24', label: '2 anos' },
                    ]}
                  />
                </div>
                {historyLoading || !history ? <Skeleton className="h-64 w-full" /> : <EvolutionChart points={history} />}
              </Panel>

              <Panel className="xl:col-span-2" delay={0.1}>
                <h2 className="mb-5 text-base font-semibold tracking-[-0.01em]">Onde está investido</h2>
                {data.allocation.length === 0 ? (
                  <EmptyState text="Nada investido no momento." />
                ) : (
                  <div className="grid gap-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center xl:grid-cols-1">
                    <ChartContainer
                      config={Object.fromEntries(data.allocation.map((a) => [a.assetClass, { label: CLASS_LABEL[a.assetClass], color: CLASS_COLOR[a.assetClass] }]))}
                      className="mx-auto aspect-square h-40"
                    >
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              hideLabel
                              nameKey="assetClass"
                              formatter={(value, _n, item) => (
                                <div className="flex w-full justify-between gap-4">
                                  <span className="text-muted-foreground">{CLASS_LABEL[(item.payload as { assetClass: Investment['assetClass'] }).assetClass]}</span>
                                  <span className="font-medium tabular">{formatMoney(Number(value))}</span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Pie
                          data={data.allocation.map((a) => ({ ...a, value: Number(a.value) }))}
                          dataKey="value"
                          nameKey="assetClass"
                          innerRadius="62%"
                          outerRadius="100%"
                          strokeWidth={2}
                          stroke="var(--card)"
                        >
                          {data.allocation.map((a) => (
                            <Cell key={a.assetClass} fill={CLASS_COLOR[a.assetClass]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <ul className="grid min-w-0 grid-cols-1 gap-3">
                      {data.allocation.map((a) => (
                        <li key={a.assetClass} className="flex items-center gap-3 text-sm">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CLASS_COLOR[a.assetClass] }} />
                          <span className="min-w-0 flex-1 truncate">{CLASS_LABEL[a.assetClass]}</span>
                          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular">{formatPercent(a.percent)}</span>
                          <span className="shrink-0 text-right font-medium tabular">{formatMoney(a.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            </div>

            <Panel delay={0.15}>
              <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">Seus investimentos</h2>
              <ul className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((i) => (
                  <li key={i.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'detail', id: i.id })}
                      className={cn('grid w-full gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/40', i.archived && 'opacity-60')}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: i.account.color ?? CLASS_COLOR[i.assetClass] }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{i.account.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {CLASS_LABEL[i.assetClass]} · {describeYield(i)}
                          </p>
                        </div>
                        {i.archived && <Badge variant="secondary">Arquivado</Badge>}
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-lg font-semibold tabular">{formatMoney(i.value)}</span>
                        <span className={cn('text-sm font-medium tabular', tone(i.profit))}>
                          {signed(i.profit)}
                          {i.profitPercent !== null && ` · ${formatPercent(i.profitPercent)}`}
                        </span>
                      </div>
                      {i.yieldMode === 'MANUAL' && (
                        <p className="text-xs text-muted-foreground">
                          {i.lastValuation ? `Valor informado em ${formatDate(i.lastValuation.date)}` : 'Toque para informar o valor atual'}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel delay={0.2}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-[-0.01em]">Aportes programados</h2>
                <Button variant="link" size="sm" className="px-0" onClick={() => setDialog({ kind: 'schedule' })} disabled={active.length === 0}>
                  Programar
                </Button>
              </div>
              {scheduled.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum aporte programado. Programe um valor fixo (ex.: todo dia 5) e ele entra sozinho, saindo da conta escolhida. Se você já lançava aportes
                  como despesa recorrente, use "Mover para investimentos" na tela de Recorrentes.
                </p>
              ) : (
                <ul className="divide-y">
                  {scheduled.map((r) => (
                    <li key={r.id} className={cn('flex items-center gap-3 py-3', !r.active && 'opacity-60')}>
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {r.description} → {r.toAccount?.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.frequency === 'MONTHLY' ? 'Todo mês' : r.frequency === 'WEEKLY' ? 'Toda semana' : 'Todo ano'} · sai de {r.account.name}
                          {r.nextDate ? ` · próximo em ${formatShortDate(r.nextDate)}` : ' · pausado'}
                        </p>
                      </div>
                      <span className="text-sm font-medium tabular">{formatMoney(r.amount)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 md:size-9"
                        aria-label={`Remover ${r.description}`}
                        onClick={() =>
                          deleteRule.mutate(r.id, {
                            onSuccess: () => toast.success('Aporte programado removido. Os já feitos continuam no histórico.'),
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Gauge className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Valores brutos estimados (antes do IR), com dados oficiais do Banco Central
                {data.market.cdiAnnual !== null && `: CDI de ${formatPercent(data.market.cdiAnnual)} ao ano`}
                {data.market.cdiUpdatedAt && ` (atualizado em ${formatDate(data.market.cdiUpdatedAt)})`}
                {data.market.ipca12m !== null && ` e IPCA de ${formatPercent(data.market.ipca12m)} em 12 meses`}. Para acertar com o extrato, use "Atualizar
                valor" em cada investimento.
              </span>
            </p>
          </>
        )
      )}

      <ResponsiveDialog open={dialog.kind === 'create'} onOpenChange={(o) => !o && close()} title="Novo investimento" className="sm:max-w-lg">
        <InvestmentForm onDone={close} />
      </ResponsiveDialog>

      <ResponsiveDialog
        open={dialog.kind === 'edit'}
        onOpenChange={(o) => !o && close()}
        title="Editar investimento"
        className="sm:max-w-lg"
      >
        {dialog.kind === 'edit' && <InvestmentForm editing={dialog.investment} onDone={() => backToDetail(dialog.investment)} />}
      </ResponsiveDialog>

      <ResponsiveDialog open={dialog.kind === 'valuation'} onOpenChange={(o) => !o && close()} title="Atualizar valor">
        {dialog.kind === 'valuation' && <ValuationForm investment={dialog.investment} onDone={() => backToDetail(dialog.investment)} />}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={dialog.kind === 'contribute' || dialog.kind === 'withdraw'}
        onOpenChange={(o) => !o && close()}
        title={dialog.kind === 'withdraw' ? 'Resgatar' : 'Aportar'}
        description={dialog.kind === 'withdraw' ? 'O dinheiro volta para a conta escolhida.' : 'Uma transferência da sua conta para o investimento.'}
      >
        {(dialog.kind === 'contribute' || dialog.kind === 'withdraw') && (
          <TransferForm
            defaults={
              dialog.kind === 'contribute'
                ? { toAccountId: dialog.investment.account.id, description: `Aporte em ${dialog.investment.account.name}` }
                : { fromAccountId: dialog.investment.account.id, description: `Resgate de ${dialog.investment.account.name}` }
            }
            onDone={() => backToDetail(dialog.investment)}
          />
        )}
      </ResponsiveDialog>

      <ResponsiveDialog open={dialog.kind === 'schedule'} onOpenChange={(o) => !o && close()} title="Aporte programado" description="Uma transferência que se repete sozinha.">
        {dialog.kind === 'schedule' && <ScheduledContributionForm investments={active} defaultInvestmentAccountId={dialog.accountId} onDone={close} />}
      </ResponsiveDialog>

      <InvestmentDetailSheet
        id={dialog.kind === 'detail' ? dialog.id : null}
        onClose={close}
        onAction={(kind, investment) => (kind === 'schedule' ? setDialog({ kind, accountId: investment.account.id }) : setDialog({ kind, investment }))}
      />
    </div>
  )
}

function InvestmentDetailSheet({
  id,
  onClose,
  onAction,
}: {
  id: string | null
  onClose: () => void
  onAction: (kind: 'edit' | 'valuation' | 'contribute' | 'withdraw' | 'schedule', investment: Investment) => void
}) {
  const { data: inv, isLoading } = useInvestment(id)
  const { data: history } = useInvestmentHistory(12, id ?? undefined)
  const save = useSaveInvestment()
  const remove = useDeleteInvestment()
  const removeValuation = useRemoveValuation()
  const addValuation = useAddValuation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const kindLabel = { CONTRIBUTION: 'Aporte', WITHDRAWAL: 'Resgate', INCOME: 'Rendimento recebido', FEE: 'Taxa' } as const

  async function archive() {
    if (!inv) return
    try {
      await save.mutateAsync({ id: inv.id, input: { archived: !inv.archived } })
      toast.success(inv.archived ? 'Investimento reativado.' : 'Investimento arquivado. O histórico continua aqui.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function doDelete() {
    if (!inv) return
    try {
      await remove.mutateAsync(inv.id)
      toast.success('Investimento excluído.')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setConfirmDelete(false)
    }
  }

  const hasHistory = !!inv && (inv.movements.length > 0 || Number(inv.invested) !== 0)

  return (
    <ResponsiveDialog open={!!id} onOpenChange={(o) => !o && onClose()} title={inv?.account.name ?? 'Investimento'} description={inv ? `${CLASS_LABEL[inv.assetClass]} · ${describeYield(inv)}` : undefined} className="sm:max-w-2xl">
      {isLoading || !inv ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-5">
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 [&>div]:min-w-0">
            <div>
              <p className="text-xs text-muted-foreground">Valor hoje</p>
              <p className="text-lg font-semibold tabular">{formatMoney(inv.value)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Aportado</p>
              <p className="text-lg font-semibold tabular">{formatMoney(inv.invested)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rendeu</p>
              <p className={cn('text-lg font-semibold tabular', tone(inv.profit))}>
                {signed(inv.profit)}
                {inv.profitPercent !== null && <span className="ml-1 text-xs font-medium">({formatPercent(inv.profitPercent)})</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contra o CDI</p>
              <p className="text-lg font-semibold tabular">{inv.percentOfCdi === null ? '—' : `${formatPercent(inv.percentOfCdi)}`}</p>
            </div>
          </div>

          {inv.missingMarketData && (
            <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Não conseguimos os dados do Banco Central agora, então parte do rendimento pode não aparecer. Tente mais tarde ou atualize o valor manualmente.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>button]:h-11 sm:[&>button]:h-9">
            <Button onClick={() => onAction('contribute', inv)} disabled={inv.archived}>
              <ArrowDownToLine className="size-4" /> Aportar
            </Button>
            <Button variant="outline" onClick={() => onAction('withdraw', inv)} disabled={inv.archived}>
              <ArrowUpFromLine className="size-4" /> Resgatar
            </Button>
            <Button variant="outline" onClick={() => onAction('valuation', inv)}>
              <RefreshCw className="size-4" /> Atualizar valor
            </Button>
            <Button variant="outline" onClick={() => onAction('schedule', inv)} disabled={inv.archived}>
              <CalendarClock className="size-4" /> Programar
            </Button>
          </div>

          {history && history.some((p) => Number(p.value) > 0) && <EvolutionChart points={history} height="h-52" />}

          {inv.scheduled.length > 0 && (
            <section className="grid min-w-0 grid-cols-1 gap-2">
              <h3 className="text-sm font-semibold">Aportes programados</h3>
              <ul className="divide-y rounded-xl border">
                {inv.scheduled.map((r) => (
                  <li key={r.ruleId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {r.description} · sai de {r.fromAccount.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.nextDate ? `próximo ${formatShortDate(r.nextDate)}` : 'pausado'}</span>
                    <span className="font-medium tabular">{formatMoney(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {inv.valuations.length > 0 && (
            <section className="grid min-w-0 grid-cols-1 gap-2">
              <h3 className="text-sm font-semibold">Valores informados</h3>
              <ul className="divide-y rounded-xl border">
                {inv.valuations.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-24 text-xs text-muted-foreground tabular">{formatDate(v.date)}</span>
                    <span className="flex-1 font-medium tabular">{formatMoney(v.value)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 md:size-8"
                      aria-label="Remover valor informado"
                      onClick={() =>
                        removeValuation.mutate(
                          { id: inv.id, valuationId: v.id },
                          {
                            onError: (e) => toast.error(errorMessage(e)),
                            onSuccess: () =>
                              toast.success('Valor removido.', {
                                action: {
                                  label: 'Desfazer',
                                  onClick: () =>
                                    addValuation.mutate({ id: inv.id, date: v.date, value: Number(v.value) }, { onError: (e) => toast.error(errorMessage(e)) }),
                                },
                              }),
                          },
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid min-w-0 grid-cols-1 gap-2">
            <h3 className="text-sm font-semibold">Movimentações</h3>
            {inv.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {Number(inv.invested) > 0 ? `Valor inicial de ${formatMoney(inv.invested)} em ${formatDate(inv.startDate)}.` : 'Nenhuma movimentação ainda.'}
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {inv.movements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground tabular">{formatShortDate(m.date)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {kindLabel[m.kind]}
                      {m.counterpart && <span className="text-muted-foreground"> · {m.kind === 'CONTRIBUTION' ? 'de' : 'para'} {m.counterpart.name}</span>}
                    </span>
                    <span className={cn('font-medium tabular', m.kind === 'CONTRIBUTION' || m.kind === 'INCOME' ? 'text-income' : 'text-expense')}>
                      {m.kind === 'CONTRIBUTION' || m.kind === 'INCOME' ? '+' : '−'}
                      {formatMoney(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="ghost" size="sm" onClick={() => onAction('edit', inv)}>
              <Pencil className="size-4" /> Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void archive()}>
              <TrendingUp className="size-4" /> {inv.archived ? 'Reativar' : 'Arquivar (resgatei tudo)'}
            </Button>
            {!hasHistory && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir investimento?"
        description="Ele ainda não tem movimentações, então nada se perde."
        confirmLabel="Excluir"
        onConfirm={doDelete}
      />
    </ResponsiveDialog>
  )
}
