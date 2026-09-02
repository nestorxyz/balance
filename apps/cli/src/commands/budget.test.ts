import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { registerBudgetCommand } from './budget'

const api = vi.hoisted(() => ({
  assign: vi.fn(), exclude: vi.fn(), reset: vi.fn(), list: vi.fn(), getClient: vi.fn(),
}))
vi.mock('@balance/core', async importOriginal => ({
  ...await importOriginal<typeof import('@balance/core')>(),
  assignTransactionToBudget: api.assign,
  excludeTransactionFromBudget: api.exclude,
  resetTransactionBudgetAssignment: api.reset,
  getBudgetAssignments: api.list,
}))
vi.mock('../lib/client', () => ({ getAuthedClient: api.getClient }))

function program() { const value = new Command(); registerBudgetCommand(value); return value }

beforeEach(() => {
  vi.clearAllMocks()
  api.getClient.mockResolvedValue({ client: true })
  api.assign.mockResolvedValue({ transaction_id: 'tx-1', budget_month: '2026-09-01' })
  api.exclude.mockResolvedValue({ transaction_id: 'tx-1', is_excluded: true })
  api.reset.mockResolvedValue({ transaction_id: 'tx-1', is_explicit: false })
  api.list.mockResolvedValue([])
})

describe('budget assignment CLI', () => {
  it('assigns a transaction to an explicit month and emits JSON', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      await program().parseAsync(['budget', 'assign', 'tx-1', '--month', '2026-09', '--json'], { from: 'user' })
      expect(api.assign).toHaveBeenCalledWith({ client: true }, 'tx-1', '2026-09')
      expect(output).toHaveBeenCalledWith('{"transaction_id":"tx-1","budget_month":"2026-09-01"}\n')
    } finally { output.mockRestore() }
  })

  it('lists by accounting and effective budget month', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      await program().parseAsync(['budget', 'assignments', '--accounting-month', '2026-08', '--month', '2026-09', '--all', '--json'], { from: 'user' })
      expect(api.list).toHaveBeenCalledWith({ client: true }, {
        accountingMonth: '2026-08', month: '2026-09', explicitOnly: false,
      })
      expect(output).toHaveBeenCalledWith('[]\n')
    } finally { output.mockRestore() }
  })
})
