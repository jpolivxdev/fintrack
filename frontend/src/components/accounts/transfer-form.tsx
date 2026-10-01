import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/form-field'
import { FormActions } from '@/components/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts, useSaveTransfer } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatMoney, parseMoneyInput, todayISO } from '@/lib/format'

const schema = z
  .object({
    fromAccountId: z.string().uuid('Escolha a conta de origem'),
    toAccountId: z.string().uuid('Escolha a conta de destino'),
    amount: z.string().refine((v) => (parseMoneyInput(v) ?? 0) > 0, 'Informe um valor maior que zero'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
    description: z.string().max(120).optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ['toAccountId'], message: 'Escolha outra conta' })
type Values = z.infer<typeof schema>

export function TransferForm({ onDone }: { onDone: () => void }) {
  const { data } = useAccounts()
  const accounts = data?.data ?? []
  const save = useSaveTransfer()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fromAccountId: '', toAccountId: '', amount: '', date: todayISO(), description: '' },
  })
  const [from, to] = watch(['fromAccountId', 'toAccountId'])

  // Sensible defaults: checking -> credit card (paying the bill) when available.
  useEffect(() => {
    if (accounts.length < 2 || from || to) return
    const card = accounts.find((a) => a.type === 'CREDIT_CARD')
    const source = accounts.find((a) => a.type === 'CHECKING') ?? accounts[0]
    setValue('fromAccountId', source.id)
    setValue('toAccountId', (card && card.id !== source.id ? card : accounts.find((a) => a.id !== source.id)!).id)
  }, [accounts, from, to, setValue])

  async function onSubmit(values: Values) {
    try {
      await save.mutateAsync({
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        amount: parseMoneyInput(values.amount)!,
        date: values.date,
        description: values.description?.trim() || undefined,
      })
      toast.success('Transferência registrada.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  if (accounts.length < 2) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Você precisa de pelo menos duas contas para transferir. Crie outra conta em <strong>Contas</strong>.
      </p>
    )
  }

  const accountSelect = (name: 'fromAccountId' | 'toAccountId', id: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Escolha" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} <span className="text-muted-foreground tabular">· {formatMoney(a.balance)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <FormField id="tr-from" label="De" error={errors.fromAccountId?.message}>
        {accountSelect('fromAccountId', 'tr-from')}
      </FormField>
      <div className="-my-2 flex justify-center text-muted-foreground" aria-hidden>
        <ArrowDown className="size-4" />
      </div>
      <FormField id="tr-to" label="Para" error={errors.toAccountId?.message}>
        {accountSelect('toAccountId', 'tr-to')}
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="tr-amount" label="Valor (R$)" error={errors.amount?.message}>
          <Input id="tr-amount" inputMode="decimal" placeholder="0,00" className="tabular" {...register('amount')} />
        </FormField>
        <FormField id="tr-date" label="Data" error={errors.date?.message}>
          <Input id="tr-date" type="date" className="tabular" {...register('date')} />
        </FormField>
      </div>
      <FormField id="tr-description" label="Descrição (opcional)">
        <Input id="tr-description" placeholder="Ex.: Pagamento da fatura" maxLength={120} {...register('description')} />
      </FormField>
      <p className="text-xs text-muted-foreground">Transferências não entram como receita nem despesa nos relatórios.</p>
      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Transferir
        </Button>
      </FormActions>
    </form>
  )
}
