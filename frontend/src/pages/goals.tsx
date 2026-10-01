import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Check, Loader2, Minus, Pencil, Plus, Target, Trash2, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { FormField } from '@/components/form-field'
import { FormActions, ResponsiveDialog } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useContribute, useDeleteGoal, useGoal, useGoals, useHousehold, useRemoveContribution, useSaveGoal } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatMoney, formatShortDate, parseMoneyInput, toMoneyInput, todayISO } from '@/lib/format'
import type { Goal, GoalStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS: Record<GoalStatus, { label: string; className: string }> = {
  COMPLETED: { label: 'Concluída', className: 'bg-income/15 text-income' },
  ON_TRACK: { label: 'No ritmo', className: 'bg-primary/15 text-primary' },
  BEHIND: { label: 'Atrasada', className: 'bg-warning/15 text-warning' },
  OVERDUE: { label: 'Prazo vencido', className: 'bg-expense/15 text-expense' },
  NO_DEADLINE: { label: 'Sem prazo', className: 'bg-muted text-muted-foreground' },
}

const monthYear = (date: string) => {
  const [y, m] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date(y, m - 1, 1)).replace('.', '').replace(' de ', '/')
}

/** The one sentence that tells you what to do next. */
function guidance(goal: Goal): string {
  if (goal.status === 'COMPLETED') return 'Meta alcançada. Parabéns!'
  if (goal.status === 'OVERDUE') return `O prazo passou. Faltam ${formatMoney(goal.remaining)}.`
  if (goal.monthlyNeeded && goal.targetDate) return `Guarde ${formatMoney(goal.monthlyNeeded)}/mês para chegar em ${monthYear(goal.targetDate)}.`
  if (goal.projectedDate) return `No ritmo atual, você chega lá em ${monthYear(goal.projectedDate)}.`
  return 'Faça o primeiro aporte para ver a previsão.'
}

export function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals()
  const [editor, setEditor] = useState<{ open: boolean; editing?: Goal }>({ open: false })
  const [detailId, setDetailId] = useState<string | null>(null)

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Metas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Junte dinheiro para o que importa, com previsão de quando chega lá.</p>
        </div>
        <Button onClick={() => setEditor({ open: true })}>
          <Plus className="size-4" /> Nova meta
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : goals.length === 0 ? (
        <EmptyState
          text="Nenhuma meta ainda. Que tal a viagem dos sonhos ou uma reserva de emergência?"
          action={<Button size="sm" onClick={() => setEditor({ open: true })}>Criar a primeira meta</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((g, i) => (
            <motion.li key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <button
                type="button"
                onClick={() => setDetailId(g.id)}
                className="grid w-full gap-4 rounded-2xl border bg-card p-5 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <CategoryIcon icon={g.icon ?? 'gift'} color={g.color} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.name}</p>
                    <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS[g.status].className)}>{STATUS[g.status].label}</span>
                  </div>
                  <span className="text-lg font-semibold tabular">{Math.floor(g.percent)}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(g.percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${g.name}`}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: g.color ?? 'var(--primary)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${g.percent}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <div>
                  <p className="text-sm tabular">
                    <span className="font-semibold">{formatMoney(g.saved)}</span>
                    <span className="text-muted-foreground"> de {formatMoney(g.targetAmount)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{guidance(g)}</p>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <ResponsiveDialog open={editor.open} onOpenChange={(open) => setEditor((e) => ({ ...e, open }))} title={editor.editing ? 'Editar meta' : 'Nova meta'}>
        <GoalForm editing={editor.editing} onDone={() => setEditor({ open: false })} />
      </ResponsiveDialog>

      <GoalDetailSheet
        goalId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(g) => {
          setDetailId(null)
          setTimeout(() => setEditor({ open: true, editing: g }), 180)
        }}
      />
    </div>
  )
}

function GoalDetailSheet({ goalId, onClose, onEdit }: { goalId: string | null; onClose: () => void; onEdit: (g: Goal) => void }) {
  const { data: goal } = useGoal(goalId)
  const { data: household } = useHousehold()
  const contribute = useContribute()
  const removeContribution = useRemoveContribution()
  const save = useSaveGoal()
  const remove = useDeleteGoal()
  const [mode, setMode] = useState<'IN' | 'OUT'>('IN')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shared = (household?.members.length ?? 1) > 1

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = parseMoneyInput(amount)
    if (!goal || !value) return toast.error('Informe um valor maior que zero.')
    try {
      await contribute.mutateAsync({ goalId: goal.id, amount: mode === 'IN' ? value : -value, date })
      setAmount('')
      toast.success(mode === 'IN' ? 'Aporte registrado.' : 'Retirada registrada.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function archive() {
    if (!goal) return
    await save.mutateAsync({ id: goal.id, input: { archived: true } })
    toast.success('Meta arquivada.')
    onClose()
  }

  async function onDelete() {
    if (!goal) return
    try {
      await remove.mutateAsync(goal.id)
      toast.success('Meta excluída.')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <ResponsiveDialog open={!!goalId} onOpenChange={(open) => !open && onClose()} title={goal?.name ?? 'Meta'} description={goal ? guidance(goal) : undefined} className="sm:max-w-lg">
      {!goal ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-5">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Guardado</dt>
              <dd className="font-semibold tabular">{formatMoney(goal.saved)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Falta</dt>
              <dd className="font-semibold tabular">{formatMoney(goal.remaining)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ritmo</dt>
              <dd className="font-semibold tabular">{formatMoney(goal.monthlyPace)}/mês</dd>
            </div>
          </dl>

          {goal.status !== 'COMPLETED' && (
            <form onSubmit={submit} className="grid gap-3 rounded-xl border p-4">
              <SegmentedControl
                ariaLabel="Aporte ou retirada"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'IN', label: 'Guardar' },
                  { value: 'OUT', label: 'Retirar' },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input inputMode="decimal" placeholder="R$ 0,00" aria-label="Valor" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Input type="date" aria-label="Data" className="tabular" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Button type="submit" disabled={contribute.isPending} className="h-11 sm:h-9">
                {contribute.isPending ? <Loader2 className="size-4 animate-spin" /> : mode === 'IN' ? <Plus className="size-4" /> : <Minus className="size-4" />}
                {mode === 'IN' ? 'Guardar' : 'Retirar'}
              </Button>
            </form>
          )}
          {goal.status === 'COMPLETED' && (
            <p className="flex items-center gap-2 rounded-xl bg-income/10 p-4 text-sm text-income">
              <Trophy className="size-5" /> Meta alcançada!
            </p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
            {goal.contributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum aporte ainda.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {goal.contributions.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="w-14 text-xs text-muted-foreground tabular">{formatShortDate(c.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {c.note ?? (Number(c.amount) < 0 ? 'Retirada' : 'Aporte')}
                      {shared && c.createdBy && ` · ${c.createdBy.name}`}
                    </span>
                    <span className={cn('font-medium tabular', Number(c.amount) < 0 ? 'text-expense' : 'text-income')}>
                      {Number(c.amount) < 0 ? '−' : '+'}
                      {formatMoney(Math.abs(Number(c.amount)))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Remover lançamento"
                      onClick={() =>
                        removeContribution.mutateAsync({ goalId: goal.id, contributionId: c.id }).catch((e) => toast.error(errorMessage(e)))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2 [&>button]:h-11 sm:[&>button]:h-9">
            <Button variant="outline" onClick={() => onEdit(goal)}>
              <Pencil className="size-4" /> Editar
            </Button>
            <Button variant="outline" onClick={() => void archive()}>
              <Archive className="size-4" /> Arquivar
            </Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Excluir
            </Button>
          </div>
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Excluir meta?"
            description={`"${goal.name}" e todo o histórico de aportes serão removidos.`}
            confirmLabel="Excluir"
            onConfirm={onDelete}
          />
        </div>
      )}
    </ResponsiveDialog>
  )
}

const GOAL_ICONS = ['plane', 'home', 'car', 'smartphone', 'graduation-cap', 'gift', 'heart-pulse', 'baby', 'paw-print', 'landmark']

const schema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à meta').max(60),
  targetAmount: z.string().refine((v) => (parseMoneyInput(v) ?? 0) > 0, 'Informe um valor maior que zero'),
  targetDate: z.string().optional(),
  color: z.string(),
  icon: z.string(),
})
type Values = z.infer<typeof schema>

function GoalForm({ editing, onDone }: { editing?: Goal; onDone: () => void }) {
  const save = useSaveGoal()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? '',
      targetAmount: editing ? toMoneyInput(editing.targetAmount) : '',
      targetDate: editing?.targetDate ?? '',
      color: editing?.color ?? CATEGORY_COLORS[2],
      icon: editing?.icon ?? 'plane',
    },
  })

  async function onSubmit(v: Values) {
    try {
      await save.mutateAsync({
        id: editing?.id,
        input: { name: v.name, targetAmount: parseMoneyInput(v.targetAmount)!, targetDate: v.targetDate || undefined, color: v.color, icon: v.icon },
      })
      toast.success(editing ? 'Meta atualizada.' : 'Meta criada.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <FormField id="goal-name" label="Para quê?" error={errors.name?.message}>
        <Input id="goal-name" placeholder="Ex.: Viagem para o Chile" maxLength={60} {...register('name')} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="goal-target" label="Quanto (R$)" error={errors.targetAmount?.message}>
          <Input id="goal-target" inputMode="decimal" placeholder="0,00" className="tabular" {...register('targetAmount')} />
        </FormField>
        <FormField id="goal-date" label="Até quando (opcional)">
          <Input id="goal-date" type="date" className="tabular" {...register('targetDate')} />
        </FormField>
      </div>
      <Controller
        control={control}
        name="icon"
        render={({ field }) => (
          <fieldset className="grid gap-2">
            <Label asChild>
              <legend>Ícone</legend>
            </Label>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {GOAL_ICONS.map((key) => {
                const Icon = CATEGORY_ICONS[key] ?? Target
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => field.onChange(key)}
                    aria-label={`Ícone ${key}`}
                    aria-pressed={field.value === key}
                    className={cn('flex aspect-square items-center justify-center rounded-lg text-muted-foreground hover:bg-muted', field.value === key && 'bg-accent text-foreground ring-1 ring-ring')}
                  >
                    <Icon className="size-5" />
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}
      />
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
