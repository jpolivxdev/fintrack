import { instantToLocalDate, localToInstant } from '@/lib/datetime'
import type { ImportRow } from '@/lib/types'

/**
 * Backup exported by the old Vida App (localStorage, Angular). Everything is
 * validated here: the file comes from a device, not from our API.
 */
export interface VidaData {
  transactions: ImportRow[]
  /** Pending tasks, already turned into calendar event inputs. */
  events: { title: string; startAt: string; endAt: string; allDay: boolean }[]
  goal: { target: number; saved: number } | null
  /** Expense categories used in the backup (Vida names). */
  expenseCategories: string[]
  skippedDoneTasks: number
}

/** Vida categories that FinTrack doesn't create by default, with a look for them. */
export const VIDA_EXTRA_CATEGORIES: Record<string, { icon: string; color: string }> = {
  Compras: { icon: 'shopping-cart', color: '#f97316' },
  Contas: { icon: 'receipt', color: '#6366f1' },
  Outros: { icon: 'circle-dollar-sign', color: '#64748b' },
}
export const VIDA_INCOME_CATEGORY = { name: 'Outras receitas', icon: 'banknote', color: '#22c55e' }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

/** Strips control characters (the API rejects them) and caps the length. */
function cleanText(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function plusOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function parseVidaBackup(text: string): VidaData {
  let raw: unknown
  try {
    raw = JSON.parse(text.trim())
  } catch {
    throw new Error('Esse arquivo não é um backup válido do Vida App.')
  }
  if (!isObj(raw) || raw.app !== 'vida-app') throw new Error('Esse arquivo não é um backup do Vida App.')

  const transactions: ImportRow[] = []
  const categories = new Set<string>()
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    if (!isObj(t)) continue
    const amount = Math.round(Math.abs(Number(t.amount)) * 100) / 100
    const date = typeof t.date === 'string' && !Number.isNaN(Date.parse(t.date)) ? instantToLocalDate(t.date) : null
    if (!amount || !date || (t.type !== 'income' && t.type !== 'expense')) continue
    const type = t.type === 'income' ? 'INCOME' : 'EXPENSE'
    const category = cleanText(t.category, 50) || 'Outros'
    if (type === 'EXPENSE') categories.add(category)
    const id = cleanText(t.id, 90).replace(/[^\w.:-]/g, '')
    transactions.push({
      date,
      description: cleanText(t.description, 120) || category,
      amount: type === 'EXPENSE' ? -amount : amount,
      type,
      category: type === 'EXPENSE' ? category : undefined,
      // Re-importing the same backup skips what is already there.
      externalId: id ? `vida:${id}` : undefined,
    })
  }

  const events: VidaData['events'] = []
  let skippedDoneTasks = 0
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
    if (!isObj(t) || typeof t.date !== 'string' || !DATE_ONLY.test(t.date)) continue
    if (t.done) {
      skippedDoneTasks++
      continue
    }
    const title = cleanText(t.text, 120) || 'Tarefa'
    const time = typeof t.time === 'string' && TIME.test(t.time) ? t.time : null
    events.push(
      time
        ? { title, allDay: false, startAt: localToInstant(t.date, time), endAt: localToInstant(t.date, plusOneHour(time)) }
        : { title, allDay: true, startAt: localToInstant(t.date, '00:00'), endAt: localToInstant(t.date, '23:59') },
    )
  }

  let goal: VidaData['goal'] = null
  if (isObj(raw.goal)) {
    const target = Math.round(Math.max(0, Number(raw.goal.target) || 0) * 100) / 100
    const saved = Math.round(Math.max(0, Number(raw.goal.saved) || 0) * 100) / 100
    if (target > 0) goal = { target, saved }
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date))
  return { transactions, events, goal, expenseCategories: [...categories], skippedDoneTasks }
}
