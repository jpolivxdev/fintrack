import { CalendarHeart, Loader2, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCalendarShares, useCreateCalendarInvite, useJoinCalendar, useRemoveCalendarPartner } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import type { CalendarPartner } from '@/lib/types'
import { InviteCodeCard, normalizeCode } from './invite-code-card'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

/** Share the calendar with someone while each one keeps their own finances. */
export function CalendarSharing() {
  const { data, isLoading } = useCalendarShares()
  const createInvite = useCreateCalendarInvite()
  const join = useJoinCalendar()
  const remove = useRemoveCalendarPartner()
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [code, setCode] = useState('')
  const [toRemove, setToRemove] = useState<CalendarPartner | null>(null)

  if (isLoading || !data) return <Skeleton className="h-24 w-full" />

  if (!data.invitesEnabled) {
    return (
      <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        O compartilhamento está desativado na conta demo, que é usada por todos os visitantes. Crie sua própria conta para testar.
      </p>
    )
  }

  const shareText = invite
    ? `Vamos compartilhar nossa agenda no FinTrack (cada um com suas finanças)! Crie sua conta em ${window.location.origin} e, em Configurações → Agenda compartilhada, use o código ${invite.code} (vale por 48 horas).`
    : ''

  async function doJoin() {
    try {
      const res = await join.mutateAsync(normalizeCode(code))
      setCode('')
      const newest = res.partners.at(-1)
      toast.success(newest ? `Agenda conectada com ${newest.name}.` : 'Agenda conectada.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function doRemove() {
    if (!toRemove) return
    try {
      await remove.mutateAsync(toRemove.userId)
      toast.success(`Você parou de compartilhar a agenda com ${toRemove.name}.`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToRemove(null)
    }
  }

  return (
    <div className="grid gap-5">
      {data.partners.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {data.partners.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials(p.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
              </div>
              <Button variant="ghost" size="icon" className="size-10" aria-label={`Parar de compartilhar com ${p.name}`} onClick={() => setToRemove(p)}>
                <UserMinus className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2">
        <p className="text-sm font-medium">Convidar alguém</p>
        {invite ? (
          <InviteCodeCard code={invite.code} expiresAt={invite.expiresAt} shareText={shareText} />
        ) : (
          <Button
            onClick={async () => {
              try {
                setInvite(await createInvite.mutateAsync())
              } catch (error) {
                toast.error(errorMessage(error))
              }
            }}
            disabled={createInvite.isPending}
            className="h-11 justify-self-start sm:h-9"
          >
            {createInvite.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarHeart className="size-4" />}
            Gerar código da agenda
          </Button>
        )}
      </div>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (normalizeCode(code).length === 8) void doJoin()
          else toast.error('O código tem 8 caracteres, como K7QM-4XPA.')
        }}
      >
        <label htmlFor="calendar-code" className="text-sm font-medium">
          Recebeu um código?
        </label>
        <div className="flex gap-2">
          <Input
            id="calendar-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            className="h-11 font-mono tracking-widest uppercase sm:h-9"
            maxLength={9}
            autoComplete="off"
            autoCapitalize="characters"
          />
          <Button type="submit" className="h-11 sm:h-9" disabled={join.isPending}>
            {join.isPending && <Loader2 className="size-4 animate-spin" />}
            Conectar
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={`Parar de compartilhar com ${toRemove?.name ?? ''}?`}
        description="Vocês deixam de ver os compromissos um do outro. Nada é apagado: cada um continua com os compromissos que criou."
        confirmLabel="Parar de compartilhar"
        onConfirm={doRemove}
      />
    </div>
  )
}
