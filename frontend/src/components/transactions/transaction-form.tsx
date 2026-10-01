import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryIcon } from '@/components/category-icon'
import { FormField } from '@/components/form-field'
import { FormActions } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategories, useSaveTransaction } from '@/hooks/queries'
import { useAccounts } from '@/hooks/queries-more'
import { useIsMobile } from '@/hooks/use-mobile'
import { errorMessage } from '@/lib/api'
import { formatMoney, parseMoneyInput, toMoneyInput, todayISO } from '@/lib/format'
import type { Transaction, TransactionType } from '@/lib/types'

const schema = z.object({
  type: z.enum(['EXPENSE', 'INCOME']),
  description: z.string().trim().min(1, 'Descreva a transação').max(120, 'Máximo de 120 caracteres'),
  amount: z.string().refine((v) => {
    const n = parseMoneyInput(v)
    return n !== null && n > 0
  }, 'Informe um valor maior que zero, ex.: 89,90'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
  categoryId: z.string().uuid('Escolha uma categoria'),
  accountId: z.string().uuid('Escolha uma conta'),
  installments: z.string(),
  notes: z.string().max(500, 'Máximo de 500 caracteres').optional(),
})
type FormValues = z.infer<typeof schema>

export const textareaClass =
  'min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30'

export function TransactionForm({
  editing,
  initialType,
  onDone,
}: {
  editing?: Transaction
  initialType: TransactionType
  onDone: () => void
}) {
  const isMobile = useIsMobile()
  const { data: categories = [] } = useCategories()
  const { data: accountsData } = useAccounts()
  const accounts = accountsData?.data ?? []
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
          accountId: editing.account.id,
          installments: '1',
          notes: editing.notes ?? '',
        }
      : { type: initialType, description: '', amount: '', date: todayISO(), categoryId: '', accountId: '', installments: '1', notes: '' },
  })

  const [type, categoryId, accountId, amountText, installments] = watch(['type', 'categoryId', 'accountId', 'amount', 'installments'])
  const options = categories.filter((c) => c.type === type)
  const count = Number(installments)
  const amount = parseMoneyInput(amountText ?? '')

  // A category of the other type is no longer valid after switching type.
  useEffect(() => {
    if (categoryId && !options.some((c) => c.id === categoryId)) setValue('categoryId', '')
  }, [type, categoryId, options, setValue])

  // New entries default to the first (oldest) active account.
  useEffect(() => {
    if (!accountId && accounts.length > 0) setValue('accountId', accounts[0].id)
  }, [accountId, accounts, setValue])

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
          accountId: values.accountId,
          installments: !editing && values.type === 'EXPENSE' && count > 1 ? count : undefined,
          notes: values.notes?.trim() || undefined,
        },
      })
      toast.success(
        editing ? 'Transação atualizada.' : count > 1 && values.type === 'EXPENSE' ? `Compra registrada em ${count}x.` : 'Transação registrada.',
      )
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
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
            autoFocus={!isMobile}
            aria-invalid={!!errors.description}
            {...register('description')}
          />
        </FormField>
        <FormField id="tx-amount" label={count > 1 ? 'Valor total (R$)' : 'Valor (R$)'} error={errors.amount?.message}>
          <Input id="tx-amount" inputMode="decimal" placeholder="0,00" className="tabular sm:text-right" aria-invalid={!!errors.amount} {...register('amount')} />
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
        <FormField id="tx-account" label="Conta" error={errors.accountId?.message}>
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="tx-account" className="w-full">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="tx-date" label={count > 1 ? 'Data da 1ª parcela' : 'Data'} error={errors.date?.message}>
          <Input id="tx-date" type="date" className="tabular" aria-invalid={!!errors.date} {...register('date')} />
        </FormField>
        {!editing && type === 'EXPENSE' && (
          <FormField
            id="tx-installments"
            label="Parcelas"
            hint={count > 1 && amount ? `${count}x de ${formatMoney(Math.floor((amount * 100) / count) / 100)}` : 'À vista ou parcelado no cartão'}
          >
            <Controller
              control={control}
              name="installments"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="tx-installments" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? 'À vista' : `${n}x`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        )}
      </div>

      <FormField id="tx-notes" label="Observações (opcional)" error={errors.notes?.message}>
        <textarea id="tx-notes" rows={2} className={textareaClass} {...register('notes')} />
      </FormField>

      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Salvar alterações' : 'Registrar'}
        </Button>
      </FormActions>
    </form>
  )
}
