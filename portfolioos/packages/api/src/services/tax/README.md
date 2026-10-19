# services/tax/

Capital gains and income-tax computations.

- `capitalGains.service.ts` — FIFO capital-gain matching, STCG/LTCG/intraday classification, grandfathering (31 Jan 2018) and indexation rules.
- `tax.service.ts` — the user-facing tax reports (STCG, LTCG, intraday) per financial year.
- `taxComputation.ts` — applies rates to gains (statutory CG rates, slab rate where the law says so).
- `advanceTax.service.ts`, `advanceTaxMath.ts` — advance-tax instalment schedule and report.
- `taxHarvestMath.ts` — tax-loss harvesting savings.
- `fmvOverride.service.ts` — per-user overrides of the 31-Jan-2018 fair market value used for grandfathering.

HTTP: `routes/tax.routes.ts`, plus `fmv.controller.ts`. Tests: `test/services/tax/` and colocated `*.test.ts`.
