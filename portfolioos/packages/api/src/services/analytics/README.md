# services/analytics/

Portfolio performance and dashboard numbers.

- `dashboard.service.ts` — net worth for the dashboard (own and family scope).
- `analytics.service.ts` — KPIs, allocation by class, treemap, top winners/losers.
- `xirr.service.ts`, `xirr.reliability.ts` — XIRR (portfolio, holding, user, rolling) and Modified Dietz; when an XIRR is trustworthy.
- `analytics.risk.ts` — volatility, drawdown, correlation between asset classes.
- `analytics.benchmark.ts`, `analytics.priceBackfill.ts` — benchmark (Nifty) series and the historical prices they need.
- `analytics.insights.ts` — LLM-written, descriptive-only monthly narrative.
- `netWorthHistory.service.ts` — the net-worth-over-time series (snapshots from `jobs/netWorthSnapshotJob.ts`).
- `healthScore.service.ts`, `healthScoreMath.ts` — the 0–100 financial health score.
- `riskProfileMath.ts` — risk-profile questionnaire scoring.
- `whatIf.service.ts`, `whatIfMath.ts` — what-if simulations.
- `cashflowForecast.service.ts` — upcoming cash-flow forecast.

HTTP: `routes/dashboard.routes.ts`, `routes/analytics.routes.ts`, `routes/intelligence.routes.ts`.
