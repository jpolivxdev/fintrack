import { Copy, Crown, Download, Loader2, LogOut, MessageCircle, Share2, UserMinus, UserPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SegmentedControl } from '@/components/segmented-control'
import { ImportStatement } from '@/components/settings/import-statement'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  downloadTransactionsCsv,
  useCreateInvite,
  useHousehold,
  useJoinHousehold,
  useLeaveHousehold,
  useRemoveMember,
  useRenameHousehold,
} from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import type { HouseholdMember } from '@/lib/types'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export function SettingsPage() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { data: household, isLoading } = useHousehold()
  const rename = useRenameHousehold()
  const createInvite = useCreateInvite()
  const join = useJoinHousehold()
  const leave = useLeaveHousehold()
  const removeMember = useRemoveMember()

  const [name, setName] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState<'none' | 'join' | 'leave'>('none')
  const [memberToRemove, setMemberToRemove] = useState<HouseholdMember | null>(null)
  const [exportYear, setExportYear] = useState(String(new Date().getFullYear()))

  const isOwner = household?.role === 'OWNER'
  const shared = (household?.members.length ?? 1) > 1
  const shareText = invite
    ? `Vamos organizar nossas finanças e nossa agenda juntos no FinTrack! Crie sua conta em ${window.location.origin} e, em Configurações → Entrar em um lar, use o código ${invite.code} (vale por 48 horas).`
    : ''

  async function saveName() {
    if (!name?.trim()) return
    try {
      await rename.mutateAsync(name.trim())
      setName(null)
      toast.success('Nome do lar atualizado.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function generateInvite() {
    try {
      setInvite(await createInvite.mutateAsync())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function shareInvite() {
    if (!invite) return
    if (navigator.share) {
      await navigator.share({ title: 'Convite para o FinTrack', text: shareText }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(shareText)
      toast.success('Mensagem copiada.')
    }
  }

  async function doJoin() {
    try {
      const joined = await join.mutateAsync(code)
      setCode('')
      toast.success(`Pronto! Agora você faz parte de "${joined.name}".`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setConfirm('none')
    }
  }

  async function doLeave() {
    try {
      await leave.mutateAsync()
      toast.success('Você saiu do lar compartilhado e começou um lar só seu.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setConfirm('none')
    }
  }

  async function doRemove() {
    if (!memberToRemove) return
    try {
      await removeMember.mutateAsync(memberToRemove.userId)
      toast.success(`${memberToRemove.name} não faz mais parte do lar.`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setMemberToRemove(null)
    }
  }

  async function exportCsv() {
    try {
      await downloadTransactionsCsv({ startDate: `${exportYear}-01-01`, endDate: `${exportYear}-12-31` })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-5">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Configurações</h1>

      <Section
        title="Seu lar"
        description={
          shared
            ? 'Todos os membros veem e editam as mesmas finanças e os compromissos compartilhados.'
            : 'Convide quem divide a vida com você para compartilhar finanças e agenda.'
        }
      >
        {isLoading || !household ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="household-name">Nome</Label>
              <div className="flex gap-2">
                <Input
                  id="household-name"
                  value={name ?? household.name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner}
                  maxLength={60}
                />
                {isOwner && name !== null && name !== household.name && (
                  <Button onClick={saveName} disabled={rename.isPending}>
                    Salvar
                  </Button>
                )}
              </div>
            </div>
            <ul className="divide-y rounded-xl border">
              {household.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {m.name}
                      {m.isYou && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
                      {m.role === 'OWNER' && <Crown className="size-3.5 text-warning" aria-label="Dono do lar" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  {isOwner && !m.isYou && (
                    <Button variant="ghost" size="icon" className="size-10" aria-label={`Remover ${m.name}`} onClick={() => setMemberToRemove(m)}>
                      <UserMinus className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {shared && (
              <Button variant="outline" className="h-11 justify-self-start sm:h-9" onClick={() => setConfirm('leave')}>
                <LogOut className="size-4" /> Sair deste lar
              </Button>
            )}
          </>
        )}
      </Section>

      {household && isOwner && (
        <Section title="Convidar alguém" description="Gere um código e envie para quem vai dividir as finanças e a agenda com você. Vale por 48 horas e só pode ser usado uma vez.">
          {!household.invitesEnabled ? (
            <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
              Convites estão desativados na conta demo, que é compartilhada por todos os visitantes. Crie sua própria conta para testar.
            </p>
          ) : invite ? (
            <div className="grid gap-4">
              <div className="rounded-xl border bg-muted/30 p-5 text-center">
                <p className="text-xs text-muted-foreground">Código de convite</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] tabular select-all">{invite.code}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Válido até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(invite.expiresAt))}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 [&>*]:h-11 sm:[&>*]:h-9">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(invite.code).then(() => toast.success('Código copiado.'))}>
                  <Copy className="size-4" /> Copiar código
                </Button>
                <Button variant="outline" onClick={() => void shareInvite()}>
                  <Share2 className="size-4" /> Compartilhar
                </Button>
                <Button variant="outline" asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={generateInvite} disabled={createInvite.isPending} className="h-11 justify-self-start sm:h-9">
              {createInvite.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Gerar código de convite
            </Button>
          )}
        </Section>
      )}

      {household && !shared && household.invitesEnabled && (
        <Section title="Entrar em um lar" description="Recebeu um código? Digite aqui para juntar as finanças e a agenda com quem te convidou.">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.replace(/[\s-]/g, '').length === 8) setConfirm('join')
              else toast.error('O código tem 8 caracteres, como K7QM-4XPA.')
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              aria-label="Código de convite"
              className="h-11 font-mono tracking-widest uppercase sm:h-9"
              maxLength={9}
              autoComplete="off"
              autoCapitalize="characters"
            />
            <Button type="submit" className="h-11 sm:h-9" disabled={join.isPending}>
              {join.isPending && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </Section>
      )}

      <Section title="Importar extrato" description="Traga os lançamentos do banco a partir do arquivo OFX ou CSV.">
        <ImportStatement />
      </Section>

      <Section title="Exportar" description="Baixe suas transações em planilha (CSV), pronta para abrir no Excel ou Google Planilhas.">
        <div className="flex gap-2">
          <Input
            type="number"
            min={2000}
            max={2100}
            value={exportYear}
            onChange={(e) => setExportYear(e.target.value)}
            aria-label="Ano"
            className="h-11 w-28 tabular sm:h-9"
          />
          <Button variant="outline" onClick={exportCsv} className="h-11 sm:h-9">
            <Download className="size-4" /> Baixar CSV de {exportYear}
          </Button>
        </div>
      </Section>

      <Section title="Aparência">
        <SegmentedControl
          ariaLabel="Tema"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'dark', label: 'Escuro' },
            { value: 'light', label: 'Claro' },
          ]}
          className="w-full sm:w-64"
        />
      </Section>

      <Section title="Conta" description={user ? `${user.name} · ${user.email}` : undefined}>
        <Button variant="outline" className="h-11 justify-self-start text-destructive sm:h-9" onClick={() => void logout()}>
          <LogOut className="size-4" /> Sair
        </Button>
      </Section>

      <ConfirmDialog
        open={confirm === 'join'}
        onOpenChange={(open) => !open && setConfirm('none')}
        title="Entrar neste lar?"
        description="Suas transações, contas, metas e compromissos vão para o lar de quem te convidou. Categorias com o mesmo nome são unidas. Depois, vocês dois veem e editam tudo juntos."
        confirmLabel="Entrar e juntar"
        onConfirm={doJoin}
      />
      <ConfirmDialog
        open={confirm === 'leave'}
        onOpenChange={(open) => !open && setConfirm('none')}
        title="Sair do lar compartilhado?"
        description="Os dados compartilhados ficam com o lar. Você começa do zero num lar só seu, com as categorias padrão."
        confirmLabel="Sair do lar"
        onConfirm={doLeave}
      />
      <ConfirmDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        title={`Remover ${memberToRemove?.name ?? ''}?`}
        description="A pessoa deixa de ver os dados do lar e começa num lar só dela. O que foi lançado continua aqui."
        confirmLabel="Remover"
        onConfirm={doRemove}
      />
    </div>
  )
}
