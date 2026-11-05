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
- `categorise.ts` (pure): categories, in this order (first match wins):
  1. the user's tag for the payee;
  2. rules (event type, ATM, card bill, EMI, investing, tax, life cover, rent);
  3. the merchant list;
  4. an earlier AI tag;
  5. otherwise `uncategorised`.

  Credits are income, refund, investment or self transfer, never spending.
  `payeeKey` normalises a payee so tags apply to every payment to it.
- `aiPayeeTagger.ts`: the AI fallback. It sends payee names only (PII-redacted),
  at most 40 per sync, biggest spend first. It is skipped when AI is off or the
  monthly AI budget is used up. Answers are stored per payee (`SpendPayeeTag`,
  source `model`), so each payee is asked about once.
- `spendCategorisation.ts`: applies categories after every sync.
  - `listUncategorisedPayees` is the "tag your top 5" list.
  - `setPayeeCategory` saves the user's tag, which always wins, and re-sorts
    past payments.
  - HTTP: `GET /api/spending/payees/uncategorised`, `PUT /api/spending/payees/category`.
- `spendAnalysis.ts` (pure) and `spendAnalysisStore.ts` (writes it), after
  each sync and each re-tag:
  - **Recurring series:** same payee, regular cadence. Monthly 24–37 days
    apart, quarterly 84–100, annual 355–375. At least 3 payments (2 for
    annual), 75% of gaps regular. "Fixed" when 80% of neighbouring payments
    are within ±10%. A payment over 3× the payee's usual amount stays out of
    the series.
  - **One-offs:** a basket payment over 3× its category's median month, not
    in a series, once the category has 3 months of history.
  - **Refunds:** matched to the latest earlier payment to the same payee
    within 60 days that is at least as large, and netted off its category in
    the refund month.
  - **`SpendMonthlyCategory`:** monthly totals for every category, the
    derived store the rate engine reads.
  - **Manual matches:** a manual Personal Inflation item in the same CPI
    division as a recurring bank payment of the same yearly cost (±10%) gets
    `matchedSeriesId` ("already in your bank data"). The item itself is never
    changed; `countAnyway` lets the user count it regardless (UI in step 7).
- Categories and their CPI divisions: `@everypaisa/shared` `spendCategories.ts`.
- `jobs/spendingJob.ts`: nightly 03:15 IST, plus a one-off backfill after the
  first boot of each version (`AppSetting` `spending.backfill.v3`). Disable both
  with `ENABLE_SPENDING_SYNC=false`.

Nothing on screen reads this store yet. Personal Inflation (step 6) and
Safe-to-Invest (step 8) switch to it later. 
