import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'
import type { AuthResponse } from './types'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

const REFRESH_KEY = 'fintrack.refreshToken'
type Listener = (auth: AuthResponse | null) => void

/**
 * Session storage strategy:
 * - access token (15 min) lives only in memory, so it is gone on reload;
 * - refresh token (7 days, rotated on every use) lives in localStorage so the
 *   session survives a reload. The API returns it in the body because API and
 *   app are on different sites (see SECURITY.md); React escaping + the API's
 *   validation keep XSS, the main risk of this choice, in check.
 */
let accessToken: string | null = null
const listeners = new Set<Listener>()

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export const session = {
  get refreshToken() {
    return readRefresh()
  },
  set(auth: AuthResponse) {
    accessToken = auth.accessToken
    try {
      localStorage.setItem(REFRESH_KEY, auth.refreshToken)
    } catch {
      /* private mode: session lasts until reload */
    }
    listeners.forEach((l) => l(auth))
  },
  clear() {
    accessToken = null
    try {
      localStorage.removeItem(REFRESH_KEY)
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(null))
  },
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export const api = axios.create({ baseURL: API_URL, timeout: 75_000 })

// --- Free-tier cold start: tell the user why the first request is slow ----
const WAKE_TOAST_ID = 'api-waking-up'
let pending = 0
let wakeTimer: ReturnType<typeof setTimeout> | undefined

function requestStarted() {
  pending += 1
  if (pending === 1) {
    wakeTimer = setTimeout(() => {
      toast.loading('Acordando o servidor…', {
        id: WAKE_TOAST_ID,
        description: 'A API roda num plano gratuito e dorme quando ociosa. Pode levar até 1 minuto.',
        duration: Infinity,
      })
    }, 4000)
  }
}

function requestFinished() {
  pending = Math.max(0, pending - 1)
  if (pending === 0) {
    clearTimeout(wakeTimer)
    toast.dismiss(WAKE_TOAST_ID)
  }
}

api.interceptors.request.use((config) => {
  requestStarted()
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// --- Refresh: single flight. Concurrent 401s share one refresh call, because
// the API revokes every session if the same refresh token is used twice. ----
let refreshing: Promise<AuthResponse> | null = null

export function refreshSession(): Promise<AuthResponse> {
  const token = readRefresh()
  if (!token) return Promise.reject(new Error('no-session'))
  refreshing ??= axios
    .post<AuthResponse>(`${API_URL}/auth/refresh`, { refreshToken: token })
    .then((res) => {
      session.set(res.data)
      return res.data
    })
    .catch((error: unknown) => {
      session.clear()
      throw error
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (response) => {
    requestFinished()
    return response
  },
  async (error: AxiosError) => {
    requestFinished()
    const original = error.config as RetriableConfig | undefined
    const isAuthCall = original?.url?.startsWith('/auth/') && !original.url.startsWith('/auth/me')
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true
      try {
        await refreshSession()
        return api(original)
      } catch {
        /* falls through: the session is over */
      }
    }
    throw error
  },
)

// --- Errors in the user's language ------------------------------------------
const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/invalid email or password/i, 'E-mail ou senha incorretos.'],
  [/email is already registered/i, 'Este e-mail já está cadastrado.'],
  [/does not match category type/i, 'O tipo da transação precisa ser o mesmo da categoria.'],
  [/category has (\d+) transaction/i, 'Esta categoria tem transações. Mova ou exclua-as antes de excluir a categoria.'],
  [/already exists/i, 'Já existe um registro com esses dados.'],
  [/already has a budget/i, 'Esta categoria já tem orçamento neste mês.'],
  [/only be set for expense/i, 'Orçamentos só podem ser definidos para categorias de despesa.'],
  [/cannot change the type/i, 'Não é possível mudar o tipo de uma categoria que já tem transações ou orçamentos.'],
  [/account has history/i, 'Esta conta tem histórico: arquive em vez de excluir.'],
  [/keep at least one active account/i, 'Mantenha pelo menos uma conta ativa.'],
  [/account is archived/i, 'Esta conta está arquivada.'],
  [/two different accounts/i, 'Escolha duas contas diferentes.'],
  [/create an account first/i, 'Crie uma conta primeiro.'],
  [/only expenses can be split/i, 'Só despesas podem ser parceladas.'],
  [/invalid or expired invite code/i, 'Código de convite inválido ou expirado.'],
  [/already a member/i, 'Você já faz parte deste lar.'],
  [/leave your current shared household/i, 'Saia do lar compartilhado atual antes de entrar em outro.'],
  [/only member of this household/i, 'Você é o único membro deste lar.'],
  [/only the household owner/i, 'Só quem criou o lar pode fazer isso.'],
  [/invites are disabled on the public demo/i, 'Convites estão desativados na conta demo.'],
  [/demo account cannot change households/i, 'A conta demo não pode mudar de lar.'],
  [/you can withdraw at most/i, 'Não dá para retirar mais do que o guardado na meta.'],
  [/would leave the goal negative/i, 'Remova primeiro a retirada que depende deste aporte.'],
  [/used by recurring rules/i, 'Esta categoria é usada por recorrências. Altere ou exclua-as antes.'],
  [/only the creator can make an event private/i, 'Só quem criou o compromisso pode torná-lo privado.'],
  [/enddate must be on or after/i, 'A data final precisa ser depois da inicial.'],
  [/default (expense|income) category/i, 'Categoria padrão inválida para esse tipo.'],
  [/not found/i, 'Registro não encontrado.'],
]

export function errorMessage(error: unknown): string {
  if (!(error instanceof AxiosError)) return 'Algo deu errado. Tente novamente.'
  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? 'O servidor demorou demais para responder. Tente novamente.'
      : 'Não foi possível conectar à API. Verifique sua conexão.'
  }
  const { status, data } = error.response as { status: number; data?: { message?: string | string[] } }
  if (status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  const raw = Array.isArray(data?.message) ? data.message[0] : data?.message
  if (raw) {
    const known = KNOWN_MESSAGES.find(([pattern]) => pattern.test(raw))
    if (known) return known[1]
  }
  if (status === 400) return 'Verifique os dados informados.'
  if (status >= 500) return 'Erro no servidor. Tente novamente em instantes.'
  return 'Algo deu errado. Tente novamente.'
}
