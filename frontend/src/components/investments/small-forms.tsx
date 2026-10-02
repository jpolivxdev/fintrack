import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/form-field'
import { FormActions } from '@/components/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts, useAddValuation, useSaveRecurring } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatMoney, parseMoneyInput, todayISO } from '@/lib/format'
import type { Investment } from '@/lib/types'

const valuationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data').refine((d) => d <= todayISO(), 'Não pode ser no futuro'),
  value: z.string().refine((v) => (parseMoneyInput(v) ?? -1) >= 0, 'Informe o valor'),
})

/** "Atualizar valor": what the broker/bank shows today (or on a past day). */
export function ValuationForm({ investment, onDone }: { investment: Investment; onDone: () => void }) {
  const add = useAddValuation()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof valuationSchema>>({
    resolver: zodResolver(valuationSchema),
    defaultValues: { date: todayISO(), value: '' },
  })

  async function onSubmit(v: z.infer<typeof valuationSchema>) {
    try {
      await add.mutateAsync({ id: investment.id, date: v.date, value: parseMoneyInput(v.value)! })
      toast.success('Valor atualizado.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Abra o app do banco ou da corretora e informe o saldo bruto de <strong className="text-foreground">{investment.account.name}</strong>. A partir dessa
        data, o FinTrack usa esse valor como base.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="val-value" label="Valor hoje (R$)" error={errors.value?.message} hint={`Estimativa atual: ${formatMoney(investment.value)}`}>
          <Input id="val-value" inputMode="decimal" placeholder="0,00" className="tabular" {...register('value')} />
        </FormField>
        <FormField id="val-date" label="Data" error={errors.date?.message}>
          <Input id="val-date" type="date" className="tabular" max={todayISO()} min={investment.startDate} {...register('date')} />
        </FormField>
      </div>
      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Salvar valor
        </Button>
      </FormActions>
    </form>
  )
}

const scheduleSchema = z.object({
  toAccountId: z.string().uuid('Escolha o investimento'),
  accountId: z.string().uuid('Escolha a conta'),
  description: z.string().min(1, 'Dê um nome').max(120),
  amount: z.string().refine((v) => (parseMoneyInput(v) ?? 0) > 0, 'Informe um valor maior que zero'),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
})

/** A recurring transfer into an investment ("todo dia 5, R$ 300 no CDB"). */
export function ScheduledContributionForm({
  investments,
  defaultInvestmentAccountId,
  onDone,
}: {
  investments: Investment[]
  defaultInvestmentAccountId?: string
  onDone: () => void
}) {
  const { data } = useAccounts()
  const save = useSaveRecurring()
  const sources = (data?.data ?? []).filter((a) => a.type === 'CHECKING' || a.type === 'SAVINGS' || a.type === 'CASH')
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      toAccountId: defaultInvestmentAccountId ?? investments[0]?.account.id ?? '',
      accountId: sources.find((a) => a.type === 'CHECKING')?.id ?? sources[0]?.id ?? '',
      description: 'Aporte mensal',
      amount: '',
      frequency: 'MONTHLY',
      startDate: todayISO(),
    },
  })

  async function onSubmit(v: z.infer<typeof scheduleSchema>) {
    try {
      await save.mutateAsync({
        input: {
          description: v.description.trim(),
          amount: parseMoneyInput(v.amount)!,
          type: 'EXPENSE',
          frequency: v.frequency,
          accountId: v.accountId,
          toAccountId: v.toAccountId,
          startDate: v.startDate,
        },
      })
      toast.success('Aporte programado. Ele entra sozinho na data certa.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const select = (name: 'toAccountId' | 'accountId', options: { id: string; label: string }[]) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={`sc-${name}`} className="w-full">
            <SelectValue placeholder="Escolha" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <FormField id="sc-toAccountId" label="Investimento" error={errors.toAccountId?.message}>
        {select('toAccountId', investments.map((i) => ({ id: i.account.id, label: i.account.name })))}
      </FormField>
      <FormField id="sc-accountId" label="Sai da conta" error={errors.accountId?.message}>
        {select('accountId', sources.map((a) => ({ id: a.id, label: a.name })))}
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="sc-amount" label="Valor (R$)" error={errors.amount?.message}>
          <Input id="sc-amount" inputMode="decimal" placeholder="0,00" className="tabular" {...register('amount')} />
        </FormField>
        <FormField id="sc-frequency" label="Repete">
          <Controller
            control={control}
            name="frequency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="sc-frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Toda semana</SelectItem>
                  <SelectItem value="MONTHLY">Todo mês</SelectItem>
                  <SelectItem value="YEARLY">Todo ano</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="sc-start" label="Primeiro aporte" error={errors.startDate?.message} hint="Os próximos caem no mesmo dia.">
          <Input id="sc-start" type="date" className="tabular" {...register('startDate')} />
        </FormField>
        <FormField id="sc-description" label="Nome" error={errors.description?.message}>
          <Input id="sc-description" maxLength={120} {...register('description')} />
        </FormField>
      </div>
      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Programar aporte
        </Button>
      </FormActions>
    </form>
  )
}
