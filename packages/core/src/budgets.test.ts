import { describe, expect, it, vi } from 'vitest'
import { copyBudget, getMonthlyBudget, removeBudgetTarget, setBudgetIncome, setBudgetTarget } from './budgets'

describe('budget API', () => {
  it('uses month starts and exact integer hundredths', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null })
    const client = { rpc } as never
    await setBudgetIncome(client, '2026-08', 123456)
    await setBudgetTarget(client, '2026-08', 'cat-id', 9999)
    await removeBudgetTarget(client, '2026-08', 'cat-id')
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_budget_income', { p_month: '2026-08-01', p_amount: 123456 })
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_budget_target', { p_month: '2026-08-01', p_category_id: 'cat-id', p_amount: 9999 })
    expect(rpc).toHaveBeenNthCalledWith(3, 'remove_budget_target', { p_month: '2026-08-01', p_category_id: 'cat-id' })
  })
  it('copies without replacement by default', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { categories: [] }, error: null })
    const client = { rpc } as never
    await getMonthlyBudget(client, '2026-08')
    await copyBudget(client, '2026-08', '2026-09')
    expect(rpc).toHaveBeenLastCalledWith('copy_budget', { p_from: '2026-08-01', p_to: '2026-09-01', p_replace: false })
  })
})
