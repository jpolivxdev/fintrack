import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CATEGORY_COLORS } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormField } from '@/components/form-field'
import { FormActions } from '@/components/responsive-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { textareaClass } from '@/components/transactions/transaction-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useDeleteEvent, useHasCalendarCompany, useSaveEvent } from '@/hooks/queries-more'
import { useIsMobile } from '@/hooks/use-mobile'
import { errorMessage } from '@/lib/api'
import { instantToLocalDate, instantToLocalTime, localToInstant } from '@/lib/datetime'
import { parseMoneyInput, toMoneyInput, todayISO } from '@/lib/format'
import type { CalendarEvent } from '@/lib/types'

const schema = z
  .object({
    title: z.string().trim().min(1, 'Dê um nome ao compromisso').max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
    allDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    visibility: z.enum(['SHARED', 'PRIVATE']),
    location: z.string().max(120).optional(),
    estimatedCost: z.string().refine((v) => !v.trim() || parseMoneyInput(v) !== null, 'Valor inválido'),
    color: z.string(),
    description: z.string().max(1000).optional(),
  })
  .refine((v) => v.allDay || /^\d{2}:\d{2}$/.test(v.startTime), { path: ['startTime'], message: 'Informe o horário' })
  .refine((v) => v.allDay || !v.endTime || v.endTime >= v.startTime, { path: ['endTime'], message: 'Termina antes de começar' })
type Values = z.infer<typeof schema>

/** One hour after "HH:MM", capped at 23:59. */
function plusOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function EventForm({ editing, initialDate, onDone }: { editing?: CalendarEvent; initialDate?: string; onDone: () => void }) {
  const isMobile = useIsMobile()
  const save = useSaveEvent()
  const remove = useDeleteEvent()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shared = useHasCalendarCompany()

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          title: editing.title,
          date: instantToLocalDate(editing.startAt),
          allDay: editing.allDay,
          startTime: instantToLocalTime(editing.startAt),
          endTime: instantToLocalTime(editing.endAt),
          visibility: editing.visibility,
          location: editing.location ?? '',
          estimatedCost: editing.estimatedCost ? toMoneyInput(editing.estimatedCost) : '',
          color: editing.color ?? CATEGORY_COLORS[9],
          description: editing.description ?? '',
        }
      : {
          title: '',
          date: initialDate ?? todayISO(),
          allDay: false,
          startTime: '19:00',
          endTime: '20:00',
          visibility: 'SHARED',
          location: '',
          estimatedCost: '',
          color: CATEGORY_COLORS[9],
          description: '',
        },
  })
  const allDay = watch('allDay')
  const canEditVisibility = !editing || editing.isMine

  async function onSubmit(v: Values) {
    const startAt = localToInstant(v.date, v.allDay ? '00:00' : v.startTime)
    const endAt = localToInstant(v.date, v.allDay ? '23:59' : v.endTime || plusOneHour(v.startTime))
    try {
      await save.mutateAsync({
        id: editing?.id,
        input: {
          title: v.title,
          startAt,
          endAt,
          allDay: v.allDay,
          visibility: canEditVisibility ? v.visibility : undefined,
          location: v.location?.trim() || undefined,
          description: v.description?.trim() || undefined,
          estimatedCost: v.estimatedCost.trim() ? parseMoneyInput(v.estimatedCost)! : undefined,
          color: v.color,
        },
      })
      toast.success(editing ? 'Compromisso atualizado.' : 'Compromisso criado.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function onDelete() {
    if (!editing) return
    try {
      await remove.mutateAsync(editing.id)
      toast.success('Compromisso excluído.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <FormField id="ev-title" label="O quê" error={errors.title?.message}>
        <Input id="ev-title" placeholder="Ex.: Jantar no japonês" autoFocus={!isMobile} maxLength={120} {...register('title')} />
      </FormField>

      <div className="grid grid-cols-[1fr_auto] items-end gap-4">
        <FormField id="ev-date" label="Dia" error={errors.date?.message}>
          <Input id="ev-date" type="date" className="tabular" {...register('date')} />
        </FormField>
        <Controller
          control={control}
          name="allDay"
          render={({ field }) => (
            <label className="flex h-9 items-center gap-2 text-sm">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Dia inteiro
            </label>
          )}
        />
      </div>

      {!allDay && (
        <div className="grid grid-cols-2 gap-4">
          <FormField id="ev-start" label="Começa" error={errors.startTime?.message}>
            <Input id="ev-start" type="time" className="tabular" {...register('startTime')} />
          </FormField>
          <FormField id="ev-end" label="Termina" error={errors.endTime?.message}>
            <Input id="ev-end" type="time" className="tabular" {...register('endTime')} />
          </FormField>
        </div>
      )}

      {canEditVisibility && (
        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <div className="grid gap-1.5">
              <Label>Quem vê</Label>
              <SegmentedControl
                ariaLabel="Visibilidade"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'SHARED', label: 'Compartilhado' },
                  { value: 'PRIVATE', label: 'Só eu' },
                ]}
              />
              {!shared && field.value === 'SHARED' && (
                <p className="text-xs text-muted-foreground">Conecte sua agenda com alguém em Configurações → Agenda compartilhada.</p>
              )}
            </div>
          )}
        />
      )}

      <div className="grid grid-cols-[1fr_8.5rem] gap-4">
        <FormField id="ev-location" label="Onde (opcional)">
          <Input id="ev-location" maxLength={120} {...register('location')} />
        </FormField>
        <FormField id="ev-cost" label="Custo previsto" error={errors.estimatedCost?.message}>
          <Input id="ev-cost" inputMode="decimal" placeholder="R$ 0,00" className="tabular" {...register('estimatedCost')} />
        </FormField>
      </div>

      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <fieldset className="grid gap-2">
            <Label asChild>
              <legend>Cor</legend>
            </Label>
            <div className="flex flex-wrap gap-2.5">
              {CATEGORY_COLORS.slice(0, 10).map((c) => (
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

      <FormField id="ev-description" label="Notas (opcional)">
        <textarea id="ev-description" rows={2} className={textareaClass} {...register('description')} />
      </FormField>

      <FormActions>
        {editing && (
          <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Excluir
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Salvar' : 'Criar compromisso'}
        </Button>
      </FormActions>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir compromisso?"
        description={editing ? `"${editing.title}" será removido para todos que o veem.` : ''}
        confirmLabel="Excluir"
        onConfirm={onDelete}
      />
    </form>
  )
}
