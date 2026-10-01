import { createContext, useContext } from 'react'
import type { CalendarEvent, Transaction, TransactionType } from '@/lib/types'

export interface DialogsApi {
  newTransaction: (type?: TransactionType) => void
  editTransaction: (transaction: Transaction) => void
  newTransfer: () => void
  /** Optional YYYY-MM-DD to pre-fill the day. */
  newEvent: (date?: string) => void
  editEvent: (event: CalendarEvent) => void
}

export const DialogsContext = createContext<DialogsApi | null>(null)

/** Opens the app-wide forms (transaction, transfer, event) from anywhere. */
export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useDialogs must be used inside <DialogsProvider>')
  return ctx
}
