import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAiStatus, useSetAiEnabled } from '@/hooks/queries-ai'
import { errorMessage } from '@/lib/api'

const OFF_REASONS: Record<string, string> = {
  disabled: 'A IA está desligada no servidor no momento.',
  paused: 'A IA está pausada (limite do plano gratuito). Ela volta sozinha.',
  no_quota: 'A IA está indisponível no servidor.',
  auth: 'A IA está indisponível no servidor.',
}

/**
 * Opt-in: nothing of this user goes to the AI provider until they turn this
 * on, after reading what is sent and where. The demo account is always on
 * (fictional data) and cannot change it.
 */
export function AiSettings() {
  const { data: status, isLoading } = useAiStatus()
  const setEnabled = useSetAiEnabled()

  if (isLoading || !status) return <Skeleton className="h-28 w-full" />

  async function toggle(next: boolean) {
    try {
      await setEnabled.mutateAsync(next)
      toast.success(next ? 'IA ativada.' : 'IA desativada. Nada mais é enviado ao provedor.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="grid gap-1.5 text-muted-foreground">
          <p className="text-foreground">
            Ao ativar, a descrição das transações que você digita e os totais usados para responder suas perguntas são enviados ao Google Gemini.
          </p>
          <p>
            O FinTrack usa o plano gratuito da API: nele, o Google pode usar esse conteúdo para melhorar seus produtos, e pessoas podem revisá-lo. Não
            enviamos seu nome, e-mail, saldos de contas nem dados de outras pessoas. Evite colocar informações sensíveis nas descrições.
          </p>
          <p>Desativada, a categoria continua sendo sugerida por palavras-chave, sem sair do FinTrack.</p>
        </div>
      </div>

      <label className="flex items-center justify-between gap-4">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Usar IA no meu FinTrack</span>
          <span className="text-xs text-muted-foreground">
            {status.demo
              ? 'Conta demo: sempre ativada, com dados fictícios.'
              : status.aiEnabled
                ? `${status.usadasHoje} de ${status.cotaDiaria} usos hoje`
                : 'Desativada'}
          </span>
        </span>
        <Switch
          checked={status.aiEnabled}
          disabled={status.demo || setEnabled.isPending}
          onCheckedChange={(v) => void toggle(v)}
          aria-label="Usar IA no meu FinTrack"
        />
      </label>

      {!status.servidorDisponivel && status.motivo && (
        <p className="text-xs text-muted-foreground">{OFF_REASONS[status.motivo] ?? 'A IA está indisponível no momento.'}</p>
      )}
    </div>
  )
}
