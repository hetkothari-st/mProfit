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
- Items pinned at 0% are "fixed payments": they count in the personal rate but
  are kept out of `byDivision`, so an EMI never makes housing or education look flat.
- `inflationGoals.ts` — per active goal: target (today's rupees) grown at the
  suggested rate vs official headline CPI, the gap, and the extra monthly SIP
  (`goalMath.requiredMonthlySip`, at the goal's expected return). Re-plan
  recomputes rates server-side and writes them to the chosen goals. Both are
  gated on `GOAL_PROJECTIONS`, like `/api/goals`.
