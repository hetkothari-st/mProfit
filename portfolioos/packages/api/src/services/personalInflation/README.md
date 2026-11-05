# services/personalInflation/

Personal inflation rate: official MoSPI CPI weighted by the user's own spending basket.

- `personalInflationMath.ts` — pure math: long-run rate from YoY readings, CAGR from an item's price history, rate resolution (history → custom → official division → headline), spend-weighted rate, projections.
- `personalInflation.service.ts` — official rates for a state/sector from `CpiObservation`, the summary, and basket CRUD.

Data: `jobs/cpiJob.ts` (daily 07:00 IST) fills `CpiObservation` via `priceFeeds/mospiCpi.v1.ts` + `mospiCpi.parse.ts`.
HTTP: `routes/personalInflation.routes.ts` (`/api/personal-inflation`, admin `/api/admin/cpi/refresh`).

## Adding from the user's data and goal impact

- `inflationSources.ts` — active loan EMIs, insurance premiums and owner-occupied
  maintenance offered as basket items. Amounts are copied when added (not kept
  in sync). `sourceRef` (`loan:<id>` …) plus the unique index on
  `(userId, sourceRef)` stops the same source being added twice. EMIs and level
  life premiums go in at a custom 0%.
- Loan EMIs and life-cover premiums (`isOutsideBasket`) are listed but left out
  of the basket: not in the personal rate, the shares or the totals. They repay
  the same loan or buy the same cover, so they are not prices that rise
  (PERSONAL_INFLATION_SPEC §5). Health and motor premiums stay in.
- `inflationGoals.ts` — per active goal: target (today's rupees) grown at the
  suggested rate vs official headline CPI, the gap, and the extra monthly SIP
  (`monthlySipFor`: start-of-month SIP, equivalent monthly rate, at the goal's
  expected return or 12%). Re-plan
  recomputes rates server-side and writes them to the chosen goals. Both are
  gated on `GOAL_PROJECTIONS`, like `/api/goals`.

## Against the product spec

`PERSONAL_INFLATION_SPEC.md` (the product reference) builds the basket from
categorised bank spending. That pipeline is planned in
`docs/plans/2026-11-05-pir-spending-pipeline.md`.

## Rate from bank spending (`pirEngine.ts`, `pirBankData.ts`)

- `pirEngine.ts` is pure (spec §6): weights from the last 12 complete months
  of `SpendMonthlyCategory`; each category at its CPI division's long-run rate,
  blended by α with the user's own price change on fixed recurring payments
  seen in both the current and previous 12 months; step changes (> +25% or
  < −10%) fall back to CPI until the user confirms (`acceptOwnRate`);
  confidence = months/12 × categorised share × account coverage (1 with a
  salary account visible, else 0.6), less 0.1 when card bills are counted
  without card purchases.
- `getSummary` uses the bank picture only when confidence ≥ 0.6
  (`rateBasis: 'bank'`). Then manual items a recurring bank payment matches are
  set aside (`coveredByBank`) unless `countAnyway`; all other manual items
  still count. Below 0.6 the rate stays on the manual items (`low_confidence`),
  or is empty (`building`). Manual items are never changed.
- Overrides without a release: AppSetting `personalInflation.categoryCpiMap`
  (category → division) and `personalInflation.engine` (parameters). One deliberate difference: rates are the 5-year
compounded average of yearly CPI changes, not the latest 12-month change, so a
10-year projection does not swing with one month's reading. The latest
12-month figure is shown next to it.
