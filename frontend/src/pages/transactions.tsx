import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { useTransactionDialog } from '@/components/transactions/transaction-dialog-context'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories, useDeleteTransaction, useTransactions, type TransactionFilters } from '@/hooks/queries'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { errorMessage } from '@/lib/api'
import { formatDate, formatMoney, monthLabel } from '@/lib/format'
import { useMonth } from '@/lib/month'
import type { Transaction, TransactionType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/empty-state'

const PAGE_SIZE = 15

const SORTS = {
  recent: { label: 'Mais recentes', sortBy: 'date', order: 'desc' },
  oldest: { label: 'Mais antigas', sortBy: 'date', order: 'asc' },
  highest: { label: 'Maior valor', sortBy: 'amount', order: 'desc' },
  lowest: { label: 'Menor valor', sortBy: 'amount', order: 'asc' },
} as const
type SortKey = keyof typeof SORTS

export function TransactionsPage() {
  const { year, month, start, end } = useMonth()
  const { openNew, openEdit } = useTransactionDialog()
  const { data: categories = [] } = useCategories()
  const remove = useDeleteTransaction()

  const [type, setType] = useState<'ALL' | TransactionType>('ALL')
  const [categoryId, setCategoryId] = useState('ALL')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [toDelete, setToDelete] = useState<Transaction | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim())

  // The page belongs to one combination of filters: change any filter and it
  // naturally falls back to page 1 (derived during render, no effect needed).
  const filterKey = [type, categoryId, debouncedSearch, sort, start].join('|')
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
    search: debouncedSearch || undefined,
    sortBy: SORTS[sort].sortBy,
    order: SORTS[sort].order,
  }
  const { data, isLoading, isFetching } = useTransactions(filters)
  const categoryOptions = categories.filter((c) => type === 'ALL' || c.type === type)
  const filtered = type !== 'ALL' || categoryId !== 'ALL' || !!debouncedSearch

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await remove.mutateAsync(toDelete.id)
      toast.success('Transação excluída.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Transações</h1>
          <p className="mt-1 text-sm text-muted-foreground">{monthLabel(year, month)}</p>
        </div>
        <Button onClick={() => openNew()} className="hidden sm:inline-flex">
          <Plus className="size-4" /> Nova transação
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pela descrição"
            aria-label="Buscar pela descrição"
            className="pl-9"
            maxLength={120}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full lg:w-48" aria-label="Filtrar por categoria">
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
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-full lg:w-40" aria-label="Ordenar">
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
      </div>

      {/* Totals of everything matching the filters (computed by the API) */}
      {data && (
        <dl className="grid grid-cols-3 divide-x rounded-xl border bg-card text-sm">
          {[
            { label: 'Receitas', value: data.totals.income, className: 'text-income' },
            { label: 'Despesas', value: data.totals.expense, className: 'text-expense' },
            { label: 'Resultado', value: data.totals.net, className: Number(data.totals.net) >= 0 ? 'text-foreground' : 'text-expense' },
          ].map((t) => (
            <div key={t.label} className="px-3 py-3 sm:px-5">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className={cn('mt-0.5 font-semibold tabular sm:text-lg', t.className)}>{formatMoney(t.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* List */}
      <section className={cn('min-w-0 overflow-hidden rounded-2xl border bg-card transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        {isLoading ? (
          <div className="grid gap-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data?.data.length ? (
          <div className="p-5">
            <EmptyState
              text={filtered ? 'Nenhuma transação encontrada com esses filtros.' : 'Nenhuma transação neste mês ainda.'}
              action={
                filtered ? (
                  <Button variant="outline" size="sm" onClick={() => { setType('ALL'); setCategoryId('ALL'); setSearch('') }}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => openNew()}>
                    <Plus className="size-4" /> Registrar a primeira
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden border-b text-left text-xs text-muted-foreground md:table-header-group">
              <tr>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-3 py-3 font-medium">Descrição</th>
                <th className="px-3 py-3 font-medium">Categoria</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                <th className="w-12 px-3 py-3"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <AnimatePresence initial={false}>
                {data.data.map((t, i) => (
                  <motion.tr
                    key={t.id}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: Math.min(i, 10) * 0.015 } }}
                    exit={{ opacity: 0 }}
                    className="group hover:bg-muted/40"
                  >
                    <td className="hidden px-5 py-3 whitespace-nowrap text-muted-foreground tabular md:table-cell">{formatDate(t.date)}</td>
                    <td className="max-w-0 px-4 py-3 md:px-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon icon={t.category.icon} color={t.category.color} size="sm" className="md:hidden" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{t.description}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="md:hidden">{t.category.name} · {formatDate(t.date)}</span>
                            {t.notes && <span className="hidden md:inline">{t.notes}</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <CategoryIcon icon={t.category.icon} color={t.category.color} size="sm" />
                        <span className="truncate">{t.category.name}</span>
                      </span>
                    </td>
                    <td className={cn('px-3 py-3 text-right font-medium whitespace-nowrap tabular', t.type === 'INCOME' && 'text-income')}>
                      {t.type === 'INCOME' ? '+' : '−'} {formatMoney(t.amount)}
                    </td>
                    <td className="px-2 py-3 pr-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${t.description}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEdit(t)}>
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(t)}>
                            <Trash2 className="size-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}

        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
            <span className="tabular">
              {data.meta.total} transações · página {data.meta.page} de {data.meta.totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Próxima página">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir transação?"
        description={toDelete ? `"${toDelete.description}" (${formatMoney(toDelete.amount)}) será excluída permanentemente.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
