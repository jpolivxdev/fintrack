import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TransferForm } from '@/components/accounts/transfer-form'
import { EventForm } from '@/components/calendar/event-form'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { TransactionForm } from '@/components/transactions/transaction-form'
import { useIsMobile } from '@/hooks/use-mobile'
import type { CalendarEvent, Transaction, TransactionType } from '@/lib/types'
import { DialogsContext, type DialogsApi } from './dialogs-context'

type State =
  | { kind: 'none' }
  | { kind: 'transaction'; type: TransactionType; editing?: Transaction }
  | { kind: 'transfer' }
  | { kind: 'event'; date?: string; editing?: CalendarEvent }

/** Hosts the app-wide forms so any screen (or the mobile "+") can open them. */
export function DialogsProvider({ children }: { children: ReactNode }) {
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
        {state.kind === 'transaction' && <TransactionForm editing={state.editing} initialType={state.type} onDone={close} />}
        {state.kind === 'transfer' && <TransferForm onDone={close} />}
        {state.kind === 'event' && <EventForm editing={state.editing} initialDate={state.date} onDone={close} />}
      </ResponsiveDialog>
    </DialogsContext.Provider>
  )
}
