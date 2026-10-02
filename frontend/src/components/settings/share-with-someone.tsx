import { CalendarHeart, Crown, Loader2, LogOut, Users, UserMinus, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCalendarShares,
  useCreateCalendarInvite,
  useCreateInvite,
  useHousehold,
  useJoinCalendar,
  useJoinHousehold,
  useLeaveHousehold,
  useLookupInvite,
  useRemoveCalendarPartner,
  useRemoveMember,
} from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { InviteCodeCard, normalizeCode } from './invite-code-card'

type Kind = 'CALENDAR' | 'HOUSEHOLD'
type Pending = { kind: Kind; inviterName: string; code: string }
type Person = { userId: string; name: string; email: string; kind: Kind; owner?: boolean }

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

const KIND_COPY: Record<Kind, { label: string; explain: string }> = {
  CALENDAR: {
    label: 'Só a agenda',
    explain: 'Vocês veem os compromissos marcados como "Compartilhado". Cada um continua com suas finanças.',
  },
  HOUSEHOLD: {
    label: 'Agenda e finanças',
    explain: 'Além da agenda, vocês passam a ver e editar as mesmas contas, lançamentos, metas e orçamentos.',
  },
}

/**
 * One place to share with someone: calendar only, or calendar + finances.
 * A received code is identified first, so the user confirms knowing exactly
 * what will happen before anything changes.
 */
export function ShareWithSomeone() {
  const { user } = useAuth()
  const { data: household, isLoading: loadingHousehold } = useHousehold()
  const { data: shares, isLoading: loadingShares } = useCalendarShares()
  const createCalendarInvite = useCreateCalendarInvite()
  const createHouseholdInvite = useCreateInvite()
  const lookup = useLookupInvite()
  const joinCalendar = useJoinCalendar()
  const joinHousehold = useJoinHousehold()
  const leave = useLeaveHousehold()
  const removeMember = useRemoveMember()
  const removePartner = useRemoveCalendarPartner()

  const [kind, setKind] = useState<Kind>('CALENDAR')
  const [invite, setInvite] = useState<{ kind: Kind; code: string; expiresAt: string } | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [toRemove, setToRemove] = useState<Person | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  if (loadingHousehold || loadingShares || !household || !shares) return <Skeleton className="h-40 w-full" />

  const enabled = household.invitesEnabled && shares.invitesEnabled
  const isOwner = household.role === 'OWNER'
  const sharedHousehold = household.members.length > 1
  const people: Person[] = [
    ...household.members.filter((m) => !m.isYou).map((m) => ({ userId: m.userId, name: m.name, email: m.email, kind: 'HOUSEHOLD' as const, owner: m.role === 'OWNER' })),
    ...shares.partners
      .filter((p) => !household.members.some((m) => m.userId === p.userId))
      .map((p) => ({ userId: p.userId, name: p.name, email: p.email, kind: 'CALENDAR' as const })),
  ]

  if (!enabled) {
    return (
      <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        O compartilhamento está desativado na conta demo, que é usada por todos os visitantes. Crie sua própria conta para testar.
      </p>
    )
  }

  const firstName = user?.name.split(' ')[0] ?? 'Eu'
  const shareText = invite
    ? invite.kind === 'CALENDAR'
      ? `${firstName} quer compartilhar a agenda com você no FinTrack (cada um com suas finanças). Crie sua conta em ${window.location.origin} e, em Configurações → Compartilhar com alguém, use o código ${invite.code}. Vale por 48 horas.`
      : `${firstName} quer juntar as finanças com você no FinTrack. Crie sua conta em ${window.location.origin} e, em Configurações → Compartilhar com alguém, use o código ${invite.code}. Vale por 48 horas.`
    : ''

  async function generate() {
    try {
      const res = kind === 'CALENDAR' ? await createCalendarInvite.mutateAsync() : await createHouseholdInvite.mutateAsync()
      setInvite({ kind, ...res })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function check() {
    const normalized = normalizeCode(code)
    if (normalized.length !== 8) return toast.error('O código tem 8 caracteres, como K7QM-4XPA.')
    try {
      const res = await lookup.mutateAsync(normalized)
      setPending({ ...res, code: normalized })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function accept() {
    if (!pending) return
    try {
      if (pending.kind === 'CALENDAR') {
        await joinCalendar.mutateAsync(pending.code)
        toast.success(`Agenda conectada com ${pending.inviterName}.`)
      } else {
        await joinHousehold.mutateAsync(pending.code)
        toast.success(`Pronto! Agora você e ${pending.inviterName} dividem agenda e finanças.`)
      }
      setPending(null)
      setCode('')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function doRemove() {
    if (!toRemove) return
    try {
      if (toRemove.kind === 'CALENDAR') await removePartner.mutateAsync(toRemove.userId)
      else await removeMember.mutateAsync(toRemove.userId)
      toast.success(toRemove.kind === 'CALENDAR' ? `Você parou de compartilhar a agenda com ${toRemove.name}.` : `${toRemove.name} saiu do lar e levou o que era dele(a).`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToRemove(null)
    }
  }

  async function doLeave() {
    try {
      await leave.mutateAsync()
      toast.success('Você saiu e levou suas contas e lançamentos.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setConfirmLeave(false)
    }
  }

  const accepting = joinCalendar.isPending || joinHousehold.isPending

  return (
    <div className="grid gap-6">
      {people.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Com quem você compartilha</p>
          <ul className="divide-y rounded-xl border">
            {people.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary-text">{initials(p.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {p.name}
                    {p.owner && <Crown className="size-3.5 shrink-0 text-warning" aria-label="Dono do lar" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 gap-1">
                  {p.kind === 'CALENDAR' ? <CalendarHeart className="size-3" /> : <Wallet className="size-3" />}
                  {p.kind === 'CALENDAR' ? 'Agenda' : 'Agenda e finanças'}
                </Badge>
                {(p.kind === 'CALENDAR' || isOwner) && (
                  <Button variant="ghost" size="icon" aria-label={`Parar de compartilhar com ${p.name}`} onClick={() => setToRemove(p)}>
                    <UserMinus className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {sharedHousehold && (
            <Button variant="outline" className="justify-self-start" onClick={() => setConfirmLeave(true)}>
              <LogOut className="size-4" /> Sair do lar (separar as finanças)
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-3">
        <p className="text-sm font-medium">Convidar alguém</p>
        <SegmentedControl
          ariaLabel="O que compartilhar"
          value={kind}
          onChange={(v) => {
            setKind(v)
            setInvite(null)
          }}
          options={[
            { value: 'CALENDAR', label: KIND_COPY.CALENDAR.label },
            { value: 'HOUSEHOLD', label: KIND_COPY.HOUSEHOLD.label },
          ]}
          className="w-full sm:w-auto [&>button]:flex-1"
        />
        <p className="text-sm text-muted-foreground">{KIND_COPY[kind].explain}</p>
        {invite && invite.kind === kind ? (
          <InviteCodeCard code={invite.code} expiresAt={invite.expiresAt} shareText={shareText} />
        ) : kind === 'HOUSEHOLD' && !isOwner ? (
          <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">Só quem criou o lar pode convidar mais pessoas para as finanças.</p>
        ) : (
          <Button onClick={() => void generate()} disabled={createCalendarInvite.isPending || createHouseholdInvite.isPending} className="justify-self-start">
            {createCalendarInvite.isPending || createHouseholdInvite.isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
            Gerar código de convite
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="share-code" className="text-sm font-medium">
          Recebeu um código?
        </label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void check()
          }}
        >
          <Input
            id="share-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setPending(null)
            }}
            placeholder="XXXX-XXXX"
            className="font-mono tracking-widest uppercase"
            maxLength={9}
            autoComplete="off"
            autoCapitalize="characters"
          />
          <Button type="submit" variant="outline" disabled={lookup.isPending}>
            {lookup.isPending && <Loader2 className="size-4 animate-spin" />}
            Continuar
          </Button>
        </form>
        <AnimatePresence>
          {pending && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className={cn('mt-2 grid gap-3 rounded-xl border p-4', pending.kind === 'HOUSEHOLD' ? 'border-warning/40 bg-warning/5' : 'border-primary/30 bg-primary/5')}>
                <p className="font-medium">
                  {pending.kind === 'CALENDAR'
                    ? `${pending.inviterName} quer compartilhar a agenda com você`
                    : `${pending.inviterName} quer juntar agenda e finanças com você`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pending.kind === 'CALENDAR'
                    ? 'Vocês vão ver os compromissos marcados como "Compartilhado". Suas finanças continuam só suas.'
                    : `Suas contas, lançamentos, metas e compromissos vão para o lar de ${pending.inviterName}, e vocês dois passam a ver e editar tudo. Categorias com o mesmo nome são unidas. Se um dia você sair, leva de volta o que é seu.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void accept()} disabled={accepting}>
                    {accepting && <Loader2 className="size-4 animate-spin" />}
                    {pending.kind === 'CALENDAR' ? 'Conectar agenda' : 'Juntar finanças'}
                  </Button>
                  <Button variant="ghost" onClick={() => setPending(null)}>
                    Agora não
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={toRemove?.kind === 'CALENDAR' ? `Parar de compartilhar a agenda com ${toRemove?.name ?? ''}?` : `Tirar ${toRemove?.name ?? ''} do lar?`}
        description={
          toRemove?.kind === 'CALENDAR'
            ? 'Vocês deixam de ver os compromissos um do outro. Nada é apagado: cada um continua com os compromissos que criou.'
            : 'A pessoa deixa de ver as finanças do lar e leva as contas que trouxe, com os lançamentos delas, além das metas e compromissos que criou.'
        }
        confirmLabel={toRemove?.kind === 'CALENDAR' ? 'Parar de compartilhar' : 'Tirar do lar'}
        onConfirm={doRemove}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Separar as finanças?"
        description="Você leva as contas que trouxe (com todos os lançamentos delas), suas metas e seus compromissos. O que é da outra pessoa fica com ela. Transferências entre vocês viram uma entrada e uma saída, para os saldos continuarem certos."
        confirmLabel="Sair do lar"
        onConfirm={doLeave}
      />
    </div>
  )
}
