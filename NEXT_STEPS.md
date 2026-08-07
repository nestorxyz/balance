# Next steps

This document tracks the next improvements planned for Balance.

## 1. Support decimal monetary amounts

**Status:** Implemented (breaking fresh-install contract)

Balance currently accepts and stores monetary amounts as integers, so users cannot
enter decimal values. Add decimal support while preserving exact arithmetic and
avoiding floating-point rounding errors.

Areas to review:

- Define the storage convention for every currency (for example, minor units such
  as cents, or PostgreSQL `numeric`).
- Update shared parsing, validation, calculations, and formatting in
  `packages/core`.
- Allow decimal input in the CLI and web app, with clear locale-aware rules for
  decimal and thousands separators.
- Update database columns, functions, migrations, and generated TypeScript types.
- Verify reconciliation, transfers, debts, installments, recurring charges,
  snapshots, imports, and exports with decimal values.
- Add unit, integration, and database tests covering precision, rounding,
  negative values, and currency conversion.
- Update user documentation and migration guidance for existing installations.

### Acceptance criteria

- Users can enter valid decimal amounts through both the CLI and web app.
- Amounts retain their exact value through storage and calculations.
- Reconciliation remains exact and does not acquire floating-point drift.
- Existing integer transaction data remains valid after the migration.
- Display and exported values use the correct precision for their currency.
