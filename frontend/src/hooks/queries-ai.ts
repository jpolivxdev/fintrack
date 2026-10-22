import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api } from '@/lib/api'
import type { TransactionType } from '@/lib/types'

export interface AiStatus {
  servidorDisponivel: boolean
  motivo?: string
  aiEnabled: boolean
  demo: boolean
  provedor: string
  modelo: string
  cotaDiaria: number
  usadasHoje: number
}

export interface CategorySuggestion {
  categoriaId: string | null
  categoriaNome: string | null
  confianca: number
  origem: 'regra' | 'cache' | 'ia' | 'nenhuma'
  iaDisponivel: boolean
}

export interface AskAnswer {
  resposta: string
  ferramentasUsadas: Array<{ nome: string; argumentos: unknown }>
  dadosUtilizados: Array<{ ferramenta: string; resultado: unknown }>
}

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: async () => (await api.get<AiStatus>('/ai/status')).data })
}

export function useSetAiEnabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (aiEnabled: boolean) => (await api.patch<{ aiEnabled: boolean }>('/ai/settings', { aiEnabled })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-status'] }),
  })
}

/** Never throws: a failed suggestion is just "no suggestion". */
export async function suggestCategory(input: { descricao: string; tipo: TransactionType; valor?: number }): Promise<CategorySuggestion | null> {
  try {
    return (await api.post<CategorySuggestion>('/ai/categorize', input)).data
  } catch {
    return null
  }
}

export function useAsk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pergunta: string) => (await api.post<AskAnswer>('/ai/ask', { pergunta })).data,
    // Keeps "N of 30 today" current.
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai-status'] }),
  })
}

/** Why the AI didn't answer, in words the user can act on. */
export function askErrorMessage(error: unknown): string {
  const motivo = error instanceof AxiosError ? (error.response?.data as { motivo?: string } | undefined)?.motivo : undefined
  const status = error instanceof AxiosError ? error.response?.status : undefined
  switch (motivo) {
    case 'not_opted_in':
      return 'Ative a IA em Configurações para fazer perguntas.'
    case 'user_quota':
      return 'Você usou todas as perguntas de hoje. A cota renova amanhã.'
    case 'global_quota':
    case 'daily_quota':
      return 'O FinTrack atingiu o limite diário do plano gratuito de IA. Volte amanhã.'
    case 'global_rate':
    case 'rate_limited':
      return 'Muita gente perguntando agora. Tente de novo em um minuto.'
    case 'disabled':
      return 'A IA está desligada no momento.'
    case 'timeout':
      return 'A IA demorou demais para responder. Tente de novo.'
    case 'blocked':
      return 'A IA não respondeu a essa pergunta. Tente reformular.'
  }
  if (status === 429) return 'Muitas perguntas seguidas. Espere um minuto.'
  if (status === 400) return 'A pergunta precisa ter até 300 caracteres, sem símbolos especiais.'
  return 'A IA não está disponível agora. Tente mais tarde.'
}
