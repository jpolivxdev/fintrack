const pad = (n: number) => String(n).padStart(2, '0')

/** Local "YYYY-MM-DD" + "HH:MM" -> ISO instant (UTC "Z"), as the API expects. */
export function localToInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

/** ISO instant -> local date "YYYY-MM-DD". */
export function instantToLocalDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO instant -> local time "HH:MM". */
export function instantToLocalTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "22:00" style, 24h, pt-BR. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** "sexta, 2 de outubro" */
export function formatLongDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
}

/** Local Date -> ISO 8601 with the local offset, e.g. "2026-10-01T00:00:00-03:00". */
export function toLocalIso(d: Date): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}
