import {
  ArrowLeftRight,
  CalendarDays,
  Home,
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

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** One name per destination, used by the sidebar, the tab bar and page titles. */
export const HOME: NavItem = { to: '/', label: 'Início', icon: Home }
export const TRANSACTIONS: NavItem = { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight }
export const AGENDA: NavItem = { to: '/agenda', label: 'Agenda', icon: CalendarDays }
const BUDGETS: NavItem = { to: '/orcamentos', label: 'Orçamentos', icon: PiggyBank }
const GOALS: NavItem = { to: '/metas', label: 'Metas', icon: Target }
const RECURRING: NavItem = { to: '/recorrentes', label: 'Recorrentes', icon: Repeat }
const CATEGORIES: NavItem = { to: '/categorias', label: 'Categorias', icon: Tags }
const ACCOUNTS: NavItem = { to: '/contas', label: 'Contas e cartões', icon: Wallet }
const INVESTMENTS: NavItem = { to: '/investimentos', label: 'Investimentos', icon: TrendingUp }

const PLANNING: NavGroup = { label: 'Planejamento', items: [BUDGETS, GOALS, RECURRING, CATEGORIES] }
const WEALTH: NavGroup = { label: 'Patrimônio', items: [ACCOUNTS, INVESTMENTS] }

/** Sidebar: three small groups instead of one long list. */
export const NAV_GROUPS: NavGroup[] = [{ label: 'Dia a dia', items: [HOME, TRANSACTIONS, AGENDA] }, PLANNING, WEALTH]

export const NAV_SETTINGS: NavItem = { to: '/configuracoes', label: 'Configurações', icon: Settings }

/** Mobile "Mais" sheet: what the tab bar doesn't show, in the same groups. */
export const NAV_MORE_GROUPS: NavGroup[] = [PLANNING, WEALTH]
export const NAV_MORE: NavItem[] = [...PLANNING.items, ...WEALTH.items, NAV_SETTINGS]

export function isActive(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}
