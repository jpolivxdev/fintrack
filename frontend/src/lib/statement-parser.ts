import Papa from 'papaparse'
import type { ImportRow } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** "1.234,56" | "-1234.56" | "R$ -89,90" | "(45,00)" -> signed number (2 decimals) or null. */
export function parseSignedAmount(raw: string): number | null {
  let s = raw.trim().replace(/R\$\s?/i, '').replace(/\s/g, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (s.endsWith('-')) {
    negative = !negative
    s = s.slice(0, -1)
  }
  // Decimal comma when the last separator is a comma (pt-BR), else dot.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [int, frac = ''] = s.split('.')
  const cents = Number(int) * 100 + Number(frac.padEnd(2, '0'))
  return (negative ? -cents : cents) / 100
}

/** "15/09/2026" | "2026-09-15" | "15-09-26" -> "2026-09-15" or null. */
export function parseDateCell(raw: string): string | null {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
  }
  return null
}

/**
 * OFX (what Brazilian banks export). Handles both SGML (unclosed tags) and
 * XML flavors by reading each <STMTTRN> block field by field.
 */
export function parseOfx(text: string): ImportRow[] {
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  const field = (block: string, name: string) => {
    const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block)
    return m ? m[1].trim() : ''
  }
  return blocks.flatMap((block) => {
    const posted = field(block, 'DTPOSTED') // YYYYMMDD[HHMMSS[.XXX][TZ]]
    const amount = Number(field(block, 'TRNAMT').replace(',', '.'))
    if (!/^\d{8}/.test(posted) || !Number.isFinite(amount) || amount === 0) return []
    const description = (field(block, 'MEMO') || field(block, 'NAME') || 'Lançamento importado').slice(0, 120)
    const fitid = field(block, 'FITID').replace(/[^\w.:-]/g, '').slice(0, 100)
    return [
      {
        date: `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`,
        description,
        amount: Math.round(amount * 100) / 100,
        externalId: fitid || undefined,
      },
    ]
  })
}

export interface CsvTable {
  headers: string[]
  rows: string[][]
}

export function readCsv(text: string): CsvTable {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true })
  const [headers = [], ...rows] = parsed.data
  return { headers: headers.map((h) => h.trim()), rows }
}

export interface CsvMapping {
  date: number
  description: number
  amount: number
  category: number | null
}

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Best guess of which column is which, from common Brazilian bank headers. */
export function guessMapping(headers: string[]): CsvMapping {
  const find = (...names: string[]) => headers.findIndex((h) => names.some((n) => normalize(h).includes(n)))
  return {
    date: Math.max(find('data', 'date'), 0),
    description: Math.max(find('descri', 'historico', 'lancamento', 'title', 'memo'), 1),
    amount: Math.max(find('valor', 'amount', 'quantia'), 2),
    category: (() => {
      const i = find('categoria', 'category')
      return i >= 0 ? i : null
    })(),
  }
}

export function csvToRows(table: CsvTable, mapping: CsvMapping): { rows: ImportRow[]; invalid: number } {
  let invalid = 0
  const rows = table.rows.flatMap((cells) => {
    const date = parseDateCell(cells[mapping.date] ?? '')
    const amount = parseSignedAmount(cells[mapping.amount] ?? '')
    const description = (cells[mapping.description] ?? '').trim().slice(0, 120)
    if (!date || amount === null || amount === 0 || !description) {
      invalid += 1
      return []
    }
    const category = mapping.category !== null ? cells[mapping.category]?.trim().slice(0, 50) : undefined
    return [{ date, description, amount, category: category || undefined }]
  })
  return { rows, invalid }
}
