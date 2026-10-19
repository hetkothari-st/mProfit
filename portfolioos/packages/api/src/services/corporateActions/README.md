# services/corporateActions/

Splits, bonuses, dividends and other corporate actions.

- `corporateActionApply.service.ts` — applies corporate actions to a user's portfolios, then holdings are re-projected.
- `corporateActionsReport.service.ts` — the corporate-actions report.

Job: `jobs/corporateActionApplyJob.ts`. Feed: `priceFeeds/corporateActions.service.ts`. HTTP: `routes/corporateActions.routes.ts`.
