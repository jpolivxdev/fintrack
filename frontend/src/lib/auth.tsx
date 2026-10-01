import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshSession, session } from './api'
import type { AuthResponse, User } from './types'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const DEMO_CREDENTIALS = { email: 'demo@fintrack.dev', password: 'Demo@1234' }

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<Status>(() => (session.refreshToken ? 'loading' : 'anonymous'))

  // Restore the session on load (the access token only lived in memory).
  useEffect(() => {
    if (!session.refreshToken) return
    refreshSession()
      .then((auth) => {
        setUser(auth.user)
        setStatus('authenticated')
      })
      .catch(() => setStatus('anonymous'))
  }, [])

  // Any part of the app can end the session (e.g. a failed refresh).
  useEffect(
    () =>
      session.subscribe((auth) => {
        if (auth) {
          setUser(auth.user)
          setStatus('authenticated')
        } else {
          setUser(null)
          setStatus('anonymous')
          queryClient.clear()
        }
      }),
    [queryClient],
  )

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password })
    session.set(data)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/register', { name, email, password })
    session.set(data)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = session.refreshToken
    session.clear()
    if (refreshToken) {
      // Revoke server-side too; the local session is already gone either way.
      await api.post('/auth/logout', { refreshToken }).catch(() => undefined)
    }
  }, [])

  const value = useMemo(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
