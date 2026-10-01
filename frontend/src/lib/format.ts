const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percentFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Money comes from the API as a decimal string; it is only converted for display. */
export function formatMoney(value: string | number): string {
  return brl.format(Number(value))
}

export function formatMoneyCompact(value: string | number): string {
  return brlCompact.format(Number(value))
}

export function formatPercent(value: number): string {
  return `${percentFmt.format(value)}%`
}

/** "2026-10-01" -> "01/10/2026" (no Date parsing, so no time-zone shift). */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.slice(0, 10).split('-')
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, Number(m) - 1, 1)))
    .replace('.', '')
  return `${Number(d)} ${month}`
}

export function monthLabel(year: number, month: number, style: 'long' | 'short' = 'long'): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  return label.replace('.', '').replace(/^\w/, (c) => c.toUpperCase())
}

/** Today's date in the user's time zone, as YYYY-MM-DD. */
export function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Parses what a Brazilian user types ("1.234,56", "1234,5", "R$ 89", "12.5")
 * into a number with at most 2 decimals, built from integer cents so no float
 * noise (e.g. 124.45000000000002) ever reaches the API.
 */
export function parseMoneyInput(input: string): number | null {
  let s = input.replace(/[R$\s]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [int, frac = ''] = s.split('.')
  const cents = Number(int) * 100 + Number(frac.padEnd(2, '0'))
  return cents / 100
}

/** 1234.5 -> "1.234,50" for pre-filling inputs. */
export function toMoneyInput(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))
}
