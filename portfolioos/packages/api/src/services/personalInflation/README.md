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
`docs/plans/2026-11-05-pir-spending-pipeline.md`; until it lands the basket is
the expenses the user adds. One deliberate difference: rates are the 5-year
compounded average of yearly CPI changes, not the latest 12-month change, so a
10-year projection does not swing with one month's reading. The latest
12-month figure is shown next to it.
