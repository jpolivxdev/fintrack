import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CATEGORY_COLORS } from '@/components/category-icon'
import { FormField } from '@/components/form-field'
import { FormActions } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts, usePortfolio, useSaveInvestment } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatMoney, parseMoneyInput, toMoneyInput, todayISO } from '@/lib/format'
import type { Investment, InvestmentClass, YieldMode } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CLASS_LABEL, DEFAULT_MODE } from './labels'

const ALREADY = 'already'
const EXISTING = 'existing'

const schema = z
  .object({
    source: z.string(), // 'new' | 'existing'
    accountId: z.string(),
    name: z.string().max(40),
    assetClass: z.string(),
    yieldMode: z.enum(['CDI_PERCENT', 'FIXED_RATE', 'IPCA_PLUS', 'MANUAL']),
    rate: z.string(),
    startDate: z.string(),
    initialAmount: z.string(),
    fromAccountId: z.string(),
    maturityDate: z.string(),
    color: z.string(),
  })
  .refine((v) => v.source === EXISTING || v.name.trim().length > 0, { path: ['name'], message: 'Dê um nome' })
  .refine((v) => v.source !== EXISTING || !!v.accountId, { path: ['accountId'], message: 'Escolha a conta' })
  .refine((v) => v.yieldMode === 'MANUAL' || parseMoneyInput(v.rate) !== null, { path: ['rate'], message: 'Informe a taxa' })
  .refine(
    (v) => v.yieldMode !== 'CDI_PERCENT' || ((parseMoneyInput(v.rate) ?? 0) >= 1 && (parseMoneyInput(v.rate) ?? 0) <= 300),
    { path: ['rate'], message: 'Entre 1% e 300% do CDI' },
  )
  .refine((v) => !v.initialAmount || (parseMoneyInput(v.initialAmount) ?? 0) > 0, { path: ['initialAmount'], message: 'Valor inválido' })
  .refine((v) => v.fromAccountId === ALREADY || (parseMoneyInput(v.initialAmount) ?? 0) > 0, {
    path: ['initialAmount'],
    message: 'Informe quanto saiu da conta',
  })
  .refine((v) => !v.startDate || v.startDate <= todayISO(), { path: ['startDate'], message: 'Não pode ser no futuro' })
type Values = z.infer<typeof schema>

const RATE_LABEL: Record<YieldMode, string> = {
  CDI_PERCENT: 'Rende quantos % do CDI?',
  FIXED_RATE: 'Taxa ao ano (%)',
  IPCA_PLUS: 'IPCA + quantos % ao ano?',
  MANUAL: '',
}
const RATE_HINT: Record<YieldMode, string> = {
  CDI_PERCENT: 'Ex.: 100 para conta remunerada ou Tesouro Selic, 110 para um CDB de 110% do CDI.',
  FIXED_RATE: 'Ex.: 12,5 para um CDB prefixado de 12,5% a.a.',
  IPCA_PLUS: 'Ex.: 6 para um Tesouro IPCA+ 6%.',
  MANUAL: 'Para ações, FIIs, cripto e fundos: o valor muda quando você informa o que aparece na corretora.',
}

export function InvestmentForm({ editing, onDone }: { editing?: Investment; onDone: () => void }) {
  const { data: accountsData } = useAccounts()
  const { data: portfolio } = usePortfolio()
  const save = useSaveInvestment()
  const accounts = accountsData?.data ?? []
  const tracked = new Set((portfolio?.items ?? []).map((i) => i.account.id))
  const trackable = accounts.filter((a) => (a.type === 'SAVINGS' || a.type === 'INVESTMENT') && !tracked.has(a.id))
  const sources = accounts.filter((a) => a.type === 'CHECKING' || a.type === 'SAVINGS' || a.type === 'CASH')

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          source: 'new',
          accountId: '',
          name: editing.account.name,
          assetClass: editing.assetClass,
          yieldMode: editing.yieldMode,
          rate: editing.rate ? toMoneyInput(editing.rate) : '',
          startDate: editing.startDate,
          initialAmount: '',
          fromAccountId: ALREADY,
          maturityDate: editing.maturityDate ?? '',
          color: editing.account.color ?? CATEGORY_COLORS[5],
        }
      : {
          source: 'new',
          accountId: '',
          name: '',
          assetClass: 'FIXED_INCOME',
          yieldMode: 'CDI_PERCENT',
          rate: '100',
          startDate: todayISO(),
          initialAmount: '',
          fromAccountId: ALREADY,
          maturityDate: '',
          color: CATEGORY_COLORS[5],
        },
  })
  const [source, yieldMode, color] = watch(['source', 'yieldMode', 'color'])

  async function onSubmit(v: Values) {
    const rate = v.yieldMode === 'MANUAL' ? null : parseMoneyInput(v.rate)
    try {
      if (editing) {
        await save.mutateAsync({
          id: editing.id,
          input: {
            name: v.name.trim(),
            assetClass: v.assetClass as InvestmentClass,
            yieldMode: v.yieldMode,
            rate,
            maturityDate: v.maturityDate || null,
            color: v.color,
          },
        })
        toast.success('Investimento atualizado.')
      } else {
        const amount = parseMoneyInput(v.initialAmount)
        await save.mutateAsync({
          input: {
            ...(v.source === EXISTING ? { accountId: v.accountId } : { name: v.name.trim(), color: v.color }),
            assetClass: v.assetClass as InvestmentClass,
            yieldMode: v.yieldMode,
            rate: rate ?? undefined,
            startDate: v.startDate || undefined,
            maturityDate: v.maturityDate || undefined,
            ...(v.source !== EXISTING && amount ? { initialAmount: amount } : {}),
            ...(v.source !== EXISTING && v.fromAccountId !== ALREADY ? { fromAccountId: v.fromAccountId } : {}),
          },
        })
        toast.success('Investimento criado.')
      }
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      {!editing && trackable.length > 0 && (
        <Controller
          control={control}
          name="source"
          render={({ field }) => (
            <SegmentedControl
              ariaLabel="Origem"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'new', label: 'Novo investimento' },
                { value: EXISTING, label: 'Conta que já existe' },
              ]}
              className="w-full [&>button]:flex-1"
            />
          )}
        />
      )}

      {source === EXISTING ? (
        <FormField id="inv-account" label="Qual conta?" error={errors.accountId?.message} hint="O saldo inicial dela vira o valor já investido.">
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="inv-account" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {trackable.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} <span className="text-muted-foreground tabular">· {formatMoney(a.balance)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      ) : (
        <FormField id="inv-name" label="Nome" error={errors.name?.message}>
          <Input id="inv-name" placeholder="Ex.: CDB Banco Inter, Tesouro Selic 2029, Ações" maxLength={40} {...register('name')} />
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="inv-class" label="Tipo">
          <Controller
            control={control}
            name="assetClass"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v)
                  if (!editing) setValue('yieldMode', DEFAULT_MODE[v as InvestmentClass])
                }}
              >
                <SelectTrigger id="inv-class" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CLASS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="inv-mode" label="Como rende">
          <Controller
            control={control}
            name="yieldMode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="inv-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CDI_PERCENT">Pós-fixado (% do CDI)</SelectItem>
                  <SelectItem value="FIXED_RATE">Prefixado (% ao ano)</SelectItem>
                  <SelectItem value="IPCA_PLUS">IPCA + taxa</SelectItem>
                  <SelectItem value="MANUAL">Valor de mercado (manual)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>

      {yieldMode === 'MANUAL' ? (
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{RATE_HINT.MANUAL}</p>
      ) : (
        <FormField id="inv-rate" label={RATE_LABEL[yieldMode]} error={errors.rate?.message} hint={RATE_HINT[yieldMode]}>
          <Input id="inv-rate" inputMode="decimal" className="tabular" {...register('rate')} />
        </FormField>
      )}

      {!editing && source !== EXISTING && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="inv-amount" label="Valor investido (R$)" error={errors.initialAmount?.message}>
              <Input id="inv-amount" inputMode="decimal" placeholder="0,00" className="tabular" {...register('initialAmount')} />
            </FormField>
            <FormField id="inv-start" label="Desde quando" error={errors.startDate?.message}>
              <Input id="inv-start" type="date" className="tabular" max={todayISO()} {...register('startDate')} />
            </FormField>
          </div>
          <FormField id="inv-from" label="De onde saiu o dinheiro?">
            <Controller
              control={control}
              name="fromAccountId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="inv-from" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALREADY}>Já estava investido (não mexe nas contas)</SelectItem>
                    {sources.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        Saiu de {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </>
      )}
      {!editing && source === EXISTING && (
        <FormField id="inv-start2" label="Desde quando rende" error={errors.startDate?.message}>
          <Input id="inv-start2" type="date" className="tabular" max={todayISO()} {...register('startDate')} />
        </FormField>
      )}

      <FormField id="inv-maturity" label="Vencimento (opcional)">
        <Input id="inv-maturity" type="date" className="tabular" {...register('maturityDate')} />
      </FormField>

      {source !== EXISTING && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Cor</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setValue('color', c)}
                className={cn('size-7 rounded-full ring-offset-2 ring-offset-background transition', color === c && 'ring-2 ring-ring')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Salvar' : 'Criar investimento'}
        </Button>
      </FormActions>
    </form>
  )
}
