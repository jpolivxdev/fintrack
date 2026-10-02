import { CalendarPlus, Check, Lock, MapPin, Plus, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useDialogs } from '@/components/dialogs/dialogs-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCalendar, useHasCalendarCompany } from '@/hooks/queries-more'
import { formatLongDay, formatTime, instantToLocalDate, localDateKey, toLocalIso } from '@/lib/datetime'
import { formatMoney, monthLabel } from '@/lib/format'
import { useMonth } from '@/lib/month'
import type { CalendarBill, CalendarEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

interface DayItems {
  events: CalendarEvent[]
  bills: CalendarBill[]
}

/** Every local day an event touches (multi-day events appear on each). */
function daysOf(event: CalendarEvent): string[] {
  const days: string[] = []
  const cursor = new Date(event.startAt)
  cursor.setHours(0, 0, 0, 0)
  const last = instantToLocalDate(event.endAt)
  for (let i = 0; i < 62; i++) {
    const key = localDateKey(cursor)
    days.push(key)
    if (key >= last) break
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function CalendarPage() {
  const { year, month } = useMonth()
  const { newEvent, editEvent } = useDialogs()
  const shared = useHasCalendarCompany()
  const today = localDateKey(new Date())
  const [selected, setSelected] = useState<string>(today)

  // Six-week grid starting on the Sunday on or before the 1st.
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [year, month])

  const from = toLocalIso(cells[0])
  const end = new Date(cells[41])
  end.setDate(end.getDate() + 1)
  const { data, isLoading } = useCalendar(from, toLocalIso(end))

  const byDay = useMemo(() => {
    const map = new Map<string, DayItems>()
    const slot = (key: string) => {
      if (!map.has(key)) map.set(key, { events: [], bills: [] })
      return map.get(key)!
    }
    for (const event of data?.events ?? []) for (const key of daysOf(event)) slot(key).events.push(event)
    for (const bill of data?.bills ?? []) slot(bill.date).bills.push(bill)
    return map
  }, [data])

  // Keep the selection inside the visible month when switching months.
  const selectedInView = cells.some((c) => localDateKey(c) === selected)
  const activeDay = selectedInView ? selected : localDateKey(new Date(year, month - 1, 1))
  const dayItems = byDay.get(activeDay) ?? { events: [], bills: [] }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Calendário</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shared ? 'Compromissos de vocês e as contas do mês, num lugar só.' : 'Seus compromissos e as contas do mês, num lugar só.'}
          </p>
        </div>
        <Button onClick={() => newEvent(activeDay)} className="hidden md:inline-flex">
          <CalendarPlus className="size-4" /> Novo compromisso
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 rounded-2xl border bg-card p-2 sm:p-4" aria-label={`Calendário de ${monthLabel(year, month)}`}>
          <div className="grid grid-cols-7 pb-2 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} title={WEEKDAY_NAMES[i]}>
                <span className="sm:hidden">{label}</span>
                <span className="hidden sm:inline">{WEEKDAY_NAMES[i].slice(0, 3)}</span>
              </span>
            ))}
          </div>
          {isLoading ? (
            <Skeleton className="aspect-[7/6] w-full" />
          ) : (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-border">
              {cells.map((date) => {
                const key = localDateKey(date)
                const inMonth = date.getMonth() === month - 1
                const items = byDay.get(key)
                const isToday = key === today
                const isSelected = key === activeDay
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    onDoubleClick={() => newEvent(key)}
                    aria-label={`${formatLongDay(key)}${items ? `, ${items.events.length} ${items.events.length === 1 ? 'compromisso' : 'compromissos'} e ${items.bills.length} ${items.bills.length === 1 ? 'conta' : 'contas'}` : ''}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex min-h-14 flex-col gap-1 bg-card p-1.5 text-left transition-colors sm:min-h-24 sm:p-2',
                      !inMonth && 'bg-muted/40 text-muted-foreground',
                      isSelected && 'bg-accent',
                      'hover:bg-accent/70 focus-visible:z-10',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular sm:size-7 sm:text-sm',
                        isToday && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {date.getDate()}
                    </span>
                    {items && (
                      <>
                        {/* Phone: dots. */}
                        <span className="flex flex-wrap gap-0.5 sm:hidden">
                          {items.events.slice(0, 3).map((e) => (
                            <span key={e.id} className="size-1.5 rounded-full" style={{ backgroundColor: e.color ?? 'var(--primary)' }} />
                          ))}
                          {items.bills.slice(0, 2).map((b) => (
                            <span key={b.ruleId + b.date} className={cn('size-1.5 rounded-[2px]', b.type === 'INCOME' ? 'bg-income' : 'bg-expense', b.done && 'opacity-40')} />
                          ))}
                        </span>
                        {/* Tablet and up: chips. */}
                        <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                          {items.events.slice(0, 2).map((e) => (
                            <span
                              key={e.id}
                              className="truncate rounded px-1 py-0.5 text-[11px] font-medium"
                              style={{ backgroundColor: `color-mix(in oklch, ${e.color ?? 'var(--primary)'} 22%, transparent)` }}
                            >
                              {!e.allDay && <span className="tabular">{formatTime(e.startAt)} </span>}
                              {e.title}
                            </span>
                          ))}
                          {items.bills.slice(0, items.events.length >= 2 ? 1 : 2).map((b) => (
                            <span key={b.ruleId + b.date} className={cn('truncate px-1 text-[11px] text-muted-foreground', b.done && 'line-through opacity-60')}>
                              {b.description}
                            </span>
                          ))}
                          {items.events.length + items.bills.length > 3 && (
                            <span className="px-1 text-[11px] text-muted-foreground">+{items.events.length + items.bills.length - 3}</span>
                          )}
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border bg-card p-5" aria-live="polite">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold first-letter:uppercase">{formatLongDay(activeDay)}</h2>
            <Button size="sm" variant="outline" onClick={() => newEvent(activeDay)}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={activeDay} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {dayItems.events.length === 0 && dayItems.bills.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nada marcado para este dia.</p>
              ) : (
                <ul className="grid gap-2">
                  {dayItems.events
                    .slice()
                    .sort((a, b) => a.startAt.localeCompare(b.startAt))
                    .map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => editEvent(e)}
                          className="flex w-full gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className="w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: e.color ?? 'var(--primary)' }} />
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="truncate font-medium">{e.title}</span>
                            <span className="text-xs text-muted-foreground tabular">
                              {e.allDay ? 'Dia inteiro' : `${formatTime(e.startAt)} – ${formatTime(e.endAt)}`}
                            </span>
                            {e.location && (
                              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <MapPin className="size-3 shrink-0" /> {e.location}
                              </span>
                            )}
                            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              {e.visibility === 'PRIVATE' ? (
                                <span className="inline-flex items-center gap-1">
                                  <Lock className="size-3" /> Só você
                                </span>
                              ) : (
                                shared && (
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="size-3" /> {e.isMine ? 'Compartilhado' : `Criado por ${e.createdBy?.name ?? 'outra pessoa'}`}
                                  </span>
                                )
                              )}
                              {e.estimatedCost && <span className="tabular">≈ {formatMoney(e.estimatedCost)}</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  {dayItems.bills.map((b) => (
                    <li key={b.ruleId + b.date} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', b.done ? 'bg-income/15 text-income' : 'bg-muted text-muted-foreground')}>
                        {b.done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{b.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {b.type === 'INCOME' ? 'Entrada recorrente' : 'Conta recorrente'} · {b.done ? 'lançada' : 'prevista'}
                        </span>
                      </span>
                      <span className={cn('font-medium tabular', b.type === 'INCOME' && 'text-income')}>{formatMoney(b.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}
