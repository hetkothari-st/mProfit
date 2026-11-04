# services/personalInflation/

Personal inflation rate: official MoSPI CPI weighted by the user's own spending basket.

- `personalInflationMath.ts` — pure math: long-run rate from YoY readings, CAGR from an item's price history, rate resolution (history → custom → official division → headline), spend-weighted rate, projections.
- `personalInflation.service.ts` — official rates for a state/sector from `CpiObservation`, the summary, and basket CRUD.

Data: `jobs/cpiJob.ts` (daily 07:00 IST) fills `CpiObservation` via `priceFeeds/mospiCpi.v1.ts` + `mospiCpi.parse.ts`.
HTTP: `routes/personalInflation.routes.ts` (`/api/personal-inflation`, admin `/api/admin/cpi/refresh`).
