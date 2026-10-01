import { motion } from 'motion/react'
import type { BudgetStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BUDGET_STATUS } from './budget-status'

export function BudgetBar({ percent, status, label }: { percent: number; status: BudgetStatus; label?: string }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn('h-full rounded-full', BUDGET_STATUS[status].bar)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}
