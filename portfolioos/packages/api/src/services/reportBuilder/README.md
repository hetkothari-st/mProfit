# services/reportBuilder/

The PDF/Excel report layout engine (the mProfit-style banded reports).

- `dashboardReport.ts`, `holdingsReport.ts` — full-page reports.
- `statement/` — statement builders: capital gains, tax report, holdings, income, ledger, PF.
- `special/` — special reports.
- `tally/accountGroupMapping.ts` — maps accounts onto Tally's reserved groups. The rest of the Tally export is in `services/accounting/tally/`.
- `mprofitStyle.ts` — the shared banded layout.

The data behind most reports comes from `services/reports/`. HTTP: `routes/reports.routes.ts`, `routes/tax.routes.ts`.
