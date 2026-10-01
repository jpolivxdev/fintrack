import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  Account,
  AccountType,
  CalendarEvent,
  CalendarFeed,
  EventVisibility,
  Goal,
  GoalDetail,
  Household,
  ImportResult,
  ImportRow,
  Insight,
  Paginated,
  RecurrenceFrequency,
  RecurringRule,
  TransactionType,
  Transfer,
  UpcomingOccurrence,
} from '@/lib/types'
import { useInvalidateMoney } from './queries'

// ---------------- Accounts & transfers ----------------
export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ['accounts', { includeArchived }],
    queryFn: async () =>
      (await api.get<{ data: Account[]; totalBalance: string }>('/accounts', { params: { includeArchived } })).data,
  })
}

export interface AccountInput {
  name: string
  type: AccountType
  color?: string
  icon?: string
  initialBalance?: number
  archived?: boolean
}

export function useSaveAccount() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<AccountInput> }) =>
      id ? (await api.patch<Account>(`/accounts/${id}`, input)).data : (await api.post<Account>('/accounts', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteAccount() {
  const invalidate = useInvalidateMoney()
  return useMutation({ mutationFn: (id: string) => api.delete(`/accounts/${id}`), onSuccess: invalidate })
}

export function useTransfers(params: { page: number; accountId?: string; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['transfers', params],
    queryFn: async () =>
      (await api.get<Paginated<Transfer>>('/transfers', { params: { limit: 20, ...params } })).data,
  })
}

export function useSaveTransfer() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (input: { fromAccountId: string; toAccountId: string; amount: number; date: string; description?: string }) =>
      (await api.post<Transfer>('/transfers', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteTransfer() {
  const invalidate = useInvalidateMoney()
  return useMutation({ mutationFn: (id: string) => api.delete(`/transfers/${id}`), onSuccess: invalidate })
}

// ---------------- Household ----------------
export function useHousehold() {
  return useQuery({ queryKey: ['household'], queryFn: async () => (await api.get<Household>('/household')).data })
}

/** Joining/leaving changes which data the user sees: refetch everything. */
function useResetAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useRenameHousehold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => (await api.patch<Household>('/household', { name })).data,
    onSuccess: (data) => qc.setQueryData(['household'], data),
  })
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: async () => (await api.post<{ code: string; expiresAt: string }>('/household/invites')).data,
  })
}

export function useJoinHousehold() {
  const reset = useResetAll()
  return useMutation({
    mutationFn: async (code: string) => (await api.post<Household>('/household/join', { code })).data,
    onSuccess: reset,
  })
}

export function useLeaveHousehold() {
  const reset = useResetAll()
  return useMutation({ mutationFn: async () => (await api.post<Household>('/household/leave')).data, onSuccess: reset })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => (await api.delete<Household>(`/household/members/${userId}`)).data,
    onSuccess: (data) => qc.setQueryData(['household'], data),
  })
}

// ---------------- Recurring ----------------
export function useRecurring() {
  return useQuery({ queryKey: ['recurring'], queryFn: async () => (await api.get<RecurringRule[]>('/recurring')).data })
}

export function useUpcoming(days = 7) {
  return useQuery({
    queryKey: ['recurring', 'upcoming', days],
    queryFn: async () => (await api.get<UpcomingOccurrence[]>('/recurring/upcoming', { params: { days } })).data,
  })
}

export interface RecurringInput {
  description: string
  amount: number
  type: TransactionType
  frequency: RecurrenceFrequency
  categoryId: string
  accountId?: string
  startDate: string
  endDate?: string
  notes?: string
  active?: boolean
}

export function useSaveRecurring() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<RecurringInput> }) =>
      id
        ? (await api.patch<RecurringRule>(`/recurring/${id}`, input)).data
        : (await api.post<RecurringRule>('/recurring', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteRecurring() {
  const invalidate = useInvalidateMoney()
  return useMutation({ mutationFn: (id: string) => api.delete(`/recurring/${id}`), onSuccess: invalidate })
}

// ---------------- Goals ----------------
export function useGoals() {
  return useQuery({ queryKey: ['goals'], queryFn: async () => (await api.get<Goal[]>('/goals')).data })
}

export function useGoal(id: string | null) {
  return useQuery({
    queryKey: ['goals', id],
    queryFn: async () => (await api.get<GoalDetail>(`/goals/${id}`)).data,
    enabled: !!id,
  })
}

export interface GoalInput {
  name: string
  targetAmount: number
  targetDate?: string
  color?: string
  icon?: string
  archived?: boolean
}

export function useSaveGoal() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<GoalInput> }) =>
      id ? (await api.patch<GoalDetail>(`/goals/${id}`, input)).data : (await api.post<GoalDetail>('/goals', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteGoal() {
  const invalidate = useInvalidateMoney()
  return useMutation({ mutationFn: (id: string) => api.delete(`/goals/${id}`), onSuccess: invalidate })
}

export function useContribute() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ goalId, ...input }: { goalId: string; amount: number; date: string; note?: string }) =>
      (await api.post<GoalDetail>(`/goals/${goalId}/contributions`, input)).data,
    onSuccess: invalidate,
  })
}

export function useRemoveContribution() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ goalId, contributionId }: { goalId: string; contributionId: string }) =>
      (await api.delete<GoalDetail>(`/goals/${goalId}/contributions/${contributionId}`)).data,
    onSuccess: invalidate,
  })
}

// ---------------- Calendar ----------------
export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: async () => (await api.get<CalendarFeed>('/calendar', { params: { from, to } })).data,
  })
}

export interface EventInput {
  title: string
  startAt: string
  endAt: string
  allDay?: boolean
  visibility?: EventVisibility
  location?: string
  description?: string
  color?: string
  estimatedCost?: number
}

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<EventInput> }) =>
      id ? (await api.patch<CalendarEvent>(`/events/${id}`, input)).data : (await api.post<CalendarEvent>('/events', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  })
}

// ---------------- Insights ----------------
export function useInsights(year: number, month: number) {
  return useQuery({
    queryKey: ['insights', year, month],
    queryFn: async () => (await api.get<{ insights: Insight[] }>('/insights', { params: { year, month } })).data.insights,
  })
}

// ---------------- Import / export ----------------
export function useImportTransactions() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (input: {
      accountId: string
      rows: ImportRow[]
      defaultExpenseCategoryId?: string
      defaultIncomeCategoryId?: string
    }) => (await api.post<ImportResult>('/transactions/import', input)).data,
    onSuccess: invalidate,
  })
}

/** Downloads the CSV through the authenticated client and saves it. */
export async function downloadTransactionsCsv(params: { startDate?: string; endDate?: string }): Promise<void> {
  const res = await api.get<Blob>('/transactions/export', { params, responseType: 'blob' })
  const disposition = String(res.headers['content-disposition'] ?? '')
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'fintrack-transacoes.csv'
  const url = URL.createObjectURL(res.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
