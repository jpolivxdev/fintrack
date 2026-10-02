import { lazy, Suspense, type ReactNode, useSyncExternalStore } from 'react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'

const AuthScene = lazy(() => import('./auth-scene'))

const WIDE = '(min-width: 1024px)'
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(WIDE)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}
/** The scene panel is hidden below lg: don't download or render it there. */
function useWide() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false)
}

/** Split layout: the form on one side, the product's world on the other. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const wide = useWide()
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-xs text-muted-foreground">
          Projeto de portfólio ·{' '}
          <a
            className="underline hover:text-foreground"
            href="https://github.com/jpolivxdev/fintrack"
            target="_blank"
            rel="noreferrer"
          >
            código no GitHub
          </a>
        </p>
      </div>

      <aside className="relative hidden overflow-hidden border-l bg-[oklch(0.115_0.03_276)] lg:block">
        <div className="absolute inset-0">
          {wide && (
            <Suspense fallback={null}>
              <AuthScene />
            </Suspense>
          )}
        </div>
        <div className="pointer-events-none relative flex h-full flex-col justify-end p-12 text-[oklch(0.95_0.015_285)]">
          <h2 className="max-w-md text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-balance">
            Seu mês, claro em segundos.
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[oklch(0.78_0.04_282)]">
            Registre receitas e despesas, acompanhe seus orçamentos e veja para onde vai cada real.
          </p>
        </div>
      </aside>
    </div>
  )
}
