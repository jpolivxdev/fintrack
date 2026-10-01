import type { BudgetStatus } from '@/lib/types'

/** Visual vocabulary for the API's budget status (warning from 80 %, exceeded above 100 %). */
export const BUDGET_STATUS: Record<BudgetStatus, { label: string; bar: string; text: string }> = {
  ON_TRACK: { label: 'No controle', bar: 'bg-primary', text: 'text-muted-foreground' },
  WARNING: { label: 'Atenção', bar: 'bg-warning', text: 'text-warning' },
  EXCEEDED: { label: 'Estourado', bar: 'bg-expense', text: 'text-expense' },
}
