# MF Analytics Layer — Design & Implementation Docs

> Drop this folder at `docs/mf-analytics/` in the PortfolioOS repo. These files are
> written for Claude Code. Read `CONTEXT.md` at the repo root **first**; every rule
> there applies here without exception. This doc set only adds what is specific to
> the mutual fund analytics layer.

## What this layer is

A company-grade research and advice layer on top of the existing mutual fund
holdings (MF Central, CAS mailback, CASParser, Finvu AA). For every fund a user
holds it produces:

- a **score** (0–100) and **rating** (1–5) relative to the fund's SEBI category
- a full **quantitative profile** across 1/3/5/7/10-year horizons
- **findings** — typed, evidenced observations with a "what would change this" clause
- a **verdict** (`HOLD` / `MONITOR` / `REVIEW` / `SWITCH_CANDIDATE`), gated
- portfolio-level analysis: user's real XIRR, overlap, look-through exposure,
  weighted cost, tax lots, goal fit
- LLM-written **prose** that is verified against the numbers before display

It follows the advisor-engine architecture already in the repo: deterministic
rules over immutable facts, LLM writes prose only, history is never rewritten.

## Reading order

| File | Purpose |
|---|---|
| `00-README.md` | this file — orientation, invariants, glossary |
| `01-DATA-FOUNDATION.md` | sources, Prisma schema, feeds, jobs, validation |
| `02-METRICS.md` | every metric, its formula, edge cases, tests |
| `03-SCORING.md` | category models, weights, percentiles, rating buckets, versioning |
| `04-PORTFOLIO-ANALYSIS.md` | user-level analysis (XIRR, overlap, look-through, tax, goals) |
| `05-FINDINGS-ENGINE.md` | rules, `Finding` type, verdict decision table, prose pipeline |
| `06-QUALITY-COMPLIANCE.md` | validation, reconciliation, backtest, SEBI gating |
| `07-IMPLEMENTATION-PLAN.md` | phased tasks with acceptance criteria — the work queue |

## Invariants specific to this layer

These extend `CONTEXT.md §3`. They are enforced by tests listed in
`06-QUALITY-COMPLIANCE.md`.

1. **Fund-level data is reference data; user-level analysis is user data.**
   `MfSchemeMeta`, `MfNav` (existing), `MfPortfolioSnapshot`, `BenchmarkIndexPrice`,
   `MfSchemeMetrics`, `MfSchemeScore` are shared market data — *not* in
   `USER_SCOPED_MODELS`, no RLS policy. `MfAnalysisRun`, `MfFinding`,
   `MfFundVerdict` are user-scoped — RLS policy **and** `USER_SCOPED_MODELS`
   registration in the same change.

2. **No score without sufficient history.** A scheme with < 36 months of NAV
   history gets metrics where computable and `rating: null` with
   `ratingStatus: 'INSUFFICIENT_HISTORY'`. Never interpolate a rating.

3. **Peer ranks are computed against the full category universe**, not against
   the schemes our users happen to hold. Direct and regular plans rank in
   separate universes.

4. **Every metric carries `asOf` and `status`.** Status is one of
   `OK | INSUFFICIENT_DATA | BENCHMARK_UNAVAILABLE | STALE | QUARANTINED`. A
   consumer that receives a non-`OK` metric renders it as unavailable, never as
   zero. This mirrors the `cii_unavailable` pattern in `capitalGains.service.ts`.

5. **Rules never query.** They receive `MfAnalysisFacts` and return `Finding[]`.
   A rule that needs data the facts do not carry is a facts-builder change, not
   a rule change.

6. **Prose never introduces a number.** Every numeric token in generated prose
   must exist in the findings it was generated from. Verified by
   `proseConsistency.ts` (existing) extended for this domain.

7. **Scores and verdicts are append-only.** A re-run writes a new row with
   `methodologyVersion`; the previous row is never edited. A verdict that
   changes gets a new row with the old row's `supersededById` set.

8. **Verdicts are advice; analytics are research.** The verdict layer is gated
   by `RIA_VERDICTS_ENABLED` at the deployment level in addition to the
   `ADVICE_ENGINE` entitlement. See `06-QUALITY-COMPLIANCE.md §4`.

9. **Benchmarks are Total Return Indices.** Price-return indices are rejected at
   ingest. Alpha against a PRI is systematically overstated and is a bug.

10. **Money and percentages stay `Decimal`.** Returns, ratios and weights are
    `Decimal` strings at the boundary via `serializeMoney` / a new
    `serializeRatio`. `parseFloat` remains a lint error. `moneyToNumber` only
    for chart geometry.

## Glossary

| Term | Meaning |
|---|---|
| TER | Total Expense Ratio, annual %, from AMC disclosure |
| TRI | Total Return Index (dividends reinvested) |
| IDCW | Income Distribution cum Capital Withdrawal (formerly "dividend" option) |
| Rolling return | CAGR over a fixed window, computed for every start date |
| Batting average | % of months the fund beat its benchmark |
| Capture ratio | fund return / benchmark return in up (or down) benchmark months |
| Active share | ½ Σ \|w_fund − w_benchmark\| across holdings |
| HHI | Herfindahl–Hirschman Index, Σ w² across holdings |
| Category universe | all ACTIVE schemes in a SEBI sub-category and plan type |
| Pillar | a group of related inputs in the scoring model (see `03-SCORING.md`) |
| Finding | a typed, evidenced observation emitted by a rule |
| Verdict | the per-fund decision derived from findings |

## Module layout (target)

```
packages/api/src/
├── priceFeeds/
│   ├── nseIndices.ts                  TRI series for benchmark indices
│   ├── rbiRiskFree.ts                 91-day T-bill / overnight MIBOR
│   └── amfiSchemeMaster.ts            scheme master + category mapping
├── adapters/mfFactsheet/
│   ├── registry.ts                    AMC → adapter
│   ├── <amc>.parse.ts                 pure parsers, fixture-tested
│   └── <amc>.v1.ts                    fetch/DOM, versioned
├── services/mfAnalytics/
│   ├── mfMetricsMath.ts               pure metric functions (Decimal)
│   ├── mfMetrics.service.ts           orchestrates per-scheme metric computation
│   ├── mfPeerRank.service.ts          category universes + percentiles
│   ├── mfScoring/
│   │   ├── models/                    activeEquity.ts, index.ts, debt.ts, hybrid.ts
│   │   ├── mfScoreMath.ts             pillar/composite/rating math
│   │   └── mfScore.service.ts
│   ├── mfPortfolioAnalysis.service.ts XIRR, overlap, look-through, cost, tax, goals
│   ├── mfFacts.builder.ts             assembles MfAnalysisFacts
│   ├── rules/                         one file per rule
│   ├── mfVerdict.ts                   decision table
│   ├── mfAnalysisEngine.service.ts    orchestrator (mirrors advisorEngine)
│   └── types.ts
├── jobs/
│   ├── mfMetadataJob.ts               monthly
│   ├── mfHoldingsJob.ts               monthly
│   ├── mfMetricsJob.ts                nightly
│   ├── mfScoreJob.ts                  monthly (after metrics)
│   └── mfAnalysisJob.ts               per user, on holdings change
└── controllers/routes for /api/mf-analytics/*
packages/shared/src/
├── mfAnalytics.types.ts               all API-boundary types
└── ratio.ts                           serializeRatio / toRatioDecimal
```

## How to work through this with Claude Code

Work phase by phase from `07-IMPLEMENTATION-PLAN.md`. Each task in that file is
self-contained: files to touch, behaviour, tests, acceptance criteria. Do not
start a task until the previous task's tests pass. Run the API suite in the
background — it is sequential and ~26 minutes (`CONTEXT.md §12`).

After every task that touches `packages/shared`, rebuild it (`CONTEXT.md §2`).
After every frontend page, reconcile fields against `@portfolioos/shared`
(`CONTEXT.md §11`).
