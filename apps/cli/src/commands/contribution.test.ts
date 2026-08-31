import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { registerContributionCommand } from './contribution'

const { act, create, getClient } = vi.hoisted(() => ({ act: vi.fn(), create: vi.fn(), getClient: vi.fn() }))
vi.mock('@balance/core', async importOriginal => ({ ...await importOriginal<typeof import('@balance/core')>(), actOnContribution: act, createSharedContribution: create }))
vi.mock('../lib/client', () => ({ getAuthedClient: getClient }))
vi.mock('../lib/resolve', () => ({ resolveAccountId: async () => 'bank-id' }))
function program() { const p = new Command(); registerContributionCommand(p); return p }
beforeEach(() => { vi.clearAllMocks(); getClient.mockResolvedValue({}); act.mockResolvedValue({ amount: 3000 }) })
describe('contribution CLI confirmation', () => {
  it('never authenticates or writes without confirmation', async () => {
    await expect(program().parseAsync(['contribution','receive','c1','--date','2026-08-29','--account','Bank','--request-id','r1'], { from: 'user' })).rejects.toThrow('--yes')
    expect(getClient).not.toHaveBeenCalled(); expect(act).not.toHaveBeenCalled()
  })
  it('preserves decimal amount and stable key for a confirmed settlement', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      await program().parseAsync(['contribution','settle','c1','--date','2026-08-29','--account','Bank','--request-id','r1','--bill','100.35','--yes','--json'], { from: 'user' })
      expect(act).toHaveBeenCalledWith({}, { id:'c1', requestId:'r1', action:'settle', date:'2026-08-29', accountId:'bank-id', billAmount:10035 })
      expect(output).toHaveBeenCalledWith('{"amount":"30.00"}\n')
    } finally { output.mockRestore() }
  })
})
