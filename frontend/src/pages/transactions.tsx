import { ChevronLeft, ChevronRight, Download, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDialogs } from '@/components/dialogs/dialogs-context'
import { EmptyState } from '@/components/empty-state'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories, useDeleteTransaction, useTransactions, type TransactionFilters } from '@/hooks/queries'
import { downloadTransactionsCsv, useAccounts, useHousehold } from '@/hooks/queries-more'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useIsMobile } from '@/hooks/use-mobile'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDate, formatMoney, formatShortDate, monthLabel } from '@/lib/format'
import { useMonth } from '@/lib/month'
import type { Transaction, TransactionType } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

const SORTS = {
  recent: { label: 'Mais recentes', sortBy: 'date', order: 'desc' },
  oldest: { label: 'Mais antigas', sortBy: 'date', order: 'asc' },
  highest: { label: 'Maior valor', sortBy: 'amount', order: 'desc' },
  lowest: { label: 'Menor valor', sortBy: 'amount', order: 'asc' },
} as const
type SortKey = keyof typeof SORTS

const signedMoney = (n: number) => `${n >= 0 ? '+' : '−'} ${formatMoney(Math.abs(n))}`

function dayTotal(list: Transaction[], day: string): number {
  return list.filter((t) => t.date === day).reduce((acc, t) => acc + (t.type === 'INCOME' ? 1 : -1) * Number(t.amount), 0)
}

/** "Hoje", "Ontem" or "quinta, 1 de outubro". */
function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff === -1) return 'Amanhã'
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
}

export function TransactionsPage() {
  const { user } = useAuth()
  const { year, month, start, end } = useMonth()
  const { newTransaction, editTransaction } = useDialogs()
  const isMobile = useIsMobile()
  const { data: categories = [] } = useCategories()
  const { data: accountsData } = useAccounts()
  const { data: household } = useHousehold()
  const shared = (household?.members.length ?? 1) > 1
  const remove = useDeleteTransaction()

  const [type, setType] = useState<'ALL' | TransactionType>('ALL')
  const [categoryId, setCategoryId] = useState('ALL')
  const [accountId, setAccountId] = useState('ALL')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Transaction | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim())

  // The page belongs to one combination of filters: change any filter and it
  // falls back to page 1 (derived during render, no effect needed).
  const filterKey = [type, categoryId, accountId, debouncedSearch, sort, start].join('|')
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = (update: (p: number) => number) => setPageState({ key: filterKey, page: update(page) })

  const filters: TransactionFilters = {
    page,
    limit: PAGE_SIZE,
    startDate: start,
    endDate: end,
    type: type === 'ALL' ? undefined : type,
    categoryId: categoryId === 'ALL' ? undefined : categoryId,
    accountId: accountId === 'ALL' ? undefined : accountId,
    search: debouncedSearch || undefined,
    sortBy: SORTS[sort].sortBy,
    order: SORTS[sort].order,
  }
  const { data, isLoading, isFetching } = useTransactions(filters)
  const categoryOptions = categories.filter((c) => type === 'ALL' || c.type === type)
  const activeFilters = [type !== 'ALL', categoryId !== 'ALL', accountId !== 'ALL', sort !== 'recent'].filter(Boolean).length
  const filtered = activeFilters > 0 || !!debouncedSearch

  function clearFilters() {
    setType('ALL')
    setCategoryId('ALL')
    setAccountId('ALL')
    setSort('recent')
    setSearch('')
  }

  async function deleteWith(scope: 'single' | 'future' | 'all') {
    if (!toDelete) return
    try {
      await remove.mutateAsync({ id: toDelete.id, scope })
      toast.success(scope === 'single' ? 'Transação excluída.' : 'Parcelas excluídas.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  async function exportCsv() {
    try {
      await downloadTransactionsCsv({ startDate: start, endDate: end })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const filterControls = (
    <>
      <SegmentedControl
        ariaLabel="Filtrar por tipo"
        value={type}
        onChange={(v) => {
          setType(v)
          setCategoryId('ALL')
        }}
        options={[
          { value: 'ALL', label: 'Todas' },
          { value: 'EXPENSE', label: 'Despesas' },
          { value: 'INCOME', label: 'Receitas' },
        ]}
        className="w-full lg:w-auto"
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:flex">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full lg:w-44" aria-label="Filtrar por categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as categorias</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-full lg:w-40" aria-label="Filtrar por conta">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as contas</SelectItem>
            {(accountsData?.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full lg:w-36" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([key, s]) => (
              <SelectItem key={key} value={key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Transações</h1>
          <p className="mt-1 text-sm text-muted-foreground">{monthLabel(year, month)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} aria-label="Exportar CSV">
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
          <Button onClick={() => newTransaction()} className="hidden md:inline-flex">
            <Plus className="size-4" /> Nova transação
          </Button>
        </div>
      </div>

      <div className="flex gap-2 lg:flex-col">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pela descrição"
            aria-label="Buscar pela descrição"
            className="h-11 pl-9 md:h-9"
            maxLength={120}
          />
        </div>
        {isMobile ? (
          <Button variant="outline" className="relative h-11" onClick={() => setFiltersOpen(true)} aria-label="Filtros">
            <SlidersHorizontal className="size-4" />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </Button>
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">{filterControls}</div>
        )}
      </div>

      {isMobile && (
        <ResponsiveDialog open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtros">
          <div className="grid gap-4">
            {filterControls}
            <div className="grid grid-cols-2 gap-2 [&>button]:h-11">
              <Button variant="ghost" onClick={clearFilters}>
                Limpar
              </Button>
              <Button onClick={() => setFiltersOpen(false)}>Ver resultados</Button>
            </div>
          </div>
        </ResponsiveDialog>
      )}

      {data && (
        <dl className="grid grid-cols-3 divide-x rounded-xl border bg-card text-sm">
          {[
            { label: 'Receitas', value: data.totals.income, className: 'text-income' },
            { label: 'Despesas', value: data.totals.expense, className: 'text-expense' },
            { label: 'Resultado', value: data.totals.net, className: Number(data.totals.net) >= 0 ? 'text-foreground' : 'text-expense' },
          ].map((t) => (
            <div key={t.label} className="min-w-0 px-3 py-3 sm:px-5">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className={cn('mt-0.5 truncate font-semibold tabular sm:text-lg', t.className)}>{formatMoney(t.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className={cn('min-w-0 overflow-hidden rounded-2xl border bg-card transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        {isLoading ? (
          <div className="grid gap-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !data?.data.length ? (
          <div className="p-5">
            <EmptyState
              text={filtered ? 'Nenhuma transação encontrada com esses filtros.' : 'Nenhuma transação neste mês ainda.'}
              action={
                filtered ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => newTransaction()}>
                    <Plus className="size-4" /> Registrar a primeira
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {data.data.map((t, i) => {
                const day = SORTS[sort].sortBy === 'date' && (i === 0 || data.data[i - 1].date !== t.date) ? t.date : null
                return [
                  day && (
                    <li key={`day-${day}`} className="sticky top-14 z-[1] flex items-center justify-between bg-card/95 px-4 pt-4 pb-1.5 text-xs font-medium text-muted-foreground backdrop-blur md:px-5">
                      <span className="first-letter:uppercase">{dayLabel(day)}</span>
                      <span className="tabular">{signedMoney(dayTotal(data.data, day))}</span>
                    </li>
                  ),
                <motion.li
                  key={t.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: Math.min(i, 10) * 0.015 } }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 pr-2 hover:bg-muted/40"
                >
                  <button
                    type="button"
                    onClick={() => editTransaction(t)}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left md:pl-5"
                  >
                    <CategoryIcon icon={t.category.icon} color={t.category.color} />
                    <span className="grid min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {t.installment ? t.description.replace(/\s*\(\d+\/\d+\)$/, '') : t.description}
                        </span>
                        {t.installment && (
                          <Badge variant="secondary" className="shrink-0 tabular">
                            {t.installment.number}/{t.installment.total}
                          </Badge>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {SORTS[sort].sortBy !== 'date' && (
                          <>
                            <span className="md:hidden">{formatShortDate(t.date)} · </span>
                            <span className="hidden md:inline">{formatDate(t.date)} · </span>
                          </>
                        )}
                        {t.category.name} · {t.account.name}
                        {/* Only the partner's entries say who registered them. */}
                        {shared && t.createdBy && t.createdBy.id !== user?.id && ` · por ${t.createdBy.name.split(' ')[0]}`}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-right font-medium whitespace-nowrap tabular', t.type === 'INCOME' && 'text-income')}>
                      {t.type === 'INCOME' ? '+' : '−'} {formatMoney(t.amount)}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label={`Ações para ${t.description}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => editTransaction(t)}>
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(t)}>
                        <Trash2 className="size-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.li>,
                ]
              })}
            </AnimatePresence>
          </ul>
        )}

        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
            <span className="tabular">
              {data.meta.total} transações · {data.meta.page}/{data.meta.totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Próxima página">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete && !toDelete.installment}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir transação?"
        description={toDelete ? `"${toDelete.description}" (${formatMoney(toDelete.amount)}) será excluída permanentemente.` : ''}
        confirmLabel="Excluir"
        onConfirm={() => deleteWith('single')}
      />

      <ResponsiveDialog
        open={!!toDelete?.installment}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir parcela"
        description={toDelete?.installment ? `${toDelete.description} é a parcela ${toDelete.installment.number} de ${toDelete.installment.total}.` : ''}
      >
        <div className="grid gap-2 [&>button]:h-11 [&>button]:justify-start">
          <Button variant="outline" onClick={() => deleteWith('single')}>Só esta parcela</Button>
          <Button variant="outline" onClick={() => deleteWith('future')}>Esta e as próximas</Button>
          <Button variant="destructive" onClick={() => deleteWith('all')}>Todas as parcelas da compra</Button>
          <Button variant="ghost" onClick={() => setToDelete(null)}>Cancelar</Button>
        </div>
      </ResponsiveDialog>
    </div>
  )
}
