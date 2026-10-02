import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FormActions, ResponsiveDialog } from '@/components/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useMoveRuleToInvestment, usePortfolio } from '@/hooks/queries-more'
import { errorMessage } from '@/lib/api'
import type { RecurringRule } from '@/lib/types'

/**
 * "Isso é um investimento": an expense rule (e.g. "Aplicação C6") becomes a
 * scheduled contribution, so the money counts as invested instead of spent.
 */
export function MoveRuleDialog({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const { data } = usePortfolio()
  const move = useMoveRuleToInvestment()
  const investments = (data?.items ?? []).filter((i) => !i.archived)
  const [investmentId, setInvestmentId] = useState('')
  const [convertPast, setConvertPast] = useState(true)
  const selected = investmentId || investments[0]?.id || ''

  async function submit() {
    if (!rule || !selected) return
    try {
      await move.mutateAsync({ ruleId: rule.id, investmentId: selected, convertPast })
      toast.success('Pronto! Agora esse valor aparece em Investimentos.')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <ResponsiveDialog
      open={!!rule}
      onOpenChange={(o) => !o && onClose()}
      title="Mover para investimentos"
      description={rule ? `"${rule.description}" deixa de ser despesa e vira aporte programado, com as mesmas datas e valor.` : undefined}
    >
      {investments.length === 0 ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">Primeiro cadastre o investimento que recebe esse dinheiro (ex.: "C6 CDB 100% do CDI").</p>
          <Button asChild className="justify-self-start">
            <Link to="/investimentos">Ir para Investimentos</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="move-target">Para qual investimento?</Label>
            <Select value={selected} onValueChange={setInvestmentId}>
              <SelectTrigger id="move-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {investments.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-3 rounded-xl border p-3">
            <Switch checked={convertPast} onCheckedChange={setConvertPast} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">Converter os lançamentos que já foram feitos</span>
              <span className="block text-xs text-muted-foreground">
                Os meses anteriores também deixam de contar como gasto e passam a somar no investimento.
              </span>
            </span>
          </label>
          <FormActions>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={move.isPending}>
              {move.isPending && <Loader2 className="size-4 animate-spin" />}
              Mover
            </Button>
          </FormActions>
        </div>
      )}
    </ResponsiveDialog>
  )
}
