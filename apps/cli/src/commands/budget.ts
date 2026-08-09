import type { Command } from 'commander'
import { copyBudget, getCategories, getMonthlyBudget, parseMoney, removeBudgetTarget, setBudgetIncome, setBudgetTarget } from '@balance/core'
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
  const matches = categories.filter((c) => c.parent_id === null && c.name.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0)
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
}
