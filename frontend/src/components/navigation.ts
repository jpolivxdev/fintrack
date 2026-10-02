import {
  ArrowLeftRight,
  CalendarDays,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  Settings,
  Tags,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const ACCOUNTS: NavItem = { to: '/contas', label: 'Contas e cartões', icon: Wallet }
const INVESTMENTS: NavItem = { to: '/investimentos', label: 'Investimentos', icon: TrendingUp }
const BUDGETS: NavItem = { to: '/orcamentos', label: 'Orçamentos', icon: PiggyBank }
const GOALS: NavItem = { to: '/metas', label: 'Metas', icon: Target }
const RECURRING: NavItem = { to: '/recorrentes', label: 'Recorrentes', icon: Repeat }
const CATEGORIES: NavItem = { to: '/categorias', label: 'Categorias', icon: Tags }

export const NAV_MONEY: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  ACCOUNTS,
  INVESTMENTS,
  BUDGETS,
  GOALS,
  RECURRING,
  CATEGORIES,
]

export const NAV_LIFE: NavItem[] = [{ to: '/calendario', label: 'Calendário', icon: CalendarDays }]

export const NAV_SETTINGS: NavItem = { to: '/configuracoes', label: 'Configurações', icon: Settings }

/** Items reached from the mobile "Mais" sheet (the rest live in the tab bar). */
export const NAV_MORE: NavItem[] = [ACCOUNTS, INVESTMENTS, BUDGETS, GOALS, RECURRING, CATEGORIES, NAV_SETTINGS]

export function isActive(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}
