import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface MonthContextValue {
  year: number
  month: number
  /** First and last day of the selected month, YYYY-MM-DD. */
  start: string
  end: string
  isCurrent: boolean
  shift: (delta: number) => void
  reset: () => void
}

const MonthContext = createContext<MonthContextValue | null>(null)

const pad = (n: number) => String(n).padStart(2, '0')

function current() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** The month every screen is looking at, shared so switching pages keeps it. */
export function MonthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(current)

  const ctx = useMemo<MonthContextValue>(() => {
    const { year, month } = value
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const now = current()
    return {
      year,
      month,
      start: `${year}-${pad(month)}-01`,
      end: `${year}-${pad(month)}-${pad(lastDay)}`,
      isCurrent: year === now.year && month === now.month,
      shift: (delta) =>
        setValue((v) => {
          const d = new Date(Date.UTC(v.year, v.month - 1 + delta, 1))
          return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
        }),
      reset: () => setValue(current()),
    }
  }, [value])

  return <MonthContext.Provider value={ctx}>{children}</MonthContext.Provider>
}

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth must be used inside <MonthProvider>')
  return ctx
}
