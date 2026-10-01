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
  account: AccountSummary
  installment: { groupId: string; number: number; total: number } | null
  createdBy: UserRef | null
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

// ---------------- Accounts & transfers ----------------
export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT'

export interface AccountSummary {
  id: string
  name: string
  type: AccountType
  color: string | null
  icon: string | null
}

export interface Account extends AccountSummary {
  initialBalance: string
  balance: string
  upcoming: string
  archived: boolean
  transactionCount: number
  createdAt: string
}

export interface Transfer {
  id: string
  amount: string
  date: string
  description: string | null
  fromAccount: AccountSummary
  toAccount: AccountSummary
  createdBy: UserRef | null
  createdAt: string
}

export interface UserRef {
  id: string
  name: string
}

// ---------------- Household ----------------
export type HouseholdRole = 'OWNER' | 'MEMBER'

export interface HouseholdMember {
  userId: string
  name: string
  email: string
  role: HouseholdRole
  joinedAt: string
  isYou: boolean
}

export interface Household {
  id: string
  name: string
  role: HouseholdRole
  members: HouseholdMember[]
  invitesEnabled: boolean
}

// ---------------- Recurring ----------------
export type RecurrenceFrequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface RecurringRule {
  id: string
  description: string
  amount: string
  type: TransactionType
  frequency: RecurrenceFrequency
  category: CategorySummary
  account: AccountSummary
  startDate: string
  endDate: string | null
  nextDate: string | null
  active: boolean
  notes: string | null
  generatedCount: number
}

export interface UpcomingOccurrence {
  ruleId: string
  description: string
  amount: string
  type: TransactionType
  date: string
  category: CategorySummary
}

// ---------------- Goals ----------------
export type GoalStatus = 'COMPLETED' | 'ON_TRACK' | 'BEHIND' | 'OVERDUE' | 'NO_DEADLINE'

export interface Goal {
  id: string
  name: string
  targetAmount: string
  targetDate: string | null
  color: string | null
  icon: string | null
  archived: boolean
  saved: string
  remaining: string
  percent: number
  monthlyNeeded: string | null
  monthlyPace: string
  projectedDate: string | null
  status: GoalStatus
  createdAt: string
}

export interface GoalContribution {
  id: string
  amount: string
  date: string
  note: string | null
  createdBy: UserRef | null
}

export interface GoalDetail extends Goal {
  contributions: GoalContribution[]
}

// ---------------- Calendar ----------------
export type EventVisibility = 'SHARED' | 'PRIVATE'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  allDay: boolean
  visibility: EventVisibility
  color: string | null
  estimatedCost: string | null
  createdBy: UserRef | null
  isMine: boolean
}

export interface CalendarBill extends UpcomingOccurrence {
  done: boolean
}

export interface CalendarFeed {
  events: CalendarEvent[]
  bills: CalendarBill[]
}

// ---------------- Insights ----------------
export type InsightSeverity = 'danger' | 'warning' | 'positive' | 'info'

export interface Insight {
  id: string
  kind:
    | 'CATEGORY_SPIKE'
    | 'CATEGORY_DROP'
    | 'BUDGET_EXCEEDED'
    | 'BUDGET_WARNING'
    | 'BUDGET_PACE'
    | 'SAVINGS_GOOD'
    | 'SPENT_MORE_THAN_EARNED'
    | 'BIGGEST_EXPENSE'
    | 'UPCOMING_BILLS'
    | 'GOAL_BEHIND'
    | 'GOAL_COMPLETED'
    | 'UNBUDGETED_SPENDING'
  severity: InsightSeverity
  data: Record<string, string | number | null>
}

// ---------------- Import ----------------
export interface ImportRow {
  date: string
  description: string
  amount: number
  type?: TransactionType
  category?: string
  externalId?: string
  notes?: string
}

export interface ImportResult {
  created: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}
