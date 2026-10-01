import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  Budget,
  BudgetVsActual,
  Category,
  CategoryReport,
  MonthlyPoint,
  Paginated,
  SummaryReport,
  Transaction,
  TransactionList,
  TransactionType,
} from '@/lib/types'

// ---------------- Query keys ----------------
export const keys = {
  categories: ['categories'] as const,
  transactions: (filters: TransactionFilters) => ['transactions', filters] as const,
  budgets: (year: number, month: number) => ['budgets', year, month] as const,
  summary: (year: number, month: number) => ['reports', 'summary', year, month] as const,
  monthly: (year: number, month: number, months: number) => ['reports', 'monthly', year, month, months] as const,
  byCategory: (start: string, end: string, type: TransactionType) => ['reports', 'by-category', start, end, type] as const,
  budgetVsActual: (year: number, month: number) => ['reports', 'budget-vs-actual', year, month] as const,
}

// ---------------- Categories ----------------
export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () => (await api.get<Paginated<Category>>('/categories', { params: { limit: 100 } })).data.data,
    staleTime: 60_000,
  })
}

export interface CategoryInput {
  name: string
  /** Omitted on edit when the category already has transactions. */
  type?: TransactionType
  color?: string
  icon?: string
}

// ---------------- Transactions ----------------
export interface TransactionFilters {
  page: number
  limit: number
  type?: TransactionType
  categoryId?: string
  startDate?: string
  endDate?: string
  search?: string
  sortBy?: 'date' | 'amount' | 'description' | 'createdAt'
  order?: 'asc' | 'desc'
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: keys.transactions(filters),
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''))
      return (await api.get<TransactionList>('/transactions', { params })).data
    },
    placeholderData: keepPreviousData,
  })
}

export interface TransactionInput {
  description: string
  amount: number
  type: TransactionType
  date: string
  categoryId: string
  notes?: string
}

/** Anything that changes money invalidates every view derived from it. */
function useInvalidateMoney() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['reports'] }),
      qc.invalidateQueries({ queryKey: ['budgets'] }),
      qc.invalidateQueries({ queryKey: keys.categories }),
    ])
}

export function useSaveTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TransactionInput }) =>
      id
        ? (await api.patch<Transaction>(`/transactions/${id}`, input)).data
        : (await api.post<Transaction>('/transactions', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: invalidate,
  })
}

// ---------------- Categories (mutations) ----------------
export function useSaveCategory() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CategoryInput }) =>
      id
        ? (await api.patch<Category>(`/categories/${id}`, input)).data
        : (await api.post<Category>('/categories', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: invalidate,
  })
}

// ---------------- Budgets ----------------
export function useBudgets(year: number, month: number) {
  return useQuery({
    queryKey: keys.budgets(year, month),
    queryFn: async () =>
      (await api.get<Paginated<Budget>>('/budgets', { params: { year, month, limit: 100 } })).data.data,
  })
}

export function useSaveBudget() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (
      args: { id: string; monthlyLimit: number } | { categoryId: string; year: number; month: number; monthlyLimit: number },
    ) =>
      'id' in args
        ? (await api.patch<Budget>(`/budgets/${args.id}`, { monthlyLimit: args.monthlyLimit })).data
        : (await api.post<Budget>('/budgets', args)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteBudget() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/budgets/${id}`),
    onSuccess: invalidate,
  })
}

export function useCopyBudgets() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (target: { year: number; month: number }) =>
      (await api.post<{ created: number; skipped: number }>('/budgets/copy-previous', target)).data,
    onSuccess: invalidate,
  })
}

// ---------------- Reports ----------------
export function useSummary(year: number, month: number) {
  return useQuery({
    queryKey: keys.summary(year, month),
    queryFn: async () => (await api.get<SummaryReport>('/reports/summary', { params: { year, month } })).data,
    placeholderData: keepPreviousData,
  })
}

export function useMonthly(year: number, month: number, months = 6) {
  return useQuery({
    queryKey: keys.monthly(year, month, months),
    queryFn: async () =>
      (await api.get<{ months: MonthlyPoint[] }>('/reports/monthly', { params: { year, month, months } })).data.months,
    placeholderData: keepPreviousData,
  })
}

export function useByCategory(startDate: string, endDate: string, type: TransactionType = 'EXPENSE') {
  return useQuery({
    queryKey: keys.byCategory(startDate, endDate, type),
    queryFn: async () =>
      (await api.get<CategoryReport>('/reports/by-category', { params: { startDate, endDate, type } })).data,
    placeholderData: keepPreviousData,
  })
}

export function useBudgetVsActual(year: number, month: number) {
  return useQuery({
    queryKey: keys.budgetVsActual(year, month),
    queryFn: async () =>
      (await api.get<BudgetVsActual>('/reports/budget-vs-actual', { params: { year, month } })).data,
    placeholderData: keepPreviousData,
  })
}
