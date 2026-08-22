import type { Command } from 'commander'
import {
  closeMonth,
  getMonthClose,
  getMonthCloseHistory,
  getMonthClosePreflight,
  scheduledCloseMonths,
  type MonthClosePreflight,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { isInteractive, promptConfirm } from '../lib/interactive'
import { isYearMonth } from '../lib/period'

function assertMonth(month: string): void {
  if (!isYearMonth(month)) fail(`invalid month: ${month}. Expected YYYY-MM`)
}

function renderPreflight(preflight: MonthClosePreflight): void {
  process.stdout.write(`Cierre ${preflight.month}: ${preflight.state}\n`)
  for (const check of preflight.checks) {
    process.stdout.write(`  ${check.passed ? '✓' : '✗'} ${check.label}${check.value == null ? '' : ` (${check.value})`}\n`)
  }
  if (preflight.state === 'amendment_required') {
    process.stdout.write(`  Revisión ${preflight.latest_revision + 1} requerida: el ledger cambió desde el cierre.\n`)
  }
}

function registerCheck(group: Command): void {
  group.command('check')
    .description('Run the read-only monthly close preflight')
    .requiredOption('--month <YYYY-MM>', 'month to validate')
    .option('--json', 'output JSON')
    .action(async (opts: { month: string; json?: boolean }) => {
      assertMonth(opts.month)
      const preflight = await getMonthClosePreflight(await getAuthedClient(), opts.month)
      if (opts.json) process.stdout.write(`${JSON.stringify(preflight)}\n`)
      else renderPreflight(preflight)
    })
}

function registerMonth(group: Command): void {
  group.command('month')
    .description('Create an immutable close (or amendment) after preflight')
    .requiredOption('--month <YYYY-MM>', 'month to close')
    .option('--yes', 'close without an interactive confirmation')
    .option('--json', 'output JSON')
    .action(async (opts: { month: string; yes?: boolean; json?: boolean }) => {
      assertMonth(opts.month)
      const client = await getAuthedClient()
      const preflight = await getMonthClosePreflight(client, opts.month)
      if (!preflight.ready) {
        if (opts.json) process.stdout.write(`${JSON.stringify(preflight)}\n`)
        else renderPreflight(preflight)
        fail(`month ${opts.month} is not ready to close`)
      }

      let confirmed = opts.yes === true
      if (!confirmed && isInteractive() && !opts.json) {
        renderPreflight(preflight)
        confirmed = await promptConfirm(
          `Cerrar ${opts.month} como revisión ${preflight.latest_revision + 1}?`,
          false,
        )
      }
      if (!confirmed) fail('closing requires interactive confirmation or --yes')

      const result = await closeMonth(client, opts.month)
      if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`)
      else process.stdout.write(`Cierre ${opts.month} revisión ${result.revision} guardado.\n`)
    })
}

function registerList(group: Command): void {
  group.command('list')
    .description('List immutable monthly closes and amendments')
    .option('--limit <n>', 'max rows', '24')
    .option('--json', 'output JSON')
    .action(async (opts: { limit: string; json?: boolean }) => {
      const limit = Number.parseInt(opts.limit, 10)
      if (!Number.isFinite(limit) || limit <= 0) fail(`invalid --limit: ${opts.limit}`)
      const rows = await getMonthCloseHistory(await getAuthedClient(), limit)
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(rows)}\n`)
        return
      }
      if (rows.length === 0) process.stdout.write('(no monthly closes)\n')
      for (const row of rows) {
        process.stdout.write(`${row.period.slice(0, 7)}  revision ${row.revision}  ${row.transaction_count} movements  ${row.closed_at}\n`)
      }
    })
}

function registerShow(group: Command): void {
  group.command('show')
    .description('Show one immutable monthly close')
    .requiredOption('--month <YYYY-MM>', 'closed month')
    .option('--revision <n>', 'specific revision (default latest)')
    .option('--json', 'output JSON')
    .action(async (opts: { month: string; revision?: string; json?: boolean }) => {
      assertMonth(opts.month)
      const revision = opts.revision == null ? undefined : Number.parseInt(opts.revision, 10)
      if (revision != null && (!Number.isFinite(revision) || revision <= 0)) {
        fail(`invalid --revision: ${opts.revision}`)
      }
      const row = await getMonthClose(await getAuthedClient(), opts.month, revision)
      if (opts.json) process.stdout.write(`${JSON.stringify(row)}\n`)
      else {
        process.stdout.write(`Cierre ${row.period.slice(0, 7)} revisión ${row.revision}\n`)
        process.stdout.write(`Movimientos: ${row.transaction_count}\nCerrado: ${row.closed_at}\n`)
      }
    })
}

function registerDue(group: Command): void {
  group.command('due')
    .description('Run scheduled read-only preflights due today (days 28-3)')
    .option('--json', 'output JSON')
    .action(async (opts: { json?: boolean }) => {
      const months = scheduledCloseMonths(new Date())
      const client = await getAuthedClient()
      const rows = await Promise.all(months.map((month) => getMonthClosePreflight(client, month)))
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(rows)}\n`)
        return
      }
      if (rows.length === 0) {
        process.stdout.write('No monthly close preflight is due today.\n')
        return
      }
      for (const row of rows) renderPreflight(row)
    })
}

export function registerCloseCommand(program: Command): void {
  const group = program.command('close').description('Prepare and close accounting months')
  registerCheck(group)
  registerDue(group)
  registerMonth(group)
  registerList(group)
  registerShow(group)
}
