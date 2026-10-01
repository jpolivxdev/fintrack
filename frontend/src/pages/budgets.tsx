import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryIcon } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useBudgetVsActual, useCategories, useCopyBudgets, useDeleteBudget, useSaveBudget } from '@/hooks/queries'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatPercent, monthLabel, parseMoneyInput, toMoneyInput } from '@/lib/format'
import { useMonth } from '@/lib/month'
import type { Budget } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BudgetBar } from '@/components/budget-bar'
import { BUDGET_STATUS } from '@/components/budget-status'
import { EmptyState } from '@/components/empty-state'

export function BudgetsPage() {
  const { year, month } = useMonth()
  const { data, isLoading } = useBudgetVsActual(year, month)
  const copy = useCopyBudgets()
  const remove = useDeleteBudget()
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Budget }>({ open: false })
  const [toDelete, setToDelete] = useState<Budget | null>(null)

  const budgets = data?.budgets ?? []

  async function copyPrevious() {
    try {
      const result = await copy.mutateAsync({ year, month })
      toast.success(
        result.created > 0
          ? `${result.created} orçamento(s) copiado(s) do mês anterior.`
          : 'Nada a copiar: o mês anterior não tem orçamentos novos para este mês.',
      )
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await remove.mutateAsync(toDelete.id)
      toast.success('Orçamento excluído.')
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
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Orçamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Limites de gasto por categoria em {monthLabel(year, month).toLowerCase()}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyPrevious} disabled={copy.isPending}>
            {copy.isPending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            Copiar do mês anterior
          </Button>
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="size-4" /> Novo orçamento
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : (
        data &&
        budgets.length > 0 && (
          <section className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div className="grid gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-muted-foreground">Gasto nas categorias com orçamento</p>
                <p className="text-sm font-medium tabular">{formatPercent(data.totals.percentUsed)}</p>
              </div>
              <p className="text-3xl font-semibold tracking-[-0.03em] tabular">
                {formatMoney(data.totals.spent)}
                <span className="text-base font-normal text-muted-foreground"> de {formatMoney(data.totals.limit)}</span>
              </p>
              <BudgetBar
                percent={data.totals.percentUsed}
                status={data.totals.percentUsed > 100 ? 'EXCEEDED' : data.totals.percentUsed >= 80 ? 'WARNING' : 'ON_TRACK'}
              />
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm md:border-l md:pl-6">
              <div>
                <dt className="text-muted-foreground">Disponível</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular">{formatMoney(data.totals.remaining)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estourados</dt>
                <dd className={cn('mt-0.5 text-lg font-semibold tabular', data.exceededCount > 0 && 'text-expense')}>
                  {data.exceededCount} de {budgets.length}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Gasto fora de qualquer orçamento</dt>
                <dd className="mt-0.5 font-medium tabular">{formatMoney(data.unbudgetedSpent)}</dd>
              </div>
            </dl>
          </section>
        )
      )}

      {isLoading ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : budgets.length === 0 ? (
        <EmptyState
          text="Nenhum orçamento para este mês. Defina limites para saber, com antecedência, quando o gasto sai do plano."
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyPrevious}>Copiar do mês anterior</Button>
              <Button size="sm" onClick={() => setDialog({ open: true })}>Definir o primeiro</Button>
            </div>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {[...budgets]
            .sort((a, b) => b.percentUsed - a.percentUsed)
            .map((b, i) => {
              const status = BUDGET_STATUS[b.status]
              return (
                <motion.li
                  key={b.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="grid gap-3 rounded-2xl border bg-card p-5"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={b.category.icon} color={b.category.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.category.name}</p>
                      <p className={cn('text-xs font-medium', status.text)}>{status.label}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${b.category.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: b })}>
                          <Pencil className="size-4" /> Alterar limite
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(b)}>
                          <Trash2 className="size-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <BudgetBar percent={b.percentUsed} status={b.status} />
                  <div className="flex justify-between text-sm tabular">
                    <span>
                      <span className="font-medium">{formatMoney(b.spent)}</span>
                      <span className="text-muted-foreground"> de {formatMoney(b.monthlyLimit)}</span>
                    </span>
                    <span className={cn(b.status === 'EXCEEDED' ? 'text-expense' : 'text-muted-foreground')}>
                      {b.status === 'EXCEEDED'
                        ? `${formatMoney(Number(b.spent) - Number(b.monthlyLimit))} acima`
                        : `restam ${formatMoney(b.remaining)}`}
                    </span>
                  </div>
                </motion.li>
              )
            })}
        </ul>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-sm">
          {dialog.open && (
            <BudgetForm
              editing={dialog.editing}
              takenCategoryIds={budgets.map((b) => b.category.id)}
              onDone={() => setDialog({ open: false })}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir orçamento?"
        description={toDelete ? `O limite de ${toDelete.category.name} neste mês será removido. As transações não são afetadas.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

const budgetSchema = z.object({
  categoryId: z.string().uuid('Escolha uma categoria'),
  limit: z.string().refine((v) => {
    const n = parseMoneyInput(v)
    return n !== null && n > 0
  }, 'Informe um valor maior que zero'),
})
type BudgetValues = z.infer<typeof budgetSchema>

function BudgetForm({ editing, takenCategoryIds, onDone }: { editing?: Budget; takenCategoryIds: string[]; onDone: () => void }) {
  const { year, month } = useMonth()
  const { data: categories = [] } = useCategories()
  const save = useSaveBudget()
  const available = categories.filter((c) => c.type === 'EXPENSE' && (!takenCategoryIds.includes(c.id) || c.id === editing?.category.id))

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BudgetValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { categoryId: editing?.category.id ?? '', limit: editing ? toMoneyInput(editing.monthlyLimit) : '' },
  })

  async function onSubmit(values: BudgetValues) {
    const monthlyLimit = parseMoneyInput(values.limit)!
    try {
      await save.mutateAsync(editing ? { id: editing.id, monthlyLimit } : { categoryId: values.categoryId, year, month, monthlyLimit })
      toast.success(editing ? 'Limite atualizado.' : 'Orçamento criado.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{editing ? `Limite de ${editing.category.name}` : 'Novo orçamento'}</DialogTitle>
        <DialogDescription>{monthLabel(year, month)}. Você recebe um alerta visual a partir de 80% do limite.</DialogDescription>
      </DialogHeader>
      {!editing && (
        <FormField id="budget-category" label="Categoria de despesa" error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="budget-category" className="w-full">
                  <SelectValue placeholder={available.length ? 'Escolha' : 'Todas já têm orçamento'} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" className="size-5 rounded-md" />
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      )}
      <FormField id="budget-limit" label="Limite mensal (R$)" error={errors.limit?.message}>
        <Input id="budget-limit" inputMode="decimal" placeholder="0,00" className="tabular" autoFocus {...register('limit')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
