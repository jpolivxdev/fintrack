import { ArrowUp, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { askErrorMessage, useAiStatus, useAsk, type AskAnswer } from '@/hooks/queries-ai'
import { formatMoney, formatShortDate } from '@/lib/format'

const MAX = 300
const EXAMPLES = ['Quanto gastei este mês?', 'Onde mais gastei no mês passado?', 'Quais foram minhas maiores despesas este mês?', 'Quanto gastei com Alimentação este ano?']

const TOOL_LABELS: Record<string, string> = {
  resumoDoPeriodo: 'Resumo do período',
  gastosPorCategoria: 'Gastos por categoria',
  totalPorCategoria: 'Total da categoria',
  maioresDespesas: 'Maiores despesas',
}
const MONEY_KEYS = new Set(['receitas', 'despesas', 'saldo', 'total', 'valor'])
const KEY_LABELS: Record<string, string> = {
  periodo: 'Período', receitas: 'Receitas', despesas: 'Despesas', saldo: 'Saldo', transacoes: 'Transações', categorias: 'Categorias',
  categoria: 'Categoria', total: 'Total', tipo: 'Tipo', descricao: 'Descrição', valor: 'Valor', data: 'Data', inicio: 'De', fim: 'Até',
}

/** Tool results as readable rows. Everything is rendered as text (React escapes it). */
function DataValue({ name, value }: { name: string; value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <ul className="grid gap-1">
        {value.map((item, i) => (
          <li key={i} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
            <DataRows data={item} />
          </li>
        ))}
      </ul>
    )
  }
  if (value && typeof value === 'object') return <DataRows data={value} />
  const text = String(value)
  if (MONEY_KEYS.has(name) && /^-?\d+(\.\d+)?$/.test(text)) return <span className="tabular">{formatMoney(text)}</span>
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return <span className="tabular">{formatShortDate(text)}</span>
  return <span>{text}</span>
}

function DataRows({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return <span>{String(data)}</span>
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{KEY_LABELS[key] ?? key}</dt>
          <dd className="min-w-0 break-words">
            <DataValue name={key} value={value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

interface Exchange {
  question: string
  answer?: AskAnswer
  error?: string
}

function AnswerCard({ exchange, pending }: { exchange: Exchange; pending: boolean }) {
  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3">
      <p className="justify-self-end rounded-2xl rounded-br-md bg-primary/10 px-4 py-2 text-sm">{exchange.question}</p>
      <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-5" aria-live="polite">
        {pending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Consultando seus dados…
          </div>
        ) : exchange.error ? (
          <p role="alert" className="text-sm text-destructive">
            {exchange.error}
          </p>
        ) : (
          exchange.answer && (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="ai-answer">
                {exchange.answer.resposta}
              </p>
              {exchange.answer.dadosUtilizados.length > 0 && (
                <details className="group text-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground">
                    <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
                    Dados usados ({exchange.answer.dadosUtilizados.length})
                  </summary>
                  <div className="mt-2 grid gap-3">
                    {exchange.answer.dadosUtilizados.map((d, i) => (
                      <section key={i} className="grid gap-1.5">
                        <h3 className="font-medium">{TOOL_LABELS[d.ferramenta] ?? d.ferramenta}</h3>
                        <DataRows data={d.resultado} />
                      </section>
                    ))}
                  </div>
                </details>
              )}
            </>
          )
        )}
      </div>
    </motion.article>
  )
}

export function AskPage() {
  const { data: status, isLoading } = useAiStatus()
  const ask = useAsk()
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Exchange[]>([])

  async function send(text: string) {
    const q = text.trim()
    if (!q || q.length > MAX || ask.isPending) return
    setQuestion('')
    setHistory((h) => [{ question: q }, ...h].slice(0, 10))
    let result: Exchange
    try {
      result = { question: q, answer: await ask.mutateAsync(q) }
    } catch (error) {
      result = { question: q, error: askErrorMessage(error) }
    }
    setHistory((h) => [result, ...h.slice(1)])
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(question)
  }

  const ready = status?.aiEnabled && status.servidorDisponivel
  const remaining = status ? Math.max(0, status.cotaDiaria - status.usadasHoje) : 0

  return (
    <div className="mx-auto grid w-full max-w-2xl min-w-0 gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.02em]">
          Pergunte ao FinTrack <Sparkles className="size-5 text-primary" aria-hidden />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Respostas sobre o que está registrado aqui, consultando só os dados do seu lar.</p>
      </div>

      {isLoading || !status ? (
        <Skeleton className="h-32 w-full" />
      ) : !status.aiEnabled ? (
        <EmptyState
          text="Para fazer perguntas, ative a IA em Configurações. Lá explicamos o que é enviado e para onde."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/configuracoes">Ir para Configurações</Link>
            </Button>
          }
        />
      ) : (
        <>
          <form onSubmit={onSubmit} className="grid gap-2">
            <div className="relative">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(question)
                  }
                }}
                maxLength={MAX}
                rows={2}
                disabled={!ready}
                placeholder="Ex.: Quanto gastei com transporte este mês?"
                aria-label="Sua pergunta"
                className="min-h-20 w-full resize-none rounded-2xl border border-input bg-card px-4 py-3 pr-14 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 md:text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2.5 bottom-2.5 rounded-xl"
                disabled={!ready || !question.trim() || ask.isPending}
                aria-label="Perguntar"
              >
                {ask.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </Button>
            </div>
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>{ready ? `${remaining} ${remaining === 1 ? 'uso restante' : 'usos restantes'} hoje` : 'A IA está indisponível no momento. Tente mais tarde.'}</span>
              <span className="tabular">
                {question.length}/{MAX}
              </span>
            </div>
          </form>

          {history.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={!ready}
                  onClick={() => void send(example)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-6">
            {history.map((exchange, i) => (
              <AnswerCard key={history.length - i} exchange={exchange} pending={i === 0 && ask.isPending && !exchange.answer && !exchange.error} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            A IA pode errar. Confira os números em “Dados usados”, que vêm direto do seu FinTrack.
          </p>
        </>
      )}
    </div>
  )
}
