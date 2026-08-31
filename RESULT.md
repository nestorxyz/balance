# Shared contributions — 2026-08-31

Branch: `codex/shared-contributions`, based on `741c485` from `nestorxyz/balance`.
User approved continuing without the unavailable GSD commands.

Implemented: atomic contribution lifecycle with dedicated payable account,
owner-only read policies, immutable event history, idempotent requests, guarded
individual undo, web forms and CLI confirmation gates, reserved-funds banners,
PEN decimal serialization, export/backup coverage, due-date notices in Lima time.

Validation:
- `npm run typecheck`: passed.
- `npm test`: passed; source core 58, CLI 67, web 9 tests. Core dist duplicates
  also run by existing config; not counted as additional coverage.
- `npm run build`: passed; existing large bundle warning remains.
- Isolated PostgreSQL 15 real migration tests: 32 assertions passed.
- Two concurrent same-key receipts: one event/one transfer pair; 2 assertions passed.
- `node apps/cli/dist/index.js contribution --help`: passed.
- `git diff --check`: passed.

Integrated local Supabase validation (2026-08-31):
- Entire migration chain and seed applied successfully on PostgreSQL 17.
- Authenticated API: concurrent same-key receipt, settlement across months,
  return, duplicate settlement rejection, anonymous denial and export passed.
- Found and fixed report refund signs: refunds increase the affected account
  and reverse expense journal entries. Added a cross-month regression covering
  liability settlement and a normal asset-account refund.
- Browser: signed in with synthetic user; received 30 and settled bill 100.
  Contribution became applied and reserved amount became zero. API readback:
  net worth 360.00, liabilities zero, reconciliation delta zero after two cases.
- Desktop and 390px mobile screenshots inspected; mobile scroll width 390px.
  New contribution displays and confirmations now explicitly format PEN.
- Local daily-backup returned 200; downloaded Storage JSON matched export IDs
  for all transactions, three contributions and six events. No-auth call: 401.
  IMPORTANT: stock local runtime initially returned 500 because it injects
  SUPABASE_SERVICE_ROLE_KEY while the existing helper expects SECRET_KEY(S).
  Only the temporary staging copy used a legacy-variable adapter. Production
  helper was NOT changed. Deployment must verify the hosted secret variable.
- All data synthetic; local API, database and mail ports bound to loopback.

At completion of staging, no production changes or live financial writes had
been made. Release preparation on 2026-08-31: full database types regenerated,
typed contribution RPC arguments and export tables enabled; typecheck, unit tests,
build, 310 engine tests and diff check passed. Production dry-run lists only the
shared-contribution migration; hosted SECRET_KEYS and CRON_SECRET exist.
Apply migration before publishing web/CLI/backup function. Local backup validation is
not evidence that a production cron schedule exists or is working. External
scheduled notifications, partial receipts, and post-settlement corrections are
not implemented; see `docs/shared-contributions.md` for the supported boundary.
