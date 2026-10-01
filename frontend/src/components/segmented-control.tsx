import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

interface Option<T extends string> {
  value: T
  label: string
}

/**
 * Compact segmented control with a sliding active indicator
 * (idea borrowed from Kokonut UI's Smooth Tab, rebuilt lean for a form control).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel: string
}) {
  const id = useId()
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-lg bg-muted p-1 text-sm', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex-1 rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 rounded-md bg-background shadow-[0_1px_3px_-1px_rgb(0_0_0/0.25)] dark:bg-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
