export { createSupabaseClient } from './supabase'
export { getSharedContributions, createSharedContribution, actOnContribution, contributionReminder, contributionReserved, financeToday } from './contributions'
export type { SharedContribution, ContributionEvent, CreateContributionInput, ContributionActionInput, ContributionAction } from './contributions'
export type { SupabaseClient, Database } from './supabase'

export { createAccount, getAccounts, archiveAccount, renameAccount, updateAccountBalance } from './accounts'
export { createTransaction, undoTransaction, createOpeningBalance, getTransactions, getMonthlySummary } from './transactions'
export { getReconciliationStatus } from './reconciliation'
export type { ReconciliationStatus } from './reconciliation'
export { getMonthlyBuckets } from './buckets'
export type { MonthlyBuckets, MonthlyBucketsOptions } from './buckets'
export {
  getUncategorizedTransactions,
  getEmailMovements,
  setTransactionCategory,
  getCategorizationRules,
  createCategorizationRule,
  deleteCategorizationRule,
  discardEmailMovement,
  promoteEmailMovements,
  getSyncState,
} from './inbox'
export type {
  UncategorizedTransaction,
  EmailMovement,
  CategorizationRule,
  PromoteSummary,
  SyncState,
} from './inbox'
export { triggerGmailSync } from './sync'
export type { GmailSyncSummary } from './sync'
export {
  getRecurringStatus,
  processDueRecurringCharges,
  payRecurringCharge,
  listRecurringDetailed,
  createRecurringCharge,
  updateRecurringCharge,
  deleteRecurringCharge,
} from './recurring'
export type {
  Entity,
  RecurringStatus,
  RecurringChargeDetailed,
  RecurringStatusItem,
  ProcessedCharge,
  ProcessResult,
  CreateRecurringInput,
  UpdateRecurringInput,
} from './recurring'
export { parseMoney, moneyToDecimal, formatMoney, assertMinorUnits, roundMoney, usdToClp, parseUsdAmount } from './money'
export type { ParseMoneyOptions } from './money'
export { getCategories, createSubcategory, createTopLevelCategory, renameCategory, archiveCategory, deleteCategory } from './categories'
export {
  getMonthlyBudget, setBudgetIncome, setBudgetTarget, removeBudgetTarget, copyBudget,
  assignTransactionToBudget, excludeTransactionFromBudget, resetTransactionBudgetAssignment, getBudgetAssignments,
} from './budgets'
export type { MonthlyBudget, BudgetCategory, BudgetAssignment } from './budgets'
export { createInstallmentPurchase, payDebtInstallment, payOffDebt, getActiveDebts, archiveDebt } from './debts'
export { createTransfer, createInterEntityTransfer, receivePayment } from './transfers'
export { createSnapshot, getSnapshotHistory } from './snapshots'
export {
  closeMonth,
  createMonthClose,
  getMonthClose,
  getMonthCloseHistory,
  getMonthClosePreflight,
  scheduledCloseMonths,
} from './monthly-closes'
export type { MonthClose, MonthCloseCheck, MonthClosePreflight, MonthCloseSummary } from './monthly-closes'

export {
  buildCashFlow,
  buildFinancialPosition,
  buildJournal,
  buildLedgers,
  buildMonthlyFinancialReport,
  getMonthlyFinancialReport,
  monthBounds,
  transactionAccountEffect,
} from './reports'
export type {
  AccountLedger,
  CashFlowCategory,
  CashFlowReport,
  FinancialPositionItem,
  FinancialPositionReport,
  JournalEntry,
  JournalLine,
  LedgerRow,
  MonthlyFinancialReport,
  ReportAccount,
  ReportCategory,
  ReportTransaction,
} from './reports'

export { exportAllData, exportTableAsCsv, downloadBlob, serializeMoneyFields, stringifyMoneyJson } from './export'

export { generateApiKey, hashApiKey } from './api-keys'

export { signUp, signIn, signOut, getSession, onAuthStateChange } from './auth'

export { completeOnboarding, getOnboardingStatus } from './onboarding'
export type { OnboardingAccount, OnboardingInput } from './onboarding'

export { getSpaDashboard, getSpaInvoices, createSpaInvoice, getSpaExpenses, getSpaProfit } from './spa'
export { getSpaEmitidas, getSpaRecibidas, createSpaInvoiceV2, markSpaInvoicePaid, getF29Summary, getSpaAnnualSummary } from './spa'
export { uploadFacturaFile, getFacturaSignedUrl, getSpaReimbursables, linkTransactionToInvoice, markF29Declared } from './spa'
export type { SpaDashboardData, SpaInvoice, SpaInvoiceRow, F29Summary, F29Declaration, AnnualSummary, CreateInvoiceInput, DocumentType, InvoiceDirection, ReimbursableRow, MarkF29DeclaredInput } from './spa'
