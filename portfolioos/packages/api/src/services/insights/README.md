# services/insights/

Rule-based (deterministic) insights: no LLM, the same input always gives the same insight.

- `deterministicInsights.ts` — generators such as FD maturity and tax-loss-harvest insights.
- `deterministicInsightsRules.ts` — the rule definitions they evaluate.
- `insightActions.ts` — the call-to-action attached to each insight category.

The LLM-written narrative lives separately in `services/analytics/analytics.insights.ts`. HTTP: `routes/analytics.routes.ts`.
