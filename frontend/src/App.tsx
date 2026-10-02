import { Loader2 } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { Logo } from '@/components/logo'
import { DialogsProvider } from '@/components/dialogs/dialogs-provider'
import { useAuth } from '@/lib/auth'
import { MonthProvider } from '@/lib/month'
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })))
const BudgetsPage = lazy(() => import('@/pages/budgets').then((m) => ({ default: m.BudgetsPage })))
const CategoriesPage = lazy(() => import('@/pages/categories').then((m) => ({ default: m.CategoriesPage })))
const LoginPage = lazy(() => import('@/pages/login').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/register').then((m) => ({ default: m.RegisterPage })))
const AccountsPage = lazy(() => import('@/pages/accounts').then((m) => ({ default: m.AccountsPage })))
const CalendarPage = lazy(() => import('@/pages/calendar').then((m) => ({ default: m.CalendarPage })))
const GoalsPage = lazy(() => import('@/pages/goals').then((m) => ({ default: m.GoalsPage })))
const InvestmentsPage = lazy(() => import('@/pages/investments').then((m) => ({ default: m.InvestmentsPage })))
const RecurringPage = lazy(() => import('@/pages/recurring').then((m) => ({ default: m.RecurringPage })))
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })))
const TransactionsPage = lazy(() => import('@/pages/transactions').then((m) => ({ default: m.TransactionsPage })))

function FullScreenLoader() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 text-muted-foreground">
      <Logo />
      <Loader2 className="size-5 animate-spin" aria-label="Carregando" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return children
}


export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/cadastro" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route
          element={
            <RequireAuth>
              <MonthProvider>
                <DialogsProvider>
                  <AppShell />
                </DialogsProvider>
              </MonthProvider>
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="transacoes" element={<TransactionsPage />} />
          <Route path="orcamentos" element={<BudgetsPage />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="contas" element={<AccountsPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="investimentos" element={<InvestmentsPage />} />
          <Route path="recorrentes" element={<RecurringPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
