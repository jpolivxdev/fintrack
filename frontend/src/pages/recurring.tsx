import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryIcon } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { FormField } from '@/components/form-field'
import { FormActions, ResponsiveDialog } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useCategories } from '@/hooks/queries'
import { useAccounts, useDeleteRecurring, useRecurring, useSaveRecurring } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatDate, formatMoney, parseMoneyInput, toMoneyInput, todayISO } from '@/lib/format'
import type { RecurrenceFrequency, RecurringRule, TransactionType } from '@/lib/types'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "Todo mês, dia 10" / "Toda sexta" / "Todo ano em 15 mar". */
export function describeSchedule(frequency: RecurrenceFrequency, startDate: string): string {
  const [y, m, d] = startDate.split('-').map(Number)
  if (frequency === 'WEEKLY') {
    const weekday = new Date(y, m - 1, d).getDay()
    return `Toda ${WEEKDAYS[weekday]}`.replace('Toda domingo', 'Todo domingo').replace('Toda sábado', 'Todo sábado')
  }
  if (frequency === 'MONTHLY') return d >= 29 ? `Todo mês, dia ${d} (ou o último)` : `Todo mês, dia ${d}`
  return `Todo ano em ${d} ${MONTHS[m - 1]}`
}

export function RecurringPage() {
  const { data: rules = [], isLoading } = useRecurring()
  const save = useSaveRecurring()
  const remove = useDeleteRecurring()
  const [dialog, setDialog] = useState<{ open: boolean; editing?: RecurringRule }>({ open: false })
  const [toDelete, setToDelete] = useState<RecurringRule | null>(null)

  const monthlyNet = rules
    .filter((r) => r.active && r.frequency === 'MONTHLY')
    .reduce((acc, r) => acc + (r.type === 'INCOME' ? 1 : -1) * Number(r.amount), 0)

  async function toggle(rule: RecurringRule) {
    try {
      await save.mutateAsync({ id: rule.id, input: { active: !rule.active } })
      toast.success(rule.active ? 'Recorrência pausada.' : 'Recorrência retomada.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await remove.mutateAsync(toDelete.id)
      toast.success('Recorrência excluída. As transações já lançadas continuam no histórico.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  const groups: Array<{ type: TransactionType; title: string }> = [
    { type: 'INCOME', title: 'Entradas fixas' },
    { type: 'EXPENSE', title: 'Contas fixas' },
  ]

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Recorrentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Salário, aluguel e assinaturas lançados sozinhos na data certa.</p>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="size-4" /> Nova recorrência
        </Button>
      </div>

      {rules.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">Saldo mensal das recorrências ativas</p>
          <p className={cn('mt-1 text-3xl font-semibold tracking-[-0.03em] tabular', monthlyNet < 0 ? 'text-expense' : 'text-income')}>
            {monthlyNet >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(monthlyNet))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Considera só as mensais: o que entra menos o que já sai todo mês.</p>
        </section>
      )}

      {isLoading ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : rules.length === 0 ? (
        <EmptyState
          text="Nenhuma recorrência. Cadastre o salário e as contas fixas uma vez e o FinTrack lança todo mês."
          action={<Button size="sm" onClick={() => setDialog({ open: true })}>Cadastrar a primeira</Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map((group) => {
            const items = rules.filter((r) => r.type === group.type)
            if (items.length === 0) return null
            return (
              <section key={group.type} className="min-w-0 rounded-2xl border bg-card">
                <header className="border-b px-5 py-4">
                  <h2 className="font-semibold">
                    {group.title} <span className="font-normal text-muted-foreground tabular">· {items.length}</span>
                  </h2>
                </header>
                <ul className="divide-y">
                  {items.map((r) => (
                    <li key={r.id} className={cn('flex items-center gap-3 px-5 py-3', !r.active && 'opacity-60')}>
                      <CategoryIcon icon={r.category.icon} color={r.category.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.description}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {describeSchedule(r.frequency, r.startDate)} · {r.account.name}
                        </p>
                        <p className="text-xs text-muted-foreground tabular">
                          {r.active && r.nextDate ? `Próximo: ${formatDate(r.nextDate)}` : r.endDate && !r.active ? 'Encerrada' : 'Pausada'}
                        </p>
                      </div>
                      <span className={cn('font-medium tabular', r.type === 'INCOME' && 'text-income')}>{formatMoney(r.amount)}</span>
                      <Switch checked={r.active} onCheckedChange={() => void toggle(r)} aria-label={r.active ? 'Pausar' : 'Retomar'} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-10" aria-label={`Ações para ${r.description}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: r })}>
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(r)}>
                            <Trash2 className="size-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <ResponsiveDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        title={dialog.editing ? 'Editar recorrência' : 'Nova recorrência'}
        description={dialog.editing ? 'As mudanças valem para os próximos lançamentos.' : 'Lançamentos com data até hoje são criados na hora.'}
      >
        <RecurringForm editing={dialog.editing} onDone={() => setDialog({ open: false })} />
      </ResponsiveDialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir recorrência?"
        description={toDelete ? `"${toDelete.description}" deixa de ser lançada. O que já foi lançado continua no histórico.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

const schema = z.object({
  type: z.enum(['EXPENSE', 'INCOME']),
  description: z.string().trim().min(1, 'Descreva a recorrência').max(120),
  amount: z.string().refine((v) => (parseMoneyInput(v) ?? 0) > 0, 'Informe um valor maior que zero'),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
  categoryId: z.string().uuid('Escolha uma categoria'),
  accountId: z.string().uuid('Escolha uma conta'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
  endDate: z.string().optional(),
})
type Values = z.infer<typeof schema>

function RecurringForm({ editing, onDone }: { editing?: RecurringRule; onDone: () => void }) {
  const { data: categories = [] } = useCategories()
  const { data: accountsData } = useAccounts()
  const accounts = accountsData?.data ?? []
  const save = useSaveRecurring()
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          type: editing.type,
          description: editing.description,
          amount: toMoneyInput(editing.amount),
          frequency: editing.frequency,
          categoryId: editing.category.id,
          accountId: editing.account.id,
          startDate: editing.startDate,
          endDate: editing.endDate ?? '',
        }
      : { type: 'EXPENSE', description: '', amount: '', frequency: 'MONTHLY', categoryId: '', accountId: '', startDate: todayISO(), endDate: '' },
  })
  const [type, categoryId, accountId, frequency, startDate] = watch(['type', 'categoryId', 'accountId', 'frequency', 'startDate'])
  const options = categories.filter((c) => c.type === type)

  useEffect(() => {
    if (categoryId && !options.some((c) => c.id === categoryId)) setValue('categoryId', '')
  }, [type, categoryId, options, setValue])
  useEffect(() => {
    if (!accountId && accounts.length) setValue('accountId', accounts[0].id)
  }, [accountId, accounts, setValue])

  async function onSubmit(v: Values) {
    const common = {
      description: v.description,
      amount: parseMoneyInput(v.amount)!,
      categoryId: v.categoryId,
      accountId: v.accountId,
      endDate: v.endDate || undefined,
    }
    try {
      await save.mutateAsync(
        editing
          ? { id: editing.id, input: common }
          : { input: { ...common, type: v.type, frequency: v.frequency, startDate: v.startDate } },
      )
      toast.success(editing ? 'Recorrência atualizada.' : 'Recorrência criada.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      {!editing && (
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <SegmentedControl
              ariaLabel="Tipo"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'EXPENSE', label: 'Conta / despesa' },
                { value: 'INCOME', label: 'Entrada' },
              ]}
            />
          )}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <FormField id="rec-description" label="Descrição" error={errors.description?.message}>
          <Input id="rec-description" placeholder={type === 'EXPENSE' ? 'Ex.: Aluguel' : 'Ex.: Salário'} maxLength={120} {...register('description')} />
        </FormField>
        <FormField id="rec-amount" label="Valor (R$)" error={errors.amount?.message}>
          <Input id="rec-amount" inputMode="decimal" placeholder="0,00" className="tabular" {...register('amount')} />
        </FormField>
      </div>
      {!editing && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="rec-frequency" label="Repete" hint={startDate ? describeSchedule(frequency, startDate) : undefined}>
            <Controller
              control={control}
              name="frequency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="rec-frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Todo mês</SelectItem>
                    <SelectItem value="WEEKLY">Toda semana</SelectItem>
                    <SelectItem value="YEARLY">Todo ano</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="rec-start" label="Primeiro lançamento" error={errors.startDate?.message}>
            <Input id="rec-start" type="date" className="tabular" {...register('startDate')} />
          </FormField>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="rec-category" label="Categoria" error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="rec-category" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((c) => (
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
        <FormField id="rec-account" label="Conta" error={errors.accountId?.message}>
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="rec-account" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <FormField id="rec-end" label="Termina em (opcional)" hint="Deixe em branco para repetir sem data para acabar.">
        <Input id="rec-end" type="date" className="tabular" {...register('endDate')} />
      </FormField>
      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Repeat className="size-4" />}
          Salvar
        </Button>
      </FormActions>
    </form>
  )
}
