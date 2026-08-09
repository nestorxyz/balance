import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type Client = SupabaseClient<Database>

export interface BudgetCategory {
  category_id: string
  name: string
  target: number
  spent: number
  remaining: number
  percentage_used: number
}

export interface MonthlyBudget {
  month: string
  currency: 'PEN'
  planned_income: number
  total_allocated: number
  planned_available: number
  actual_income: number
  actual_spending: number
  actual_available: number
  categories: BudgetCategory[]
}

async function rpc<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: T; error: Error | null }>)(name, args)
  if (error) throw error
  return data
}

export const getMonthlyBudget = (client: Client, month: string) =>
  rpc<MonthlyBudget>(client, 'get_monthly_budget', { p_month: `${month}-01` })
export const setBudgetIncome = (client: Client, month: string, amount: number) =>
  rpc(client, 'set_budget_income', { p_month: `${month}-01`, p_amount: amount })
export const setBudgetTarget = (client: Client, month: string, categoryId: string, amount: number) =>
  rpc(client, 'set_budget_target', { p_month: `${month}-01`, p_category_id: categoryId, p_amount: amount })
export const removeBudgetTarget = (client: Client, month: string, categoryId: string) =>
  rpc(client, 'remove_budget_target', { p_month: `${month}-01`, p_category_id: categoryId })
export const copyBudget = (client: Client, from: string, to: string, replace = false) =>
  rpc(client, 'copy_budget', { p_from: `${from}-01`, p_to: `${to}-01`, p_replace: replace })
