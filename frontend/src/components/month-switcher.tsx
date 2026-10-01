import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { monthLabel } from '@/lib/format'
import { useMonth } from '@/lib/month'

export function MonthSwitcher() {
  const { year, month, shift, isCurrent, reset } = useMonth()
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mês anterior">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium tabular" aria-live="polite">
        {monthLabel(year, month)}
      </span>
      <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Próximo mês">
        <ChevronRight className="size-4" />
      </Button>
      {!isCurrent && (
        <Button variant="link" size="sm" onClick={reset} className="px-1">
          Hoje
        </Button>
      )}
    </div>
  )
}
