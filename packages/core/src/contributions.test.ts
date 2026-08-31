import { describe, expect, it, vi } from 'vitest'
import { actOnContribution, contributionReminder, contributionReserved, financeToday, validateFinanceDate } from './contributions'
import type { SharedContribution } from './contributions'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { buildCashFlow } from './reports'
import { stringifyMoneyJson } from './export'

const row: SharedContribution = {
  id: 'contribution', contributor: 'Neighbor', description: 'Light', category_id: 'light', amount: 3000,
  notice_date: '2026-08-20', due_date: '2026-08-27', status: 'pending', received_date: null,
  liability_account_id: 'holding', events: [],
}
describe('contributions', () => {
  it('uses Peru date rather than UTC at midnight', () => {
    expect(financeToday(new Date('2026-08-28T02:00:00Z'))).toBe('2026-08-27')
  })
  it('reminds without prematurely moving money', () => {
    expect(contributionReminder(row, '2026-08-19')).toBeNull()
    expect(contributionReminder(row, '2026-08-20')).toBe('Pendiente de recibir')
    expect(contributionReminder(row, '2026-08-27')).toBe('Vence hoy')
    expect(contributionReminder(row, '2026-08-28')).toBe('Vencido')
    expect(contributionReminder({ ...row, status: 'received' }, '2026-08-28')).toBeNull()
    expect(contributionReserved([row])).toBe(0)
    expect(contributionReserved([{ ...row, status: 'received' }, { ...row, status: 'applied' }])).toBe(3000)
  })
  it('rejects invalid calendar dates', () => {
    expect(() => validateFinanceDate('2026-02-30')).toThrow()
    expect(() => validateFinanceDate('2026-08-31')).not.toThrow()
  })
  it('preserves operation id, exact amounts and date at the RPC boundary', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'request' }, error: null })
    const client = { rpc } as unknown as SupabaseClient<Database>
    const input = { id: row.id, requestId: 'request', action: 'settle' as const, date: '2026-08-29', accountId: 'bank', billAmount: 10000 }
    await actOnContribution(client, input)
    await actOnContribution(client, input)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc).toHaveBeenCalledWith('act_on_contribution', { p_id: row.id, p_request_id: 'request', p_action: 'settle', p_date: '2026-08-29', p_account_id: 'bank', p_bill_amount: 10000 })
    expect(() => actOnContribution(client, { ...input, accountId: undefined })).toThrow('cuenta')
  })
  it('keeps contribution transfers out of income and nets application against expense', () => {
    const base = { date: '2026-08-29', entity: 'personal' as const, description: 'Shared bill', category: 'light', transfer_to: null }
    const flow = buildCashFlow([
      { ...base, id: 'in', account_id: 'bank', type: 'transfer', amount: 3000 },
      { ...base, id: 'holding', account_id: 'holding', type: 'transfer', amount: -3000 },
      { ...base, id: 'bill', account_id: 'bank', type: 'expense', amount: 10000 },
      { ...base, id: 'applied', account_id: 'holding', type: 'refund', amount: 3000 },
    ], [])
    expect(flow.totalIncome).toBe(0)
    expect(flow.totalExpenses).toBe(7000)
    expect(flow.net).toBe(-7000)
  })
  it('serializes contribution and bill money without x100 scale errors', () => {
    expect(JSON.parse(stringifyMoneyJson({ amount: 3000, bill_amount: 10000 }))).toEqual({ amount: '30.00', bill_amount: '100.00' })
  })
})
