import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, DatabaseBackup, Download, FileUp, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useHousehold } from '@/hooks/queries-more'
import { useTransactions } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'

interface BackupFile {
  kind: 'fintrack-backup'
  version: number
  exportedAt: string
  exportedBy?: string
  accounts: unknown[]
  categories: unknown[]
  transactions: unknown[]
  transfers: unknown[]
  recurring: unknown[]
  budgets: unknown[]
  goals: unknown[]
  investments: unknown[]
  events: unknown[]
}

type RestoreResult = Record<'accounts' | 'categories' | 'transactions' | 'transfers' | 'recurring' | 'budgets' | 'goals' | 'investments' | 'events', number>

const MAX_BYTES = 15 * 1024 * 1024
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`

function summary(b: Pick<BackupFile, 'accounts' | 'transactions' | 'recurring' | 'goals' | 'investments' | 'events'> | RestoreResult): string[] {
  const count = (v: unknown[] | number) => (typeof v === 'number' ? v : v.length)
  return [
    plural(count(b.accounts), 'conta', 'contas'),
    plural(count(b.transactions), 'lançamento', 'lançamentos'),
    plural(count(b.recurring), 'recorrente', 'recorrentes'),
    plural(count(b.goals), 'meta', 'metas'),
    plural(count(b.investments), 'investimento', 'investimentos'),
    plural(count(b.events), 'compromisso', 'compromissos'),
  ]
}

async function download(): Promise<void> {
  const res = await api.get<Blob>('/backup', { responseType: 'blob' })
  const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? `fintrack-backup-${new Date().toISOString().slice(0, 10)}.json`
  const url = URL.createObjectURL(res.data)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Move everything between FinTracks (e.g. from the local install to the site):
 * download one file here, restore it there. Nothing leaves the user's hands.
 */
export function FullBackup() {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const { data: household } = useHousehold()
  // Whether this FinTrack already has entries (restoring adds to them).
  const { data: existing } = useTransactions({ page: 1, limit: 1 })
  const [downloading, setDownloading] = useState(false)
  const [file, setFile] = useState<BackupFile | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)
  const isDemo = household?.invitesEnabled === false
  const hasData = (existing?.meta.total ?? 0) > 0

  async function onDownload() {
    setDownloading(true)
    try {
      await download()
      toast.success('Backup baixado. Guarde o arquivo: ele tem todos os seus dados.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDownloading(false)
    }
  }

  async function onPick(picked: File) {
    setResult(null)
    if (picked.size > MAX_BYTES) return toast.error('Arquivo grande demais (máx. 15 MB).')
    try {
      const parsed = JSON.parse(await picked.text()) as BackupFile
      if (parsed?.kind !== 'fintrack-backup') throw new Error('kind')
      if (parsed.version !== 1) return toast.error('Esse backup é de uma versão mais nova do FinTrack.')
      setFile(parsed)
    } catch {
      toast.error('Esse arquivo não é um backup do FinTrack.')
    }
  }

  async function onRestore() {
    if (!file) return
    setRestoring(true)
    try {
      const res = (await api.post<RestoreResult>('/backup/restore', file)).data
      setResult(res)
      setFile(null)
      await qc.invalidateQueries()
      toast.success('Backup restaurado.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          Um arquivo com tudo: contas, lançamentos, parcelas, recorrentes, orçamentos, metas, investimentos e compromissos.
        </p>
        <Button variant="outline" className="justify-self-start" onClick={() => void onDownload()} disabled={downloading}>
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Baixar backup completo
        </Button>
      </div>

      {!isDemo && (
        <div className="grid gap-3">
          <p className="text-sm font-medium">Restaurar um backup</p>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              e.target.value = ''
              if (picked) void onPick(picked)
            }}
          />
          {!file ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <FileUp className="size-6" />
              <span className="font-medium text-foreground">Escolher o arquivo de backup</span>
              <span>O arquivo fintrack-backup-....json</span>
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
            >
              <p className="flex items-center gap-2 font-medium">
                <DatabaseBackup className="size-4 text-primary-text" />
                Backup {file.exportedBy ? `de ${file.exportedBy}` : ''} de{' '}
                {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(file.exportedAt))}
              </p>
              <p className="text-sm text-muted-foreground">{summary(file).join(' · ')}</p>
              <p className="text-sm text-muted-foreground">
                {hasData
                  ? 'Seu FinTrack já tem lançamentos: o backup será somado ao que já existe. Restaurar o mesmo arquivo duas vezes duplica os dados.'
                  : 'Tudo entra na sua conta de uma vez. Categorias com o mesmo nome são aproveitadas.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void onRestore()} disabled={restoring}>
                  {restoring && <Loader2 className="size-4 animate-spin" />}
                  {restoring ? 'Restaurando…' : 'Restaurar'}
                </Button>
                <Button variant="ghost" onClick={() => setFile(null)} disabled={restoring}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          )}
          {result && (
            <div className="flex items-start gap-3 rounded-xl border bg-income/5 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" />
              <div>
                <p className="font-medium">Tudo restaurado</p>
                <p className="text-muted-foreground">{summary(result).join(' · ')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
