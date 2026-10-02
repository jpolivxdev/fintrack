import { ArrowDownLeft, ArrowUpRight, CalendarPlus, ArrowLeftRight as TransferIcon, LogOut, Menu, Moon, Plus, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useDialogs } from '@/components/dialogs/dialogs-context'
import { AGENDA, HOME, isActive, NAV_MORE, NAV_MORE_GROUPS, NAV_SETTINGS, TRANSACTIONS } from '@/components/navigation'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const TABS = [HOME, TRANSACTIONS, AGENDA]

/** Highlight behind the active tab; slides between tabs instead of blinking. */
function TabPill() {
  return (
    <motion.span
      layoutId="tab-pill"
      aria-hidden
      className="absolute inset-x-2 top-1 -z-10 h-[calc(100%-0.5rem)] rounded-2xl bg-primary/12"
      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
    />
  )
}

/**
 * Phone navigation: the four most used places plus a central "+" within
 * thumb reach, above the iPhone home indicator (safe-area inset).
 */
export function MobileNav() {
  const { pathname } = useLocation()
  const dialogs = useDialogs()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [sheet, setSheet] = useState<'none' | 'add' | 'more'>('none')
  const moreActive = NAV_MORE.some((item) => isActive(pathname, item.to))

  const tab = (to: string, label: string, Icon: typeof Plus) => (
    <Link
      key={to}
      to={to}
      className={cn(
        'relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
        isActive(pathname, to) ? 'text-primary-text' : 'text-muted-foreground',
      )}
      aria-current={isActive(pathname, to) ? 'page' : undefined}
    >
      {isActive(pathname, to) && <TabPill />}
      <Icon className="size-5" />
      {label}
    </Link>
  )

  const run = (action: () => void) => {
    setSheet('none')
    // Let the sheet close before the next one opens.
    setTimeout(action, 180)
  }

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch px-2">
          {tab(TABS[0].to, TABS[0].label, TABS[0].icon)}
          {tab(TABS[1].to, TABS[1].label, TABS[1].icon)}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setSheet('add')}
              aria-label="Adicionar"
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_20px_-6px_color-mix(in_oklch,var(--primary)_70%,transparent)] transition-transform active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          {tab(TABS[2].to, TABS[2].label, TABS[2].icon)}
          <button
            type="button"
            onClick={() => setSheet('more')}
            className={cn('relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors', moreActive ? 'text-primary-text' : 'text-muted-foreground')}
          >
            {moreActive && <TabPill />}
            <Menu className="size-5" />
            Mais
          </button>
        </div>
      </nav>

      <Drawer open={sheet === 'add'} onOpenChange={(o) => !o && setSheet('none')}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Adicionar</DrawerTitle>
            <DrawerDescription className="sr-only">Escolha o que registrar</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {[
              { label: 'Despesa', icon: ArrowDownLeft, tint: 'text-expense', action: () => dialogs.newTransaction('EXPENSE') },
              { label: 'Receita', icon: ArrowUpRight, tint: 'text-income', action: () => dialogs.newTransaction('INCOME') },
              { label: 'Transferência', icon: TransferIcon, tint: 'text-chart-2', action: () => dialogs.newTransfer() },
              { label: 'Compromisso', icon: CalendarPlus, tint: 'text-primary-text', action: () => dialogs.newEvent() },
            ].map((item, i) => (
              <motion.button
                key={item.label}
                type="button"
                onClick={() => run(item.action)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.97 }}
                className="flex h-24 flex-col items-start justify-between rounded-2xl border bg-card p-4 text-left font-medium active:bg-muted"
              >
                <item.icon className={cn('size-6', item.tint)} />
                {item.label}
              </motion.button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={sheet === 'more'} onOpenChange={(o) => !o && setSheet('none')}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{user?.name ?? 'FinTrack'}</DrawerTitle>
            <DrawerDescription>{user?.email}</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {NAV_MORE_GROUPS.map((group) => (
              <div key={group.label} className="grid gap-1">
                <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{group.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSheet('none')}
                      className={cn(
                        'flex min-h-12 items-center gap-3 rounded-xl px-3 text-base',
                        isActive(pathname, item.to) ? 'bg-accent text-accent-foreground' : 'active:bg-muted',
                      )}
                    >
                      <item.icon className="size-5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="my-1 h-px bg-border" />
            <Link
              to={NAV_SETTINGS.to}
              onClick={() => setSheet('none')}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-xl px-3 text-base',
                isActive(pathname, NAV_SETTINGS.to) ? 'bg-accent text-accent-foreground' : 'active:bg-muted',
              )}
            >
              <NAV_SETTINGS.icon className="size-5 text-muted-foreground" />
              {NAV_SETTINGS.label}
            </Link>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-base active:bg-muted"
            >
              {theme === 'dark' ? <Sun className="size-5 text-muted-foreground" /> : <Moon className="size-5 text-muted-foreground" />}
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-base text-destructive active:bg-muted"
            >
              <LogOut className="size-5" />
              Sair
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
