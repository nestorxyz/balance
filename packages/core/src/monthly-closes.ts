import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { getMonthlyFinancialReport, type MonthlyFinancialReport } from './reports'

type TypedClient = SupabaseClient<Database>

export interface MonthCloseCheck {
  id: 'period_ended' | 'reconciled' | 'categorized' | 'transfers_paired' | 'has_activity'
  label: string
  passed: boolean
  value?: number
}

export interface MonthClosePreflight {
  month: string
  period_end: string
  ready: boolean
  fingerprint: string
  transaction_count: number
  state: 'open' | 'ready' | 'closed' | 'amendment_required'
  latest_revision: number
  checks: MonthCloseCheck[]
}

export interface MonthClose {
  id: string
  period: string
  revision: number
  transaction_fingerprint: string
  transaction_count: number
  preflight: MonthClosePreflight
  report_payload: MonthlyFinancialReport
  closed_at: string
}

export type MonthCloseSummary = Omit<MonthClose, 'report_payload'>

export async function getMonthClosePreflight(
  supabase: TypedClient,
  month: string,
): Promise<MonthClosePreflight> {
  const { data, error } = await supabase.rpc('get_month_close_preflight' as never, {
    p_month: month,
  } as never)
  if (error) throw error
  return data as MonthClosePreflight
}

export async function createMonthClose(
  supabase: TypedClient,
  input: { month: string; expectedFingerprint: string; report: MonthlyFinancialReport },
): Promise<MonthClose> {
  const { data, error } = await supabase.rpc('close_month' as never, {
    p_month: input.month,
    p_expected_fingerprint: input.expectedFingerprint,
    p_report_payload: input.report,
  } as never)
  if (error) throw error
  return data as unknown as MonthClose
}

export async function closeMonth(
  supabase: TypedClient,
  month: string,
): Promise<MonthClose> {
  const [preflight, report] = await Promise.all([
    getMonthClosePreflight(supabase, month),
    getMonthlyFinancialReport(supabase, month, 'personal'),
  ])
  if (!preflight.ready) throw new Error(`Month ${month} is not ready to close`)
  return createMonthClose(supabase, {
    month,
    expectedFingerprint: preflight.fingerprint,
    report,
  })
}

export async function getMonthCloseHistory(
  supabase: TypedClient,
  limit = 24,
): Promise<MonthCloseSummary[]> {
  const { data, error } = await supabase.rpc('get_month_close_history' as never, {
    p_limit: limit,
  } as never)
  if (error) throw error
  return (data ?? []) as unknown as MonthCloseSummary[]
}

export async function getMonthClose(
  supabase: TypedClient,
  month: string,
  revision?: number,
): Promise<MonthClose> {
  const { data, error } = await supabase.rpc('get_month_close' as never, {
    p_month: month,
    p_revision: revision ?? null,
  } as never)
  if (error) throw error
  return data as unknown as MonthClose
}

export function scheduledCloseMonths(today: Date): string[] {
  const year = today.getFullYear()
  const month = today.getMonth()
  const day = today.getDate()
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const months: string[] = []
  if (day >= 28) months.push(format(new Date(year, month, 1)))
  if (day <= 3) months.push(format(new Date(year, month - 1, 1)))
  return months
}
