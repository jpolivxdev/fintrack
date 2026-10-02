import { ArrowLeftRight, CalendarPlus, ChevronDown, LogOut, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useDialogs } from '@/components/dialogs/dialogs-context'
import { Logo } from '@/components/logo'
import { MobileNav } from '@/components/mobile-nav'
import { MonthSwitcher } from '@/components/month-switcher'
import { isActive, NAV_GROUPS, NAV_SETTINGS, type NavItem } from '@/components/navigation'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useHousehold } from '@/hooks/queries-more'
import { useAuth } from '@/lib/auth'

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/** Pages that are not tied to the selected month hide the month switcher. */
const MONTHLESS = ['/contas', '/metas', '/recorrentes', '/categorias', '/configuracoes']

export function AppShell() {
  const { user, logout } = useAuth()
  const dialogs = useDialogs()
  const location = useLocation()
  const { data: household } = useHousehold()
  const showMonth = !MONTHLESS.some((p) => location.pathname.startsWith(p))

  const navGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(location.pathname, item.to)}>
                <NavLink to={item.to} end={item.to === '/'}>
                  <item.icon />
                  <span>{item.label}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <Logo className="group-data-[collapsible=icon]:[&>span]:hidden" />
        </SidebarHeader>
        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>{navGroup(group.label, group.items)}</div>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={NAV_SETTINGS.label} isActive={isActive(location.pathname, NAV_SETTINGS.to)}>
                <NavLink to={NAV_SETTINGS.to}>
                  <NAV_SETTINGS.icon />
                  <span>{NAV_SETTINGS.label}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary-text">
                    {user ? initials(user.name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user?.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{household?.name ?? user?.email}</span>
                </span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void logout()}>
                <LogOut className="size-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b bg-background/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-4">
          <SidebarTrigger aria-label="Alternar menu" className="hidden md:inline-flex" />
          <Logo className="md:hidden" showName={!showMonth} />
          <div className="mx-auto md:mx-0">{showMonth && <MonthSwitcher />}</div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="hidden md:flex">
              <Button onClick={() => dialogs.newTransaction()} className="rounded-r-none">
                <Plus className="size-4" />
                Nova transação
                <kbd className="ml-1 rounded bg-primary-foreground/20 px-1.5 text-[11px] font-semibold">N</kbd>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="Mais opções de registro">
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => dialogs.newTransaction('INCOME')}>
                    <Plus className="size-4" /> Receita
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialogs.newTransfer()}>
                    <ArrowLeftRight className="size-4" /> Transferência
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialogs.newEvent()}>
                    <CalendarPlus className="size-4" /> Compromisso
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-8 lg:px-8"
          >
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="min-w-0">
              <Outlet />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </SidebarInset>

      <MobileNav />
    </SidebarProvider>
  )
}
