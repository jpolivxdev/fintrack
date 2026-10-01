import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryIcon } from '@/components/category-icon'
import { FormField } from '@/components/form-field'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategories, useSaveTransaction } from '@/hooks/queries'
import { errorMessage } from '@/lib/api'
import { parseMoneyInput, toMoneyInput, todayISO } from '@/lib/format'
import type { Transaction, TransactionType } from '@/lib/types'
import { TransactionDialogContext } from './transaction-dialog-context'

const schema = z.object({
  type: z.enum(['EXPENSE', 'INCOME']),
  description: z.string().trim().min(1, 'Descreva a transação').max(120, 'Máximo de 120 caracteres'),
  amount: z
    .string()
    .refine((v) => {
      const n = parseMoneyInput(v)
      return n !== null && n > 0
    }, 'Informe um valor maior que zero, ex.: 89,90'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
  categoryId: z.string().uuid('Escolha uma categoria'),
  notes: z.string().max(500, 'Máximo de 500 caracteres').optional(),
})
type FormValues = z.infer<typeof schema>


export function TransactionDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; editing?: Transaction; type: TransactionType }>({
    open: false,
    type: 'EXPENSE',
  })

  const openNew = useCallback((type: TransactionType = 'EXPENSE') => setState({ open: true, type }), [])
  const openEdit = useCallback(
    (transaction: Transaction) => setState({ open: true, editing: transaction, type: transaction.type }),
    [],
  )

  // "N" anywhere (outside inputs) starts a new transaction.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return
      if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      event.preventDefault()
      openNew()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNew])

  const api = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit])

  return (
    <TransactionDialogContext.Provider value={api}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-md">
          {state.open && (
            <TransactionForm
              editing={state.editing}
              initialType={state.type}
              onDone={() => setState((s) => ({ ...s, open: false }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </TransactionDialogContext.Provider>
  )
}

function TransactionForm({
  editing,
  initialType,
  onDone,
}: {
  editing?: Transaction
  initialType: TransactionType
  onDone: () => void
}) {
  const { data: categories = [] } = useCategories()
  const save = useSaveTransaction()

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          type: editing.type,
          description: editing.description,
          amount: toMoneyInput(editing.amount),
          date: editing.date,
          categoryId: editing.category.id,
          notes: editing.notes ?? '',
        }
      : { type: initialType, description: '', amount: '', date: todayISO(), categoryId: '', notes: '' },
  })

  const type = watch('type')
  const categoryId = watch('categoryId')
  const options = categories.filter((c) => c.type === type)

  // A category of the other type is not valid anymore after switching type.
  useEffect(() => {
    if (categoryId && !options.some((c) => c.id === categoryId)) setValue('categoryId', '')
  }, [type, categoryId, options, setValue])

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: editing?.id,
        input: {
          type: values.type,
          description: values.description,
          amount: parseMoneyInput(values.amount)!,
          date: values.date,
          categoryId: values.categoryId,
          notes: values.notes?.trim() || undefined,
        },
      })
      toast.success(editing ? 'Transação atualizada.' : 'Transação registrada.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar transação' : 'Nova transação'}</DialogTitle>
        <DialogDescription>
          {editing ? 'Altere o que precisar e salve.' : 'Dica: aperte N em qualquer tela para abrir este formulário.'}
        </DialogDescription>
      </DialogHeader>

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SegmentedControl
            ariaLabel="Tipo da transação"
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: 'EXPENSE', label: 'Despesa' },
              { value: 'INCOME', label: 'Receita' },
            ]}
          />
        )}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <FormField id="tx-description" label="Descrição" error={errors.description?.message}>
          <Input
            id="tx-description"
            placeholder={type === 'EXPENSE' ? 'Ex.: Supermercado' : 'Ex.: Salário'}
            autoFocus
            aria-invalid={!!errors.description}
            {...register('description')}
          />
        </FormField>
        <FormField id="tx-amount" label="Valor (R$)" error={errors.amount?.message}>
          <Input
            id="tx-amount"
            inputMode="decimal"
            placeholder="0,00"
            className="tabular text-right"
            aria-invalid={!!errors.amount}
            {...register('amount')}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="tx-category" label="Categoria" error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="tx-category" className="w-full" aria-invalid={!!errors.categoryId}>
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
        <FormField id="tx-date" label="Data" error={errors.date?.message}>
          <Input id="tx-date" type="date" className="tabular" aria-invalid={!!errors.date} {...register('date')} />
        </FormField>
      </div>

      <FormField id="tx-notes" label="Observações (opcional)" error={errors.notes?.message}>
        <textarea
          id="tx-notes"
          rows={2}
          className="min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          {...register('notes')}
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Salvar alterações' : 'Registrar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
