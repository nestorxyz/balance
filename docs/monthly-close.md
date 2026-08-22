# Monthly close

Balance uses a hybrid close: preparation is automatic and read-only; the final
accounting close is always confirmed by the user.

## Lifecycle

1. From the 28th through month end, `bal close due` checks the current month.
2. From the 1st through the 3rd, it checks the previous month.
3. A month is ready only after it ended, has activity, is reconciled, has no
   uncategorized flows, and has no unpaired transfers.
4. `bal close month --month YYYY-MM` creates an immutable revision after an
   interactive confirmation. Non-interactive execution requires `--yes`.
5. A transaction added to a closed month changes its fingerprint. Balance then
   reports `amendment_required`; the original close remains unchanged and the
   next confirmed close becomes revision 2, 3, and so on.

Each close stores the server-read source accounts, categories and transactions,
the validation result, the transaction fingerprint, and the four financial
reports rendered at close time.

## Scheduling the safe part

The scheduled command never writes ledger or close state:

```sh
bal close due --json
```

It is safe to run daily from a local scheduler or Codex automation. The machine
and the configured Balance CLI session must be available. Do not schedule
`bal close month --yes`; final close confirmation is an accounting approval.

## Manual operations

```sh
bal close check --month 2026-08 --json
bal close month --month 2026-08
bal close list --json
bal close show --month 2026-08 --json
```
