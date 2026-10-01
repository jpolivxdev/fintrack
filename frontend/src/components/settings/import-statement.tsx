import { FileUp, Loader2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategories } from '@/hooks/queries'
import { useAccounts, useImportTransactions } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { csvToRows, guessMapping, parseOfx, readCsv, type CsvMapping, type CsvTable } from '@/lib/statement-parser'
import type { ImportResult, ImportRow } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX_ROWS = 500

/**
 * Bank statement import: the file is read in the browser (CSV or OFX), shown
 * as a preview, and only normalized rows are sent to the API.
 */
export function ImportStatement() {
  const fileInput = useRef<HTMLInputElement>(null)
  const { data: accountsData } = useAccounts()
  const { data: categories = [] } = useCategories()
  const importTx = useImportTransactions()
  const accounts = accountsData?.data ?? []

  const [fileName, setFileName] = useState('')
  const [ofxRows, setOfxRows] = useState<ImportRow[] | null>(null)
  const [csv, setCsv] = useState<CsvTable | null>(null)
  const [mapping, setMapping] = useState<CsvMapping | null>(null)
  const [accountId, setAccountId] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('')
  const [incomeCategory, setIncomeCategory] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const parsed = useMemo(() => {
    if (ofxRows) return { rows: ofxRows, invalid: 0 }
    if (csv && mapping) return csvToRows(csv, mapping)
    return null
  }, [ofxRows, csv, mapping])

  async function onFile(file: File) {
    setResult(null)
    setFileName(file.name)
    // Statements are small; anything huge is not a statement.
    if (file.size > 2 * 1024 * 1024) return toast.error('Arquivo grande demais (máx. 2 MB).')
    const text = await file.text()
    if (/\.ofx$/i.test(file.name) || /<OFX>/i.test(text)) {
      const rows = parseOfx(text)
      setCsv(null)
      setMapping(null)
      setOfxRows(rows)
      if (!rows.length) toast.error('Não encontramos lançamentos neste OFX.')
    } else {
      const table = readCsv(text)
      setOfxRows(null)
      setCsv(table)
      setMapping(guessMapping(table.headers))
    }
    if (!accountId && accounts.length) setAccountId(accounts[0].id)
  }

  async function submit() {
    if (!parsed?.rows.length || !accountId) return
    try {
      const res = await importTx.mutateAsync({
        accountId,
        rows: parsed.rows.slice(0, MAX_ROWS),
        defaultExpenseCategoryId: expenseCategory || undefined,
        defaultIncomeCategoryId: incomeCategory || undefined,
      })
      setResult(res)
      toast.success(`${res.created} lançamento(s) importado(s).`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const columnSelect = (key: keyof CsvMapping, label: string, optional = false) =>
    csv &&
    mapping && (
      <div className="grid gap-1.5">
        <Label>{label}</Label>
        <Select
          value={mapping[key] === null ? 'none' : String(mapping[key])}
          onValueChange={(v) => setMapping({ ...mapping, [key]: v === 'none' ? null : Number(v) })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {optional && <SelectItem value="none">Nenhuma</SelectItem>}
            {csv.headers.map((h, i) => (
              <SelectItem key={i} value={String(i)}>
                {h || `Coluna ${i + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )

  const income = parsed?.rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0) ?? 0
  const expense = parsed?.rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0) ?? 0

  return (
    <div className="grid gap-4">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.ofx,text/csv,application/x-ofx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
      >
        <FileUp className="size-6" />
        <span className="font-medium text-foreground">{fileName || 'Escolher arquivo do banco'}</span>
        <span>OFX ou CSV exportado do app do banco (Nubank, Itaú, Inter...)</span>
      </button>

      {csv && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {columnSelect('date', 'Coluna da data')}
          {columnSelect('description', 'Coluna da descrição')}
          {columnSelect('amount', 'Coluna do valor')}
          {columnSelect('category', 'Coluna da categoria', true)}
        </div>
      )}

      {parsed && parsed.rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Importar para a conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Categoria padrão das despesas</Label>
              <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.type === 'EXPENSE').map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Categoria padrão das entradas</Label>
              <Select value={incomeCategory} onValueChange={setIncomeCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.type === 'INCOME').map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground tabular">
              <span>
                {parsed.rows.length} lançamento(s)
                {parsed.invalid > 0 && ` · ${parsed.invalid} linha(s) ignorada(s)`}
                {parsed.rows.length > MAX_ROWS && ` · só os primeiros ${MAX_ROWS} serão enviados`}
              </span>
              <span>
                <span className="text-income">+{formatMoney(income)}</span> · <span className="text-expense">−{formatMoney(expense)}</span>
              </span>
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto text-sm">
              {parsed.rows.slice(0, 50).map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground tabular">{formatDate(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.description}</span>
                  <span className={cn('tabular', r.amount > 0 ? 'text-income' : 'text-foreground')}>{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Lançamentos já existentes são ignorados: pode importar o mesmo extrato de novo sem duplicar.
          </p>
          <Button onClick={submit} disabled={importTx.isPending || !accountId} className="h-11 sm:h-9 sm:justify-self-start">
            {importTx.isPending && <Loader2 className="size-4 animate-spin" />}
            Importar {Math.min(parsed.rows.length, MAX_ROWS)} lançamento(s)
          </Button>
        </>
      )}

      {result && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
          <p className="font-medium">
            {result.created} importado(s) · {result.skipped} já existia(m)
            {result.errors.length > 0 && ` · ${result.errors.length} com problema`}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
              {result.errors.slice(0, 8).map((e) => (
                <li key={e.row}>
                  Linha {e.row + 1}: {e.message.includes('No category') ? 'sem categoria correspondente. Escolha uma categoria padrão.' : e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
