import {
  ArrowLeftRight,
  CalendarDays,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  Settings,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_MONEY: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { to: '/contas', label: 'Contas e cartões', icon: Wallet },
  { to: '/orcamentos', label: 'Orçamentos', icon: PiggyBank },
  { to: '/metas', label: 'Metas', icon: Target },
  { to: '/recorrentes', label: 'Recorrentes', icon: Repeat },
  { to: '/categorias', label: 'Categorias', icon: Tags },
]

export const NAV_LIFE: NavItem[] = [{ to: '/calendario', label: 'Calendário', icon: CalendarDays }]

export const NAV_SETTINGS: NavItem = { to: '/configuracoes', label: 'Configurações', icon: Settings }

/** Items reached from the mobile "Mais" sheet (the rest live in the tab bar). */
export const NAV_MORE: NavItem[] = [
  NAV_MONEY[2],
  NAV_MONEY[3],
  NAV_MONEY[4],
  NAV_MONEY[5],
  NAV_MONEY[6],
  NAV_SETTINGS,
]

export function isActive(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}
