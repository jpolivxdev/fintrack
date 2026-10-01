import type { ReactNode } from 'react'

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center text-sm text-balance text-muted-foreground">
      {text}
      {action}
    </div>
  )
}
