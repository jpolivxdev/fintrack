import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/use-mobile'
import type { CalendarEvent, Transaction, TransactionType } from '@/lib/types'
import { DialogsContext, type DialogsApi } from './dialogs-context'

// Forms (and their validation libraries) stay out of the first download...
const loadTransactionForm = () => import('@/components/transactions/transaction-form')
const loadTransferForm = () => import('@/components/accounts/transfer-form')
const loadEventForm = () => import('@/components/calendar/event-form')
const TransactionForm = lazy(() => loadTransactionForm().then((m) => ({ default: m.TransactionForm })))
const TransferForm = lazy(() => loadTransferForm().then((m) => ({ default: m.TransferForm })))
const EventForm = lazy(() => loadEventForm().then((m) => ({ default: m.EventForm })))

function FormSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando formulário">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

type State =
  | { kind: 'none' }
  | { kind: 'transaction'; type: TransactionType; editing?: Transaction }
  | { kind: 'transfer' }
  | { kind: 'event'; date?: string; editing?: CalendarEvent }

/** Hosts the app-wide forms so any screen (or the mobile "+") can open them. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prefetch = () => void Promise.all([loadTransactionForm(), loadTransferForm(), loadEventForm()])
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(prefetch, 2500)
    return () => window.clearTimeout(id)
  }, [])

  const [state, setState] = useState<State>({ kind: 'none' })
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  const show = useCallback((next: State) => {
    setState(next)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])

  const api = useMemo<DialogsApi>(
    () => ({
      newTransaction: (type = 'EXPENSE') => show({ kind: 'transaction', type }),
      editTransaction: (t) => show({ kind: 'transaction', type: t.type, editing: t }),
      newTransfer: () => show({ kind: 'transfer' }),
      newEvent: (date) => show({ kind: 'event', date }),
      editEvent: (e) => show({ kind: 'event', editing: e }),
    }),
    [show],
  )

  // "N" anywhere (outside inputs and dialogs) starts a new transaction.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return
      if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      event.preventDefault()
      api.newTransaction()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api])

  const titles: Record<Exclude<State['kind'], 'none'>, { title: string; description?: string }> = {
    transaction:
      state.kind === 'transaction' && state.editing
        ? { title: 'Editar transação' }
        : { title: 'Nova transação', description: isMobile ? undefined : 'Dica: aperte N em qualquer tela para abrir este formulário.' },
    transfer: { title: 'Transferir entre contas', description: 'Ex.: pagar a fatura do cartão ou guardar na poupança.' },
    event: { title: state.kind === 'event' && state.editing ? 'Editar compromisso' : 'Novo compromisso' },
  }
  const heading = state.kind === 'none' ? { title: '' } : titles[state.kind]

  return (
    <DialogsContext.Provider value={api}>
      {children}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={heading.title} description={heading.description}>
        <Suspense fallback={<FormSkeleton />}>
          {state.kind === 'transaction' && <TransactionForm editing={state.editing} initialType={state.type} onDone={close} />}
          {state.kind === 'transfer' && <TransferForm onDone={close} />}
          {state.kind === 'event' && <EventForm editing={state.editing} initialDate={state.date} onDone={close} />}
        </Suspense>
      </ResponsiveDialog>
    </DialogsContext.Provider>
  )
}
