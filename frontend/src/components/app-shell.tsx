import { ArrowLeftRight, LayoutDashboard, LogOut, PiggyBank, Plus, Tags } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Logo } from '@/components/logo'
import { MonthSwitcher } from '@/components/month-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTransactionDialog } from '@/components/transactions/transaction-dialog-context'
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { to: '/orcamentos', label: 'Orçamentos', icon: PiggyBank },
  { to: '/categorias', label: 'Categorias', icon: Tags },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function AppShell() {
  const { user, logout } = useAuth()
  const { openNew } = useTransactionDialog()
  const location = useLocation()

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <Logo className="group-data-[collapsible=icon]:[&>span]:hidden" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)}
                    >
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
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                    {user ? initials(user.name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user?.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
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

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-4">
          <SidebarTrigger aria-label="Alternar menu" />
          <div className="mx-auto sm:mx-0">
            <MonthSwitcher />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button onClick={() => openNew()} className="hidden sm:inline-flex">
              <Plus className="size-4" />
              Nova transação
              <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 text-[10px] font-medium opacity-80">
                N
              </kbd>
            </Button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>

        {/* Mobile: the most frequent action stays one thumb away. */}
        <Button
          size="icon-lg"
          onClick={() => openNew()}
          className="fixed right-4 bottom-4 z-20 size-14 rounded-full shadow-[0_8px_24px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent)] sm:hidden"
          aria-label="Nova transação"
        >
          <Plus className="size-6" />
        </Button>
      </SidebarInset>
    </SidebarProvider>
  )
}
