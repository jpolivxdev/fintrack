import { ClipboardPaste, FileUp, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { textareaClass } from '@/components/transactions/transaction-form'
import { useCategories, useInvalidateMoney } from '@/hooks/queries'
import { useAccounts } from '@/hooks/queries-more'
import { api, errorMessage } from '@/lib/api'
import { localDateKey, toLocalIso } from '@/lib/datetime'
import { formatDate, formatMoney } from '@/lib/format'
import type { CalendarFeed, Category, EventVisibility, Goal, ImportResult } from '@/lib/types'
import { parseVidaBackup, VIDA_EXTRA_CATEGORIES, VIDA_INCOME_CATEGORY, type VidaData } from '@/lib/vida-backup'

const GOAL_NAME = 'Meta de economia'
const CHUNK = 500

interface Summary {
  created: number
  skipped: number
  failed: number
  events: number
  eventsSkipped: number
  goal: 'created' | 'exists' | 'none'
}

/** One-shot migration from the old Vida App (its data lived in the phone's localStorage). */
export function ImportVida() {
  const fileInput = useRef<HTMLInputElement>(null)
  const { data: accountsData } = useAccounts()
  const { data: categories = [] } = useCategories()
  const invalidate = useInvalidateMoney()
  const accounts = accountsData?.data ?? []

  const [data, setData] = useState<VidaData | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [accountId, setAccountId] = useState('')
  const [visibility, setVisibility] = useState<EventVisibility>('PRIVATE')
  const [running, setRunning] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)

  function load(text: string) {
    setSummary(null)
    try {
      const parsed = parseVidaBackup(text)
      setData(parsed)
      setPasting(false)
      if (!accountId && accounts.length) setAccountId(accounts[0].id)
    } catch (error) {
      setData(null)
      toast.error(error instanceof Error ? error.message : 'Arquivo inválido.')
    }
  }

  const findCategory = (name: string, type: 'INCOME' | 'EXPENSE') =>
    categories.find((c) => c.type === type && c.name.trim().toLowerCase() === name.trim().toLowerCase())
  const missingCategories = data ? data.expenseCategories.filter((name) => !findCategory(name, 'EXPENSE')) : []
  const hasIncome = !!data?.transactions.some((t) => t.type === 'INCOME')

  async function ensureCategory(name: string, type: 'INCOME' | 'EXPENSE', look: { icon: string; color: string }): Promise<string> {
    const existing = findCategory(name, type)
    if (existing) return existing.id
    return (await api.post<Category>('/categories', { name, type, ...look })).data.id
  }

  async function run() {
    if (!data || !accountId) return
    const result: Summary = { created: 0, skipped: 0, failed: 0, events: 0, eventsSkipped: 0, goal: 'none' }
    try {
      // 1. Categories the Vida App had and FinTrack doesn't.
      setRunning('Criando categorias...')
      for (const name of missingCategories) {
        await ensureCategory(name, 'EXPENSE', VIDA_EXTRA_CATEGORIES[name] ?? VIDA_EXTRA_CATEGORIES.Outros)
      }
      const incomeId = hasIncome ? await ensureCategory(VIDA_INCOME_CATEGORY.name, 'INCOME', VIDA_INCOME_CATEGORY) : undefined

      // 2. Transactions, in API-sized chunks (duplicates are skipped by the server).
      for (let i = 0; i < data.transactions.length; i += CHUNK) {
        setRunning(`Importando lançamentos (${Math.min(i + CHUNK, data.transactions.length)}/${data.transactions.length})...`)
        const res = (
          await api.post<ImportResult>('/transactions/import', {
            accountId,
            rows: data.transactions.slice(i, i + CHUNK),
            defaultIncomeCategoryId: incomeId,
          })
        ).data
        result.created += res.created
        result.skipped += res.skipped
        result.failed += res.errors.length
      }

      // 3. Pending tasks become calendar events, skipping ones already there.
      if (data.events.length) {
        setRunning('Criando compromissos...')
        const existing = await existingEventKeys(data.events.map((e) => e.startAt))
        for (const event of data.events) {
          const key = `${event.title}|${new Date(event.startAt).getTime()}`
          if (existing.has(key)) {
            result.eventsSkipped++
            continue
          }
          await api.post('/events', { ...event, visibility })
          existing.add(key)
          result.events++
        }
      }

      // 4. The savings goal (Vida had a single, unnamed one).
      if (data.goal) {
        setRunning('Criando a meta...')
        const goals = (await api.get<Goal[]>('/goals')).data
        if (goals.some((g) => g.name === GOAL_NAME)) {
          result.goal = 'exists'
        } else {
          const goal = (await api.post<Goal>('/goals', { name: GOAL_NAME, targetAmount: data.goal.target, icon: 'landmark' })).data
          if (data.goal.saved > 0) {
            await api.post(`/goals/${goal.id}/contributions`, {
              amount: data.goal.saved,
              date: localDateKey(new Date()),
              note: 'Guardado no Vida App',
            })
          }
          result.goal = 'created'
        }
      }

      setSummary(result)
      toast.success('Dados do Vida App importados.')
    } catch (error) {
      setSummary(result)
      toast.error(errorMessage(error))
    } finally {
      setRunning('')
      void invalidate()
    }
  }

  const income = data?.transactions.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0) ?? 0
  const expense = data?.transactions.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0) ?? 0
  const first = data?.transactions[0]?.date
  const last = data?.transactions.at(-1)?.date

  return (
    <div className="grid gap-4">
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (file.size > 5 * 1024 * 1024) return toast.error('Arquivo grande demais (máx. 5 MB).')
          load(await file.text())
        }}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <FileUp className="size-6" />
          <span className="font-medium text-foreground">Escolher o backup</span>
          <span>O arquivo vida-backup-....json</span>
        </button>
        <button
          type="button"
          onClick={() => setPasting((p) => !p)}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ClipboardPaste className="size-6" />
          <span className="font-medium text-foreground">Colar dados</span>
          <span>Se usou "Copiar" no Vida App</span>
        </button>
      </div>

      {pasting && (
        <div className="grid gap-2">
          <textarea
            className={textareaClass}
            rows={4}
            placeholder='Cole aqui o que foi copiado (começa com {"app":"vida-app"...)'
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <Button variant="outline" className="h-11 sm:h-9 sm:justify-self-start" disabled={!pasted.trim()} onClick={() => load(pasted)}>
            Ler dados colados
          </Button>
        </div>
      )}

      {data && (
        <>
          <ul className="grid gap-2 rounded-xl border bg-muted/30 p-4 text-sm">
            <li>
              <span className="font-medium">{data.transactions.length} lançamento(s)</span>
              {first && last && (
                <span className="text-muted-foreground">
                  {' '}
                  de {formatDate(first)} a {formatDate(last)} ·{' '}
                </span>
              )}
              <span className="text-income tabular">+{formatMoney(income)}</span>
              {' · '}
              <span className="text-expense tabular">−{formatMoney(expense)}</span>
            </li>
            <li>
              <span className="font-medium">{data.events.length} tarefa(s) pendente(s)</span>
              <span className="text-muted-foreground">
                {' '}
                viram compromissos na agenda
                {data.skippedDoneTasks > 0 && ` (${data.skippedDoneTasks} concluída(s) ficam de fora)`}
              </span>
            </li>
            <li>
              {data.goal ? (
                <>
                  <span className="font-medium">Meta de economia</span>
                  <span className="text-muted-foreground tabular">
                    {' '}
                    de {formatMoney(data.goal.target)}, com {formatMoney(data.goal.saved)} guardados
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Sem meta definida no Vida App</span>
              )}
            </li>
            {(missingCategories.length > 0 || hasIncome) && (
              <li className="text-muted-foreground">
                Categorias novas:{' '}
                {[...missingCategories, ...(hasIncome && !findCategory(VIDA_INCOME_CATEGORY.name, 'INCOME') ? [VIDA_INCOME_CATEGORY.name] : [])].join(', ') ||
                  'nenhuma'}
              </li>
            )}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Lançamentos vão para a conta</Label>
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
            {data.events.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Quem vê os compromissos</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as EventVisibility)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRIVATE">Só eu</SelectItem>
                    <SelectItem value="SHARED">Compartilhado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">Pode importar de novo sem medo: o que já foi trazido não duplica.</p>
          <Button onClick={run} disabled={!!running || !accountId} className="h-11 sm:h-9 sm:justify-self-start">
            {running && <Loader2 className="size-4 animate-spin" />}
            {running || 'Importar tudo'}
          </Button>
        </>
      )}

      {summary && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
          <p className="font-medium">
            {summary.created} lançamento(s) importado(s)
            {summary.skipped > 0 && ` · ${summary.skipped} já existia(m)`}
            {summary.failed > 0 && ` · ${summary.failed} com problema`}
          </p>
          <p className="text-muted-foreground">
            {summary.events} compromisso(s) criado(s)
            {summary.eventsSkipped > 0 && `, ${summary.eventsSkipped} já estava(m) na agenda`}
            {summary.goal === 'created' && ' · meta criada'}
            {summary.goal === 'exists' && ' · a meta já existia'}
          </p>
        </div>
      )}
    </div>
  )
}

/** "title|epoch" of the events already in the calendar around the given instants. */
async function existingEventKeys(instants: string[]): Promise<Set<string>> {
  const times = instants.map((i) => new Date(i).getTime())
  const keys = new Set<string>()
  const DAY = 86_400_000
  const end = Math.max(...times) + DAY
  // The API serves at most 400 days per request.
  for (let from = Math.min(...times) - DAY; from < end; from += 365 * DAY) {
    const to = Math.min(from + 365 * DAY, end)
    const feed = (
      await api.get<CalendarFeed>('/calendar', { params: { from: toLocalIso(new Date(from)), to: toLocalIso(new Date(to)) } })
    ).data
    for (const e of feed.events) keys.add(`${e.title}|${new Date(e.startAt).getTime()}`)
  }
  return keys
}
