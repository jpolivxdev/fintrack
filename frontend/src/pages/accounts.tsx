import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, ArchiveRestore, ArrowLeftRight, ArrowRight, Check, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ACCOUNT_TYPES, AccountIcon } from '@/components/accounts/account-icon'
import { CATEGORY_COLORS } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDialogs } from '@/components/dialogs/dialogs-context'
import { EmptyState } from '@/components/empty-state'
import { FormField } from '@/components/form-field'
import { FormActions, ResponsiveDialog } from '@/components/responsive-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAccounts, useDeleteAccount, useDeleteTransfer, useSaveAccount, useTransfers } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatShortDate, parseMoneyInput, toMoneyInput } from '@/lib/format'
import type { Account, AccountType, Transfer } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false)
  const { data, isLoading } = useAccounts(showArchived)
  const { data: transfers } = useTransfers({ page: 1 })
  const { newTransfer } = useDialogs()
  const save = useSaveAccount()
  const remove = useDeleteAccount()
  const removeTransfer = useDeleteTransfer()
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Account }>({ open: false })
  const [toDelete, setToDelete] = useState<Account | null>(null)
  const [transferToDelete, setTransferToDelete] = useState<Transfer | null>(null)

  const accounts = data?.data ?? []

  async function toggleArchive(account: Account) {
    try {
      await save.mutateAsync({ id: account.id, input: { archived: !account.archived } })
      toast.success(account.archived ? 'Conta reativada.' : 'Conta arquivada. O histórico continua nos relatórios.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await remove.mutateAsync(toDelete.id)
      toast.success('Conta excluída.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  async function confirmDeleteTransfer() {
    if (!transferToDelete) return
    try {
      await removeTransfer.mutateAsync(transferToDelete.id)
      toast.success('Transferência excluída.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTransferToDelete(null)
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Contas e cartões</h1>
          <p className="mt-1 text-sm text-muted-foreground">Onde o dinheiro está, conta por conta.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={newTransfer}>
            <ArrowLeftRight className="size-4" /> Transferir
          </Button>
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="size-4" /> Nova conta
          </Button>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">Saldo total das contas ativas</p>
        {isLoading ? (
          <Skeleton className="mt-2 h-10 w-48" />
        ) : (
          <p className={cn('mt-1 text-4xl font-semibold tracking-[-0.03em] tabular', Number(data?.totalBalance) < 0 && 'text-expense')}>
            {formatMoney(data?.totalBalance ?? 0)}
          </p>
        )}
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Suas contas</h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Mostrar arquivadas
        </label>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const upcoming = Number(a.upcoming)
            return (
              <li key={a.id} className={cn('grid gap-4 rounded-2xl border bg-card p-5', a.archived && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <AccountIcon type={a.type} color={a.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPES[a.type].label}
                      {a.archived && ' · arquivada'}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-10" aria-label={`Ações para ${a.name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: a })}>
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void toggleArchive(a)}>
                        {a.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                        {a.archived ? 'Reativar' : 'Arquivar'}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" disabled={a.transactionCount > 0} onSelect={() => setToDelete(a)}>
                        <Trash2 className="size-4" />
                        {a.transactionCount > 0 ? 'Excluir (tem histórico)' : 'Excluir'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div>
                  <p className={cn('text-2xl font-semibold tracking-[-0.02em] tabular', Number(a.balance) < 0 && 'text-expense')}>
                    {formatMoney(a.balance)}
                  </p>
                  {upcoming !== 0 && (
                    <p className="mt-1 text-xs text-muted-foreground tabular">
                      {upcoming < 0 ? '−' : '+'}
                      {formatMoney(Math.abs(upcoming))} em lançamentos futuros
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="min-w-0 rounded-2xl border bg-card">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Transferências recentes</h2>
          <Button variant="ghost" size="sm" onClick={newTransfer}>
            <Plus className="size-4" /> Nova
          </Button>
        </header>
        {!transfers?.data.length ? (
          <div className="p-5">
            <EmptyState text="Nenhuma transferência ainda. Use para pagar a fatura do cartão ou guardar na reserva." />
          </div>
        ) : (
          <ul className="divide-y">
            {transfers.data.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-14 shrink-0 text-xs text-muted-foreground tabular">{formatShortDate(t.date)}</span>
                <span className="grid min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <span className="truncate">{t.fromAccount.name}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t.toAccount.name}</span>
                  </span>
                  {t.description && <span className="truncate text-xs text-muted-foreground">{t.description}</span>}
                </span>
                <span className="font-medium tabular">{formatMoney(t.amount)}</span>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Excluir transferência" onClick={() => setTransferToDelete(t)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResponsiveDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        title={dialog.editing ? 'Editar conta' : 'Nova conta'}
        description="O saldo inicial é o valor da conta no dia em que você começou a usar o FinTrack."
      >
        <AccountForm editing={dialog.editing} onDone={() => setDialog({ open: false })} />
      </ResponsiveDialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir conta?"
        description={toDelete ? `"${toDelete.name}" será excluída.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={!!transferToDelete}
        onOpenChange={(open) => !open && setTransferToDelete(null)}
        title="Excluir transferência?"
        description={transferToDelete ? `${formatMoney(transferToDelete.amount)} de ${transferToDelete.fromAccount.name} para ${transferToDelete.toAccount.name}.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDeleteTransfer}
      />
    </div>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à conta').max(40),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']),
  initialBalance: z.string().refine((v) => !v.trim() || parseMoneyInput(v.replace(/^-/, '')) !== null, 'Valor inválido'),
  color: z.string(),
})
type Values = z.infer<typeof schema>

function AccountForm({ editing, onDone }: { editing?: Account; onDone: () => void }) {
  const save = useSaveAccount()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? '',
      type: editing?.type ?? 'CHECKING',
      initialBalance: editing ? (Number(editing.initialBalance) < 0 ? '-' : '') + toMoneyInput(Math.abs(Number(editing.initialBalance))) : '',
      color: editing?.color ?? CATEGORY_COLORS[0],
    },
  })

  async function onSubmit(v: Values) {
    const raw = v.initialBalance.trim()
    const negative = raw.startsWith('-')
    const value = raw ? parseMoneyInput(raw.replace(/^-/, ''))! : 0
    try {
      await save.mutateAsync({
        id: editing?.id,
        input: { name: v.name, type: v.type as AccountType, color: v.color, initialBalance: negative ? -value : value },
      })
      toast.success(editing ? 'Conta atualizada.' : 'Conta criada.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <FormField id="acc-name" label="Nome" error={errors.name?.message}>
        <Input id="acc-name" placeholder="Ex.: Nubank, Cartão Itaú" maxLength={40} {...register('name')} />
      </FormField>
      <FormField id="acc-type" label="Tipo">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="acc-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPES).map(([value, t]) => (
                  <SelectItem key={value} value={value}>
                    <t.icon className="size-4" /> {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField id="acc-initial" label="Saldo inicial (R$)" error={errors.initialBalance?.message} hint="Use um sinal de menos para uma fatura em aberto, ex.: -350,00">
        <Input id="acc-initial" inputMode="decimal" placeholder="0,00" className="tabular" {...register('initialBalance')} />
      </FormField>
      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <fieldset className="grid gap-2">
            <Label asChild>
              <legend>Cor</legend>
            </Label>
            <div className="flex flex-wrap gap-2.5">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => field.onChange(c)}
                  aria-label={`Cor ${c}`}
                  aria-pressed={field.value === c}
                  className="flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-ring"
                  style={{ backgroundColor: c }}
                >
                  {field.value === c && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      />
      <FormActions>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </FormActions>
    </form>
  )
}
