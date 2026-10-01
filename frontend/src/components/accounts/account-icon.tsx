import { Banknote, CreditCard, Landmark, LineChart, PiggyBank, type LucideIcon } from 'lucide-react'
import type { AccountType } from '@/lib/types'
import { cn } from '@/lib/utils'

export const ACCOUNT_TYPES: Record<AccountType, { label: string; icon: LucideIcon }> = {
  CHECKING: { label: 'Conta corrente', icon: Landmark },
  CREDIT_CARD: { label: 'Cartão de crédito', icon: CreditCard },
  SAVINGS: { label: 'Poupança / reserva', icon: PiggyBank },
  CASH: { label: 'Dinheiro', icon: Banknote },
  INVESTMENT: { label: 'Investimentos', icon: LineChart },
}

export function AccountIcon({ type, color, className }: { type: AccountType; color: string | null; className?: string }) {
  const Icon = ACCOUNT_TYPES[type].icon
  const tint = color ?? '#8b5cf6'
  return (
    <span
      className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', className)}
      style={{ backgroundColor: `color-mix(in oklch, ${tint} 18%, transparent)`, color: tint }}
      aria-hidden
    >
      <Icon />
    </span>
  )
}
