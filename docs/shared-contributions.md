# Shared expense advances (PEN)

Status: staging validated; production release authorized on 2026-08-31.
Scope: one contributor and one full receipt per request; no real ledger data was
used to test this feature. The repository's GSD requirement was bypassed with the
user's explicit approval; planning and validation were retained.

## Accounting contract

For an expected advance of S/30 and a full bill of S/100:

| Action | Bank/cash | Dedicated payable | Expense net | Income |
| --- | ---: | ---: | ---: | ---: |
| Create notice | 0 | 0 | 0 | 0 |
| Receive | +30 | -30 | 0 | 0 |
| Settle bill | -100 | +30 | 70 | 0 |
| Return instead of settling | -30 | +30 | 0 | 0 |

The payable is on-budget, so receipt does not increase net worth or accumulated
income. Settlement records a full expense in the payment account and a matching
`refund` in the holding payable, in the same category and on the same date.
The refund represents application of the advance, not a second bank receipt.
Existing reports/budgets therefore show only the user's share. A receipt in one
month and payment in another leaves a liability at the first month's end; the
second month contains the net personal expense. Raw bank saldo includes reserved
funds; banners on Cuadrar, Movimientos and Presupuesto explicitly disclose this.

States: pending → received → applied OR returned. Pending can be cancelled.
Received funds cannot be cancelled without a real return. Applied operations
cannot be undone individually: doing so would break the event history. Corrections
after settlement require a separately reviewed compensating workflow; not yet a
self-service feature. Do not manipulate the holding account manually.

## Web

`/aportes` lists notices, dates, states, reserved total and immutable event history.
Create a notice with the agreed amount/category/date. Each financial operation
asks for an explicit bank/cash account, actual date and confirmation.
Settlement creates a NEW bill payment: do not use it for a bill already recorded
in Movimientos. First version supports full receipts, full returns, and one bill
per contribution; partial installments/multiple contributors are intentionally
not exposed. Only active personal on-budget PEN bank/cash accounts are accepted.

On uncertain responses, retry the same form/request, which retains its UUID and
payload. If the page was closed, inspect the list/history before recreating a
request. Do not reuse an operation id with changed data.

## CLI

All amounts are decimal PEN at the CLI and integer minor units in core/SQL.
`--json` emits amounts as exact decimal strings. For writes, review details and
pass `--yes`; `--account` is mandatory for receive/settle/return. UUIDs below are
placeholders to generate once per request, not literal values to execute.

```sh
bal contribution list --json
bal contribution list --due --json
bal contribution create 30 --id REQUEST_UUID --person "Neighbor" --note "September light" --category CATEGORY_ID --notice 2026-09-20 --due 2026-09-27 --yes --json
bal contribution receive CONTRIBUTION_UUID --request-id RECEIPT_UUID --account "Bank" --date 2026-09-22 --yes --json
bal contribution settle CONTRIBUTION_UUID --request-id BILL_UUID --account "Bank" --bill 100 --date 2026-09-25 --yes --json
bal contribution return CONTRIBUTION_UUID --request-id RETURN_UUID --account "Bank" --date 2026-09-25 --yes --json
bal contribution cancel CONTRIBUTION_UUID --request-id CANCEL_UUID --date 2026-09-21 --yes --json
```

The last three commands represent alternative paths, not a sequence to execute.
Day 20/27 are user-entered notice/deadline dates; `list --due` uses America/Lima and
is read-only. UI notices are automatic when opening the page, but no background
email/push notification or recurring job has been installed. A scheduler may call
`list --due`; choose delivery channel and cadence before enabling it. Never schedule
receive/settle/return, as they require human confirmation of real cash movements.

## Integrity and security

SQL RPCs are atomic; contribution row locks serialize state transitions and
request locks provide retry idempotency. Changed payloads for an existing UUID
fail. All operations check `auth.uid()`, account ownership, status, currency,
budget scope, category ownership, dates and holding balance. Private helpers and
the original undo implementation cannot be called by anonymous/authenticated
roles. Tables expose owner-only reads, with no direct mutation grants. Ledger
rows contain the contribution ID; event rows contain both transaction IDs.
Export and the daily-backup code include the new records (backup function must
be redeployed). This is not a claim that a production backup was run.

## Validation and remaining gates

- Real PostgreSQL 15, isolated Unix socket and empty throwaway DB: 32 assertions
  using real table/function migrations, a minimal auth shim and synthetic data.
  Covers receipt, settlement, return, cancel, retry, conflict, wrong owner/currency,
  future dates, atomic failure, two-month budget accounting, delta zero, RLS,
  mutation denial and protected undo.
- Two concurrent requests with the same operation UUID were executed in separate
  PostgreSQL sessions; two further assertions confirmed only one event and one
  transfer pair were persisted.
- Core tests: date boundaries, reminders, reserved balance, RPC payloads, report
  netting and decimal JSON. CLI tests enforce confirmation and exact amounts.
- React component tests: explicit account, confirmation, undersized bill rejection,
  safe retry, notice creation. Typecheck and production build pass.
- The SQL harness is `tests/sql/contributions-isolated.sql`, outside the pgTAP
  directory because it bootstraps its own schema. Run only against an EMPTY
  throwaway PostgreSQL database using `psql -v ON_ERROR_STOP=1 -f ...`.
- The full Supabase migration chain, local Edge backup, export and signed-in web
  flow passed with synthetic data. Desktop and mobile visual QA passed.
  See `RESULT.md` for exact checks and the local-only backup environment adapter.
- Database types were regenerated from the full migrated local schema.
- Release order: review diff, migrate DB first, redeploy backup function, then CLI and web.
  Smoke-test with a synthetic staging owner, including export/backup, before
  enabling real contributions. Do not reset the production database.
- Known repository warnings: large web bundle; one low-severity npm advisory.
  Existing core test discovery includes both source and compiled tests, so do not
  treat duplicated runner counts as unique test coverage.
