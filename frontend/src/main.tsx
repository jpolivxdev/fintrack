import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { ThemeProvider } from '@/lib/theme'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ConnectionStatus } from '@/components/connection-status'
import { AuthProvider } from '@/lib/auth'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// New versions apply on their own: the page reloads as soon as a new build is
// active, and an open app checks for one when it comes back to the foreground
// and every 30 minutes (installed PWAs can stay open for days).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => void registration.update().catch(() => undefined)
    setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors won't fix themselves; only retry network/server hiccups.
      retry: (count, error) =>
        count < 2 && !(error instanceof AxiosError && error.response && error.response.status < 500),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <App />
          </TooltipProvider>
        </AuthProvider>
        <ConnectionStatus />
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
