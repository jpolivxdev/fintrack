import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { useServerSlow } from '@/lib/network-status'

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb)
      window.addEventListener('offline', cb)
      return () => {
        window.removeEventListener('online', cb)
        window.removeEventListener('offline', cb)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}

/** Queries that failed and are not being retried right now. */
function useFailedQueries(): number {
  const qc = useQueryClient()
  const count = () => qc.getQueryCache().findAll({ predicate: (q) => q.state.status === 'error' && q.state.fetchStatus === 'idle' }).length
  const [failed, setFailed] = useState(count)
  useEffect(() => qc.getQueryCache().subscribe(() => setFailed(count())), [qc]) // eslint-disable-line react-hooks/exhaustive-deps
  return failed
}

/**
 * One honest line about the connection, instead of fake empty states:
 * offline, waking the server up, or "couldn't load, try again".
 */
export function ConnectionStatus() {
  const qc = useQueryClient()
  const online = useOnline()
  const slow = useServerSlow()
  const failed = useFailedQueries()
  const fetching = useIsFetching()

  const state = !online ? 'offline' : slow ? 'slow' : failed > 0 ? 'error' : null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {state && (
          <motion.div
            key={state}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border bg-popover/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
          >
            {state === 'offline' && (
              <>
                <WifiOff className="size-4 shrink-0 text-warning" />
                <span>Você está sem internet. Assim que voltar, os dados atualizam.</span>
              </>
            )}
            {state === 'slow' && (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin text-primary-text" />
                <span>
                  <span className="font-medium">Acordando o servidor…</span>{' '}
                  <span className="text-muted-foreground">a primeira conexão do dia pode levar até 1 minuto.</span>
                </span>
              </>
            )}
            {state === 'error' && (
              <>
                <CloudOff className="size-4 shrink-0 text-expense" />
                <span className="min-w-0 flex-1">Não conseguimos carregar tudo. Seus dados estão seguros.</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={fetching > 0}
                  onClick={() => void qc.refetchQueries({ predicate: (q) => q.state.status === 'error' })}
                >
                  <RefreshCw className={fetching > 0 ? 'size-3.5 animate-spin' : 'size-3.5'} /> Tentar de novo
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
