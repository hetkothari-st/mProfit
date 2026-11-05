# services/spending/

The spending store: one normalised row (`SpendTxn`) per bank or card movement,
whatever the source. Step 1 of `docs/plans/2026-11-05-pir-spending-pipeline.md`.

- `spendTypes.ts`: `NormalisedTxn` (the one shape every source emits) and the
  `SpendSource` interface. A new source (statements, Finvu) implements
  `fetch(userId)` and is added to `SPEND_SOURCES`. Nothing downstream changes.
- `sources/canonicalEventSource.ts`: approved bank and card alert events
  (`CONFIRMED`/`PROJECTED`). Anything pending, rejected or failed is left out.
- `dedupe.ts` (pure): the same payment from two kinds of source (alert and
  statement) is kept once. The better source wins (Finvu > statement > alert >
  manual). Matching needs the same account, direction and exact amount, at most
  1 day apart. Same-source rows are never merged.
- `spendingSync.ts`: `syncSpending(userId)` rebuilds a user's rows. It is
  idempotent, removes rows whose source row is gone, labels own transfers
  (`excludeReason = self_transfer`, reusing Safe-to-Invest's name rule), and
  marks duplicates rather than deleting them. `listSpending` reads rows with
  duplicates left out.
- `jobs/spendingJob.ts`: nightly 03:15 IST, plus a one-off backfill after the
  first boot (`AppSetting` `spending.backfill.v1`). Disable both with
  `ENABLE_SPENDING_SYNC=false`.

Nothing reads this store yet. Personal Inflation (step 6) and Safe-to-Invest
(step 8) switch to it later. Categories and recurring series are added in
steps 4 and 5.
