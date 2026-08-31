import { createRequire } from 'node:module'
import { Command } from 'commander'
import { registerContributionCommand } from './commands/contribution'
import { registerAccountCommand } from './commands/account'
import { registerAddCommand } from './commands/add'
import { registerBalanceCommand } from './commands/balance'
import { renderBanner } from './commands/banner'
import { registerBucketsCommand } from './commands/buckets'
import { registerCategoryCommand } from './commands/category'
import { registerCloseCommand } from './commands/close'
import { registerDebtCommand } from './commands/debt'
import { registerExportCommand } from './commands/export'
import { registerFintualCommand } from './commands/fintual'
import { registerBudgetCommand } from './commands/budget'
import { registerInboxCommand } from './commands/inbox'
import { registerKeyCommand } from './commands/key'
import { registerListCommand } from './commands/list'
import { registerLoginCommand } from './commands/login'
import { registerPatrimonioCommand } from './commands/patrimonio'
import { registerReceivableCommand } from './commands/receivable'
import { registerRecurringCommand } from './commands/recurring'
import { registerRulesCommand } from './commands/rules'
import { registerSnapshotCommand } from './commands/snapshot'
import { registerSyncCommand } from './commands/sync'
import { registerSpaCommand } from './commands/spa'
import { registerTransferCommand } from './commands/transfer'
import { registerUndoCommand } from './commands/undo'
import { loadBackendConfigIntoEnv } from './lib/config'
import { formatError } from './lib/exit'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const program = new Command()

program
  .name('bal')
  .description('Balance CLI — personal finance assertion + reconciliation')
  .version(version)

registerLoginCommand(program)
registerContributionCommand(program)
registerKeyCommand(program)
registerAddCommand(program)
registerBalanceCommand(program)
registerBucketsCommand(program)
registerInboxCommand(program)
registerListCommand(program)
registerRulesCommand(program)
registerSyncCommand(program)
registerTransferCommand(program)
registerUndoCommand(program)
registerAccountCommand(program)
registerDebtCommand(program)
registerReceivableCommand(program)
registerCategoryCommand(program)
registerCloseCommand(program)
registerBudgetCommand(program)
registerRecurringCommand(program)
registerSnapshotCommand(program)
registerExportCommand(program)
registerFintualCommand(program)
registerSpaCommand(program)
registerPatrimonioCommand(program)

async function main(): Promise<void> {
  loadBackendConfigIntoEnv()
  if (process.argv.length <= 2) {
    process.stdout.write(await renderBanner())
    return
  }
  await program.parseAsync(process.argv)
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${formatError(err)}\n`)
  process.exit(1)
})
