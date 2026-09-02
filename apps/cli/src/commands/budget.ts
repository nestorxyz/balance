import type { Command } from 'commander'
import {
  assignTransactionToBudget,
  copyBudget,
  excludeTransactionFromBudget,
  getBudgetAssignments,
  getCategories,
  getMonthlyBudget,
  parseMoney,
  removeBudgetTarget,
  resetTransactionBudgetAssignment,
  setBudgetIncome,
  setBudgetTarget,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { stringifyJson } from '../lib/json'
import { fail } from '../lib/exit'

const currentMonth = () => new Date().toISOString().slice(0, 7)
function validMonth(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) fail(`invalid month: ${value}; expected YYYY-MM`)
  return value
}
function amount(value: string): number {
  try { return parseMoney(value) } catch (error) { fail((error as Error).message) }
}
async function categoryId(client: Awaited<ReturnType<typeof getAuthedClient>>, value: string): Promise<string> {
  const categories = await getCategories(client, { entity: 'personal' })
  const exactId = categories.find((c) => c.id === value)
  if (exactId) return exactId.id
  const matches = categories.filter((c) => c.name.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0)
  if (matches.length !== 1) fail(matches.length ? `ambiguous category: ${value}; use its id` : `category not found: ${value}`)
  return matches[0]!.id
}

export function registerBudgetCommand(program: Command): void {
  const budget = program.command('budget').description('Manage monthly personal PEN budgets')
  budget.command('show').option('--month <YYYY-MM>', 'budget month', currentMonth()).option('--json', 'output JSON')
    .action(async (opts) => { const data = await getMonthlyBudget(await getAuthedClient(), validMonth(opts.month)); process.stdout.write(stringifyJson(data) + '\n') })
  budget.command('income <amount>').option('--month <YYYY-MM>', 'budget month', currentMonth())
    .action(async (raw, opts) => { const month = validMonth(opts.month); await setBudgetIncome(await getAuthedClient(), month, amount(raw)); process.stdout.write(`Planned income set for ${month}\n`) })
  budget.command('set <category> <amount>').option('--month <YYYY-MM>', 'budget month', currentMonth())
    .action(async (name, raw, opts) => { const client=await getAuthedClient(); const month=validMonth(opts.month); await setBudgetTarget(client, month, await categoryId(client,name), amount(raw)); process.stdout.write(`Budget target set for ${name} in ${month}\n`) })
  budget.command('remove <category>').option('--month <YYYY-MM>', 'budget month', currentMonth())
    .action(async (name, opts) => { const client=await getAuthedClient(); const month=validMonth(opts.month); await removeBudgetTarget(client,month,await categoryId(client,name)); process.stdout.write(`Budget target removed for ${name} in ${month}\n`) })
  budget.command('copy').requiredOption('--from <YYYY-MM>').requiredOption('--to <YYYY-MM>').option('--replace')
    .action(async (opts) => { await copyBudget(await getAuthedClient(),validMonth(opts.from),validMonth(opts.to),Boolean(opts.replace)); process.stdout.write(`Budget copied from ${opts.from} to ${opts.to}\n`) })
  budget.command('assign <transaction>')
    .description('Assign a ledger transaction to a budget month without changing its accounting date')
    .requiredOption('--month <YYYY-MM>', 'budget month')
    .option('--json', 'output JSON')
    .action(async (transaction, opts) => {
      const result = await assignTransactionToBudget(await getAuthedClient(), transaction, validMonth(opts.month))
      process.stdout.write(opts.json ? `${stringifyJson(result)}\n` : `Transaction ${transaction} assigned to budget ${opts.month}\n`)
    })
  budget.command('exclude <transaction>')
    .description('Exclude a ledger transaction from every budget without changing the ledger')
    .option('--json', 'output JSON')
    .action(async (transaction, opts) => {
      const result = await excludeTransactionFromBudget(await getAuthedClient(), transaction)
      process.stdout.write(opts.json ? `${stringifyJson(result)}\n` : `Transaction ${transaction} excluded from budgets\n`)
    })
  budget.command('reset <transaction>')
    .description('Use the transaction accounting month as its budget month again')
    .option('--json', 'output JSON')
    .action(async (transaction, opts) => {
      const result = await resetTransactionBudgetAssignment(await getAuthedClient(), transaction)
      process.stdout.write(opts.json ? `${stringifyJson(result)}\n` : `Transaction ${transaction} reset to its accounting month\n`)
    })
  budget.command('assignments')
    .description('List budget period assignments')
    .option('--month <YYYY-MM>', 'effective budget month')
    .option('--accounting-month <YYYY-MM>', 'transaction accounting month')
    .option('--all', 'include default accounting-month assignments')
    .option('--json', 'output JSON')
    .action(async (opts) => {
      const month = opts.month ? validMonth(opts.month) : undefined
      const accountingMonth = opts.accountingMonth ? validMonth(opts.accountingMonth) : undefined
      const result = await getBudgetAssignments(await getAuthedClient(), { month, accountingMonth, explicitOnly: !opts.all })
      if (opts.json) {
        process.stdout.write(`${stringifyJson(result)}\n`)
        return
      }
      if (result.length === 0) {
        process.stdout.write('No budget assignments found\n')
        return
      }
      for (const row of result) {
        const destination = row.is_excluded ? 'excluded' : row.budget_month?.slice(0, 7)
        process.stdout.write(`${row.transaction_id}  ${row.accounting_date} -> ${destination}  ${row.description}\n`)
      }
    })
}
