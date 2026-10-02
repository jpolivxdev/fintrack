import { Sparkles, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Calm, inviting empty state: what this place is for and the next step. */
export function EmptyState({ text, action, icon: Icon = Sparkles }: { text: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-6 py-9 text-center text-sm text-balance text-muted-foreground">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary-text ring-1 ring-primary/15">
        <Icon className="size-5" />
      </span>
      <p className="max-w-xs">{text}</p>
      {action}
    </div>
  )
}
