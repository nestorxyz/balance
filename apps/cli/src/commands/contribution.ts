import type { Command } from 'commander'
import { actOnContribution, createSharedContribution, getSharedContributions, contributionReminder, financeToday, parseMoney } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { resolveAccountId } from '../lib/resolve'
import { stringifyJson } from '../lib/json'

function print(value: unknown): void { process.stdout.write(stringifyJson(value) + '\n') }

export function registerContributionCommand(program: Command): void {
  const command = program.command('contribution').description('Shared expense advances (PEN); writes require --yes and stable request IDs')
  command.command('list').option('--due', 'only notices due today; never writes money').option('--json')
    .action(async (opts: { due?: boolean }) => {
      const rows = await getSharedContributions(await getAuthedClient())
      print(opts.due ? rows.filter(row => contributionReminder(row, financeToday()) !== null) : rows)
    })
  command.command('create <amount>')
    .requiredOption('--id <uuid>', 'stable request id; reuse after uncertain response')
    .requiredOption('--person <name>').requiredOption('--note <text>').requiredOption('--category <id>')
    .requiredOption('--notice <YYYY-MM-DD>').requiredOption('--due <YYYY-MM-DD>').option('--yes').option('--json')
    .action(async (raw: string, opts: { id: string; person: string; note: string; category: string; notice: string; due: string; yes?: boolean }) => {
      if (!opts.yes) throw new Error('Review amount, category and dates; pass --yes to confirm')
      print(await createSharedContribution(await getAuthedClient(), {
        id: opts.id, amount: parseMoney(raw), contributor: opts.person, description: opts.note,
        categoryId: opts.category, noticeDate: opts.notice, dueDate: opts.due,
      }))
    })
  for (const action of ['receive', 'settle', 'return', 'cancel'] as const) {
    const sub = command.command(`${action} <id>`)
      .requiredOption('--request-id <uuid>', 'reuse this exact id and payload after an uncertain response')
      .requiredOption('--date <YYYY-MM-DD>').option('--yes').option('--json')
    if (action !== 'cancel') sub.requiredOption('--account <name|id>')
    if (action === 'settle') sub.requiredOption('--bill <amount>', 'full bill to pay (not already registered)')
    sub.action(async (id: string, opts: { requestId: string; date: string; account?: string; bill?: string; yes?: boolean }) => {
      if (!opts.yes) throw new Error('Review contribution, account, amount and date; pass --yes to confirm')
      const client = await getAuthedClient()
      print(await actOnContribution(client, { id, requestId: opts.requestId, action,
        date: opts.date, accountId: opts.account ? await resolveAccountId(client, opts.account) : undefined,
        billAmount: opts.bill ? parseMoney(opts.bill) : undefined }))
    })
  }
}
