import { Download, LogOut } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/segmented-control'
import { FullBackup } from '@/components/settings/full-backup'
import { ImportStatement } from '@/components/settings/import-statement'
import { ImportVida } from '@/components/settings/import-vida'
import { ShareWithSomeone } from '@/components/settings/share-with-someone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { downloadTransactionsCsv } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

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

export function SettingsPage() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [exportYear, setExportYear] = useState(() => String(new Date().getFullYear()))

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
        title="Compartilhar com alguém"
        description="Divida só a agenda (cada um com suas finanças) ou a agenda e as finanças, com quem você quiser."
      >
        <ShareWithSomeone />
      </Section>

      <Section
        title="Backup completo"
        description="Leve seu FinTrack inteiro para outro lugar (por exemplo, do computador para o site) ou guarde uma cópia de segurança."
      >
        <FullBackup />
      </Section>

      <Section
        title="Importar do Vida App"
        description='No Vida App, toque em "Exportar meus dados" no início e escolha o arquivo aqui. Gastos, tarefas pendentes e a meta vêm juntos.'
      >
        <ImportVida />
      </Section>

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
            className="w-28 tabular"
          />
          <Button variant="outline" onClick={exportCsv}>
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
        <Button variant="outline" className="justify-self-start text-destructive" onClick={() => void logout()}>
          <LogOut className="size-4" /> Sair
        </Button>
      </Section>
    </div>
  )
}
