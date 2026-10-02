import { Copy, MessageCircle, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Shows a one-time code with copy / share / WhatsApp actions. */
export function InviteCodeCard({ code, expiresAt, shareText }: { code: string; expiresAt: string; shareText: string }) {
  async function share() {
    if (navigator.share) {
      await navigator.share({ title: 'Convite para o FinTrack', text: shareText }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(shareText)
      toast.success('Mensagem copiada.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-muted/30 p-5 text-center">
        <p className="text-xs text-muted-foreground">Código de convite</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] tabular select-all">{code}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Válido até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(expiresAt))}, uso
          único
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 [&>*]:h-11 sm:[&>*]:h-9">
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(code).then(() => toast.success('Código copiado.'))}>
          <Copy className="size-4" /> Copiar código
        </Button>
        <Button variant="outline" onClick={() => void share()}>
          <Share2 className="size-4" /> Compartilhar
        </Button>
        <Button variant="outline" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        </Button>
      </div>
    </div>
  )
}

/** Code input (8 chars, dash optional) used to accept an invite. */
export function normalizeCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}
