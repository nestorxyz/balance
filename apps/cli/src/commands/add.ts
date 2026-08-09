import type { Command } from 'commander'
import { stringifyJson } from '../lib/json'
import { createTransaction, parseMoney } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP } from '../lib/format'
import { resolveAccountId } from '../lib/resolve'
import { ui } from '../lib/ui'

type TxType = 'expense' | 'income' | 'refund' | 'adjustment'
const VALID_TYPES: readonly TxType[] = ['expense', 'income', 'refund', 'adjustment']

function isTxType(value: string): value is TxType {
  return (VALID_TYPES as readonly string[]).includes(value)
}

export function parseAmount(raw: string): number {
  return Math.abs(parseMoney(raw, { allowNegative: true }))
}

interface AddOptions {
  type: string
  account?: string
  note: string
  date?: string
  json?: boolean
}

export function registerAddCommand(program: Command): void {
  program
    .command('add <amount> <category>')
    .description('Register a transaction (default type: expense)')
    .option('--type <type>', `one of: ${VALID_TYPES.join(', ')}`, 'expense')
    .option('--account <name|id>', 'account name (fuzzy) or uuid (required)')
    .option('--note <text>', 'description', '')
    .option('--date <YYYY-MM-DD>', 'transaction date (default today)')
    .option('--json', 'output JSON')
    .action(async (amountRaw: string, category: string, opts: AddOptions) => {
      let amount: number
      try {
        amount = parseAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      if (!isTxType(opts.type)) {
        fail(`invalid --type: ${opts.type}. Must be one of ${VALID_TYPES.join(', ')}`)
      }
      if (!opts.account) fail('--account is required (name or uuid)')

      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, opts.account)

      const result = await createTransaction(client, {
        amount,
        category,
        accountId,
        description: opts.note,
        type: opts.type,
        date: opts.date,
      })

      if (opts.json) {
        process.stdout.write(stringifyJson(result) + '\n')
      } else {
        const tick = ui.positive('✓')
        const type = ui.accent(opts.type)
        const amt = ui.strong(formatCLP(amount))
        const cat = ui.accent(category)
        process.stdout.write(`  ${tick} ${ui.dim('registered')} ${type} ${amt} ${ui.dim('in')} ${cat}\n`)
      }
    })
}
