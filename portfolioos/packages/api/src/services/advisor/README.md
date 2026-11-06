# services/advisor/

The AI adviser: rule-based recommendations, with LLM-written prose layered on top.

- `advisorEngine.service.ts` — the orchestrator. Builds facts once (`advisorFacts.builder.ts`), runs every rule in `rules/`, and reconciles the drafts with what the user already has.
- `rules/` — one rule per recommendation kind (rebalance drift, cash deployment, goal shortfall SIP, tax-loss harvest, …).
- `advisorProse.service.ts`, `advisorSystemPrompt.ts`, `proseConsistency.ts` — LLM prose, plus the guard that keeps it consistent with the rules' numbers.
- `modelPortfolio*.ts`, `allocationMath.ts`, `assetBuckets.ts`, `riskProfile.service.ts` — target allocation and the user's risk profile.
- `approvedProducts.service.ts`, `productResolution.ts`, `fallbackRanking*.ts`, `fundRanking/` — which funds may be recommended, and how they're ranked (methodology reports live in `fundRanking/`).

Jobs: `jobs/fundScoring.job.ts`, `jobs/mfProseJob.ts`. HTTP: `routes/advisor.routes.ts`.

Act on it (`services/actOnIt/README.md`): every draft also carries a headline,
a promise and a measurement (`actOnItDraft.ts`); the Act on it types are in
`rules/` (idle cash, regular→direct, gain booking, stopped SIP, FD maturing,
loan refinance, advance tax, emergency fund, health cover, weak fund) with
their inputs in `actOnItFacts.builder.ts`; `reconcile.ts` settles conflicts.
