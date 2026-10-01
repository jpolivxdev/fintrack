export type TransactionType = 'INCOME' | 'EXPENSE'

export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

export interface CategorySummary {
  id: string
  name: string
  type: TransactionType
  color: string | null
  icon: string | null
}

export interface Category extends CategorySummary {
  transactionCount: number
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  description: string
  /** Decimal string with 2 places, e.g. "1234.50" */
  amount: string
  type: TransactionType
  /** YYYY-MM-DD */
  date: string
  notes: string | null
  category: CategorySummary
  createdAt: string
  updatedAt: string
}

export interface TransactionList extends Paginated<Transaction> {
  totals: { income: string; expense: string; net: string }
}

export type BudgetStatus = 'ON_TRACK' | 'WARNING' | 'EXCEEDED'

export interface Budget {
  id: string
  year: number
  month: number
  category: CategorySummary
  monthlyLimit: string
  spent: string
  remaining: string
  percentUsed: number
  status: BudgetStatus
}

export interface SummaryReport {
  year: number
  month: number
  income: string
  expense: string
  net: string
  balance: string
  savingsRate: number | null
  transactionCount: number
  previousMonth: { income: string; expense: string; net: string }
  incomeChange: number | null
  expenseChange: number | null
}

export interface MonthlyPoint {
  period: string
  year: number
  month: number
  income: string
  expense: string
  net: string
  balance: string
}

export interface CategoryBreakdownItem {
  categoryId: string
  name: string
  color: string | null
  icon: string | null
  total: string
  count: number
  percentage: number
}

export interface CategoryReport {
  type: TransactionType
  startDate: string
  endDate: string
  total: string
  categories: CategoryBreakdownItem[]
}

export interface BudgetVsActual {
  year: number
  month: number
  budgets: Budget[]
  totals: { limit: string; spent: string; remaining: string; percentUsed: number }
  unbudgetedSpent: string
  exceededCount: number
}
