import { createContext, useContext } from 'react'
import type { Transaction, TransactionType } from '@/lib/types'

export interface TransactionDialogApi {
  openNew: (type?: TransactionType) => void
  openEdit: (transaction: Transaction) => void
}

export const TransactionDialogContext = createContext<TransactionDialogApi | null>(null)

/** Opens the global "new/edit transaction" dialog from anywhere in the app. */
export function useTransactionDialog(): TransactionDialogApi {
  const ctx = useContext(TransactionDialogContext)
  if (!ctx) throw new Error('useTransactionDialog must be used inside <TransactionDialogProvider>')
  return ctx
}
