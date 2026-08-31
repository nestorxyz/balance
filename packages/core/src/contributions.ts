import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { assertMinorUnits } from './money'

export type ContributionAction = 'receive' | 'settle' | 'return' | 'cancel'
export interface ContributionEvent {
  id: string
  contribution_id: string
  action: ContributionAction
  date: string
  account_id: string | null
  bill_amount: number | null
  transaction_ids: string[]
}
export interface SharedContribution {
  id: string
  contributor: string
  description: string
  category_id: string
  amount: number
  notice_date: string
  due_date: string
  liability_account_id: string
  status: 'pending' | 'received' | 'applied' | 'returned' | 'cancelled'
  received_date: string | null
  events: ContributionEvent[]
}
export interface CreateContributionInput {
  id: string
  contributor: string
  description: string
  categoryId: string
  amount: number
  noticeDate: string
  dueDate: string
}
export interface ContributionActionInput {
  id: string
  requestId: string
  action: ContributionAction
  date: string
  accountId?: string
  billAmount?: number
}

type Client = SupabaseClient<Database>
async function rpcResult<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  // SQL CHECK constraints narrow text states beyond the generated schema types.
  return data as T
}

export function financeToday(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function validateFinanceDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Fecha inválida: usa AAAA-MM-DD')
}
export function contributionReminder(row: SharedContribution, today: string): string | null {
  if (row.status !== 'pending' || today < row.notice_date) return null
  return today > row.due_date ? 'Vencido' : today === row.due_date ? 'Vence hoy' : 'Pendiente de recibir'
}
export function contributionReserved(rows: SharedContribution[]): number {
  return rows.filter(row => row.status === 'received').reduce((sum, row) => sum + row.amount, 0)
}
export function getSharedContributions(client: Client): Promise<SharedContribution[]> {
  return rpcResult(client.rpc('list_shared_contributions'))
}
export function createSharedContribution(client: Client, input: CreateContributionInput): Promise<Omit<SharedContribution, 'events'>> {
  assertMinorUnits(input.amount)
  if (input.amount <= 0) throw new Error('El aporte debe ser mayor a cero')
  validateFinanceDate(input.noticeDate)
  validateFinanceDate(input.dueDate)
  if (input.dueDate < input.noticeDate) throw new Error('El vencimiento debe ser posterior al aviso')
  return rpcResult(client.rpc('create_shared_contribution', {
    p_id: input.id, p_contributor: input.contributor, p_description: input.description,
    p_category_id: input.categoryId, p_amount: input.amount,
    p_notice_date: input.noticeDate, p_due_date: input.dueDate,
  }))
}
export function actOnContribution(client: Client, input: ContributionActionInput): Promise<ContributionEvent> {
  validateFinanceDate(input.date)
  if (input.action !== 'cancel' && !input.accountId) throw new Error('Elige la cuenta explícitamente')
  if (input.action === 'settle') {
    if (input.billAmount === undefined) throw new Error('Indica el total del recibo')
    assertMinorUnits(input.billAmount)
  }
  return rpcResult(client.rpc('act_on_contribution', {
    p_id: input.id, p_request_id: input.requestId, p_action: input.action,
    p_date: input.date, p_account_id: input.accountId, p_bill_amount: input.billAmount,
  }))
}
