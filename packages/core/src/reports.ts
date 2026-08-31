import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>
type TransactionRow = Database['public']['Tables']['transactions']['Row']
type AccountRow = Database['public']['Tables']['accounts']['Row']
type CategoryRow = Database['public']['Tables']['categories']['Row']

export type ReportTransaction = Pick<
  TransactionRow,
  'id' | 'account_id' | 'amount' | 'category' | 'date' | 'description' | 'entity' | 'transfer_to' | 'type'
>

export type ReportAccount = Pick<
  AccountRow,
  'id' | 'name' | 'type' | 'subtype' | 'currency' | 'on_budget' | 'is_archived'
>

export type ReportCategory = Pick<CategoryRow, 'id' | 'name' | 'parent_id'>

export interface JournalLine {
  account: string
  debit: number
  credit: number
}

export interface JournalEntry {
  id: string
  date: string
  description: string
  type: TransactionRow['type']
  lines: JournalLine[]
  amount: number
}

export interface LedgerRow {
  id: string
  date: string
  description: string
  category: string
  debit: number
  credit: number
  balance: number
}

export interface AccountLedger {
  account: ReportAccount
  openingBalance: number
  rows: LedgerRow[]
  totalDebits: number
  totalCredits: number
  closingBalance: number
}

export interface CashFlowCategory {
  id: string
  name: string
  amount: number
  transactions: number
}

export interface CashFlowReport {
  income: CashFlowCategory[]
  expenses: CashFlowCategory[]
  totalIncome: number
  totalExpenses: number
  net: number
}

export interface FinancialPositionItem {
  id: string
  name: string
  subtype: AccountRow['subtype']
  balance: number
  currency: string
}

export interface FinancialPositionReport {
  assets: FinancialPositionItem[]
  liabilities: FinancialPositionItem[]
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

export interface MonthlyFinancialReport {
  month: string
  journal: JournalEntry[]
  ledgers: AccountLedger[]
  cashFlow: CashFlowReport
  position: FinancialPositionReport
}

export function monthBounds(month: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) throw new Error(`Invalid report month: ${month}`)
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  if (monthNumber < 1 || monthNumber > 12) throw new Error(`Invalid report month: ${month}`)
  const endDay = new Date(year, monthNumber, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(endDay).padStart(2, '0')}` }
}

export function transactionAccountEffect(transaction: ReportTransaction): number {
  switch (transaction.type) {
    case 'income':
    case 'refund':
      return transaction.amount
    case 'expense':
      return -transaction.amount
    case 'adjustment':
    case 'transfer':
      return transaction.amount
    case 'debt_payment':
      return 0
  }
}

function categoryName(categoryId: string | null, categoryMap: Map<string, ReportCategory>): string {
  if (!categoryId) return 'Sin categoría'
  return categoryMap.get(categoryId)?.name ?? categoryId
}

function accountName(accountId: string, accountMap: Map<string, ReportAccount>): string {
  return accountMap.get(accountId)?.name ?? 'Cuenta desconocida'
}

function journalLinesForTransaction(
  transaction: ReportTransaction,
  accountMap: Map<string, ReportAccount>,
  categoryMap: Map<string, ReportCategory>,
): JournalLine[] {
  const account = accountName(transaction.account_id, accountMap)
  const category = categoryName(transaction.category, categoryMap)
  const amount = Math.abs(transaction.amount)

  if (transaction.type === 'income' || transaction.type === 'refund') {
    return [
      { account, debit: amount, credit: 0 },
      { account: category, debit: 0, credit: amount },
    ]
  }
  if (transaction.type === 'expense') {
    return [
      { account: category, debit: amount, credit: 0 },
      { account, debit: 0, credit: amount },
    ]
  }
  if (transaction.type === 'transfer') {
    const destination = transaction.transfer_to
      ? accountName(transaction.transfer_to, accountMap)
      : 'Cuenta contraparte'
    if (transaction.amount < 0) {
      return [
        { account: destination, debit: amount, credit: 0 },
        { account, debit: 0, credit: amount },
      ]
    }
    return [
      { account, debit: amount, credit: 0 },
      { account: destination, debit: 0, credit: amount },
    ]
  }
  if (transaction.type === 'adjustment') {
    return transaction.amount >= 0
      ? [
          { account, debit: amount, credit: 0 },
          { account: 'Ajuste de patrimonio', debit: 0, credit: amount },
        ]
      : [
          { account: 'Ajuste de patrimonio', debit: amount, credit: 0 },
          { account, debit: 0, credit: amount },
        ]
  }
  return [
    { account: 'Pago de deuda', debit: amount, credit: 0 },
    { account, debit: 0, credit: amount },
  ]
}

function transferKey(transaction: ReportTransaction): string | null {
  if (transaction.type !== 'transfer' || !transaction.transfer_to) return null
  const accountPair = [transaction.account_id, transaction.transfer_to].sort().join(':')
  return `${transaction.date}:${Math.abs(transaction.amount)}:${accountPair}`
}

export function buildJournal(
  transactions: ReportTransaction[],
  accounts: ReportAccount[],
  categories: ReportCategory[],
): JournalEntry[] {
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  return transactions
    .filter((transaction) => {
      if (transaction.type === 'debt_payment') return false
      const key = transferKey(transaction)
      if (!key) return true
      return transaction.amount < 0 || !transactions.some((candidate) => (
        candidate !== transaction && transferKey(candidate) === key && candidate.amount < 0
      ))
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      description: transaction.description || categoryName(transaction.category, categoryMap),
      type: transaction.type,
      amount: Math.abs(transaction.amount),
      lines: journalLinesForTransaction(transaction, accountMap, categoryMap),
    }))
}

export function buildLedgers(
  transactions: ReportTransaction[],
  accounts: ReportAccount[],
  categories: ReportCategory[],
  month: string,
): AccountLedger[] {
  const { start, end } = monthBounds(month)
  const categoryMap = new Map(categories.map((category) => [category.id, category]))

  return accounts
    .filter((account) => !account.is_archived)
    .map((account) => {
      const accountTransactions = transactions
        .filter((transaction) => transaction.account_id === account.id && transaction.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      const openingBalance = accountTransactions
        .filter((transaction) => transaction.date < start)
        .reduce((sum, transaction) => sum + transactionAccountEffect(transaction), 0)
      let runningBalance = openingBalance
      let totalDebits = 0
      let totalCredits = 0
      const rows = accountTransactions
        .filter((transaction) => transaction.date >= start)
        .map((transaction) => {
          const effect = transactionAccountEffect(transaction)
          const debit = effect > 0 ? effect : 0
          const credit = effect < 0 ? Math.abs(effect) : 0
          runningBalance += effect
          totalDebits += debit
          totalCredits += credit
          return {
            id: transaction.id,
            date: transaction.date,
            description: transaction.description || categoryName(transaction.category, categoryMap),
            category: categoryName(transaction.category, categoryMap),
            debit,
            credit,
            balance: runningBalance,
          }
        })

      return {
        account,
        openingBalance,
        rows,
        totalDebits,
        totalCredits,
        closingBalance: runningBalance,
      }
    })
    .filter((ledger) => ledger.rows.length > 0 || ledger.openingBalance !== 0)
    .sort((a, b) => a.account.name.localeCompare(b.account.name))
}

function groupCashFlow(
  transactions: ReportTransaction[],
  categories: ReportCategory[],
  type: 'income' | 'expense',
): CashFlowCategory[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const grouped = new Map<string, CashFlowCategory>()

  for (const transaction of transactions) {
    const isIncluded = type === 'income'
      ? transaction.type === 'income'
      : transaction.type === 'expense' || transaction.type === 'refund'
    if (!isIncluded) continue

    const id = transaction.category ?? 'uncategorized'
    const current = grouped.get(id) ?? {
      id,
      name: categoryName(transaction.category, categoryMap),
      amount: 0,
      transactions: 0,
    }
    const sign = transaction.type === 'refund' ? -1 : 1
    current.amount += transaction.amount * sign
    current.transactions += 1
    grouped.set(id, current)
  }

  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

export function buildCashFlow(
  transactions: ReportTransaction[],
  categories: ReportCategory[],
): CashFlowReport {
  const income = groupCashFlow(transactions, categories, 'income')
  const expenses = groupCashFlow(transactions, categories, 'expense')
  const totalIncome = income.reduce((sum, category) => sum + category.amount, 0)
  const totalExpenses = expenses.reduce((sum, category) => sum + category.amount, 0)
  return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses }
}

export function buildFinancialPosition(ledgers: AccountLedger[]): FinancialPositionReport {
  const assets: FinancialPositionItem[] = []
  const liabilities: FinancialPositionItem[] = []

  for (const ledger of ledgers) {
    if (!ledger.account.on_budget || ledger.closingBalance === 0) continue
    const item = {
      id: ledger.account.id,
      name: ledger.account.name,
      subtype: ledger.account.subtype,
      balance: ledger.closingBalance,
      currency: ledger.account.currency,
    }
    if (ledger.account.type === 'asset') assets.push(item)
    else liabilities.push(item)
  }

  assets.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
  liabilities.sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name))
  const totalAssets = assets.reduce((sum, item) => sum + item.balance, 0)
  const totalLiabilities = liabilities.reduce((sum, item) => sum + item.balance, 0)
  return { assets, liabilities, totalAssets, totalLiabilities, netWorth: totalAssets + totalLiabilities }
}

export function buildMonthlyFinancialReport(input: {
  month: string
  transactions: ReportTransaction[]
  accounts: ReportAccount[]
  categories: ReportCategory[]
}): MonthlyFinancialReport {
  const { start, end } = monthBounds(input.month)
  const monthlyTransactions = input.transactions.filter((transaction) => (
    transaction.date >= start && transaction.date <= end
  ))
  const ledgers = buildLedgers(input.transactions, input.accounts, input.categories, input.month)
  return {
    month: input.month,
    journal: buildJournal(monthlyTransactions, input.accounts, input.categories),
    ledgers,
    cashFlow: buildCashFlow(monthlyTransactions, input.categories),
    position: buildFinancialPosition(ledgers),
  }
}

export async function getMonthlyFinancialReport(
  supabase: TypedClient,
  month: string,
  entity: 'personal' | 'spa' = 'personal',
): Promise<MonthlyFinancialReport> {
  const { end } = monthBounds(month)
  const [transactionsResult, accountsResult, categoriesResult] = await Promise.all([
    getAllReportTransactions(supabase, end, entity),
    supabase
      .from('accounts')
      .select('id, name, type, subtype, currency, on_budget, is_archived')
      .eq('entity', entity),
    supabase
      .from('categories')
      .select('id, name, parent_id')
      .eq('entity', entity)
      .order('sort_order'),
  ])

  if (accountsResult.error) throw accountsResult.error
  if (categoriesResult.error) throw categoriesResult.error

  return buildMonthlyFinancialReport({
    month,
    transactions: transactionsResult,
    accounts: accountsResult.data,
    categories: categoriesResult.data,
  })
}

async function getAllReportTransactions(
  supabase: TypedClient,
  end: string,
  entity: 'personal' | 'spa',
): Promise<ReportTransaction[]> {
  const pageSize = 1000
  const transactions: ReportTransaction[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, account_id, amount, category, date, description, entity, transfer_to, type')
      .eq('entity', entity)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    transactions.push(...data)
    if (data.length < pageSize) break
  }

  return transactions
}
