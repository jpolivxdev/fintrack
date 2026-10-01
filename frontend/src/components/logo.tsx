import { cn } from '@/lib/utils'

/** Wordmark: three rising bars (the product's reading of a month) + name. */
export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-[-0.02em]', className)}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="3" y="12" width="4.5" height="9" rx="1.5" fill="var(--chart-2)" />
        <rect x="9.75" y="7" width="4.5" height="14" rx="1.5" fill="var(--chart-3)" />
        <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" fill="var(--primary)" />
      </svg>
      {showName && <span>FinTrack</span>}
    </span>
  )
}
