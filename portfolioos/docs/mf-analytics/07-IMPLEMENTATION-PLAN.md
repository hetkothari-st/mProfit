# 07 — Implementation Plan

Sequenced work queue for Claude Code. Each task is self-contained: what to
build, where, how to test, and what "done" means. Do not start a task until the
previous task's tests pass and `pnpm typecheck && pnpm lint` are clean. Run the
API suite in the background (`~26 min`, sequential).

Prefix every session with: *"Read `CONTEXT.md` and `docs/mf-analytics/00-README.md`,
then execute task {N} from `docs/mf-analytics/07-IMPLEMENTATION-PLAN.md`."*

Task sizes: **S** ≤ 2h, **M** ≤ 1 day, **L** 2–3 days.

---

## Phase 0 — Groundwork (S)

### Task 0.1 — Shared types and ratio primitives (S)
- Create `packages/shared/src/ratio.ts` (`Ratio`, `Pct`, `serializeRatio`,
  `toRatioDecimal`, `serializePct`, `toPctDecimal`) mirroring `decimal.ts`.
- Create `packages/shared/src/mfAnalytics.types.ts` with every DTO named in
  `01 §8`, `02 §9`, `04 §8`, `05 §1–3` (stub bodies are fine; fill as tasks land).
- Create `packages/shared/src/sebiCategories.ts`: `SEBI_SUBCATEGORY_MAP`
  (36 sub-categories → `{ sebiCategory, modelKey, capBand?, durationBand? }`).
- Extend `eslint-plugin-portfolioos/no-money-coercion` to flag `Number()` /
  `parseFloat` on identifiers typed `Ratio` / `Pct`.
- Rebuild shared. **Done when:** `pnpm typecheck` passes, lint rule test
  covers the new types.

### Task 0.2 — Entitlement + env + disclaimer (S)
- `entitlements.ts`: add `MF_ANALYTICS: 'PLUS'`.
- `config/env.ts`: add `RIA_VERDICTS_ENABLED` (boolean, default false).
- `packages/shared/src/mfAnalytics.constants.ts`: `MF_ANALYTICS_DISCLAIMER`,
  `MIN_RATING_HISTORY_MONTHS = 36`, `MIN_UNIVERSE_SIZE = 10`.
- **Done when:** existing entitlement tests pass with the new flag; env test
  covers default.

---

## Phase 1 — Data foundation (L)

### Task 1.1 — Schema migration: reference tables (M)
- Add every model from `01 §2` to `schema.prisma`, plus the `MFNav` changes.
- Migration `YYYYMMDDHHMMSS_mf_analytics_reference_tables`. No RLS on these.
- Add `test/invariants/mf-reference-not-user-scoped.test.ts`.
- **Done when:** `pnpm db:migrate` applies cleanly on a fresh DB; invariant
  test passes; `prisma generate` succeeds; existing suite unaffected.

### Task 1.2 — AMFI scheme master feed (M)
- `priceFeeds/amfiSchemeMaster.ts`: fetch, parse (pure `.parse.ts`), map to
  `MfSchemeMeta` incl. plan/option parsing and `SEBI_SUBCATEGORY_MAP`.
- `jobs/mfMetadataJob.ts` (metadata half): upsert by `schemeCode` with
  `sourceHash`; unmapped → `IngestionFailure(unmapped_sebi_category)` +
  `sebiSubCategory: 'UNMAPPED'`.
- Set `growthSiblingSchemeCode` for IDCW options.
- Fixtures: 5 AMFI master excerpts incl. edge names ("Direct Plan - IDCW
  Reinvestment", merged scheme, unmapped category).
- **Done when:** parser fixtures pass; job on a fixture file creates the
  expected rows; second run is a no-op (idempotency test).

### Task 1.3 — Benchmark indices + risk-free feeds (M)
- `priceFeeds/nseIndices.ts`, `bseIndices.ts`, `rbiRiskFree.ts` with pure
  parsers and fixtures.
- `BENCHMARK_INDEX_SEED` (list in `01 §3`) applied in a seed migration;
  `isTotalReturn` enforced (`mf-benchmark-tri-only.test.ts`).
- `jobs/benchmarkPriceJob.ts`, `jobs/riskFreeRateJob.ts`; backfill script for
  10 years (`scripts/backfill-benchmarks.ts`).
- Alert: no new benchmark row for > 3 business days.
- **Done when:** backfill populates ≥ 10y for all seeded indices locally;
  idempotency test; gap-detection unit test.

### Task 1.4 — NAV adjustments and quarantine (M)
- Extend the existing `amfi` feed/job to populate `adjustedNav` (IDCW
  reinvestment using the sibling growth NAV ratio where the payout record is
  unavailable; document the approximation) and apply the `01 §6` quarantine
  rules (`nav_jump`, `≤ 0`, weekend anomaly).
- Backfill `adjustedNav` for existing rows (`scripts/backfill-adjusted-nav.ts`).
- **Done when:** IDCW fixture (`02 §10.7`) passes; quarantine unit tests; alert
  on > 2% quarantined.

### Task 1.5 — Factsheet adapters: first three AMCs (L)
- `adapters/mfFactsheet/registry.ts` + interface (`01 §4`).
- Adapters for SBI, ICICI Pru, HDFC: `<amc>.parse.ts` (≥ 5 fixtures each —
  factsheet PDF/Excel and monthly portfolio Excel) + `<amc>.v1.ts`.
- Normalisation: ISIN → `StockMaster`, AMFI cap list seed (`AmfiMarketCapList`),
  credit rating ordinal scale.
- `jobs/mfHoldingsJob.ts` chunked per AMC; `mfMetadataJob` facts half (TER,
  AUM, managers, exit load).
- **Done when:** fixtures pass; weights-sum and TER-range validation tests;
  `AMC_NOT_SUPPORTED` path yields `INSUFFICIENT_DATA` downstream (assert in a
  later task's tests, but stub now).

### Task 1.6 — Remaining seven AMCs (L, parallelisable)
- Nippon, Kotak, Axis, UTI, ABSL, Mirae, DSP. Same pattern as 1.5.
- **Done when:** each adapter has ≥ 5 fixtures and registry coverage test lists
  all ten.

---

## Phase 2 — Metrics and scoring (L)

### Task 2.1 — `mfMetricsMath.ts` (L)
- Implement every function in `02 §2–5, §7–8` as pure Decimal functions.
- Series builders: `toMonthEndSeries`, `toDailySeries`, `forwardFillRiskFree`.
- XIRR in `@portfolioos/shared` if absent.
- Tests `02 §10.1–3, 5–9` with synthetic fixtures.
- **Done when:** all synthetic tests pass to stated tolerances; determinism
  test; no `number` leak test.

### Task 2.2 — Real-fund golden fixtures (M)
- Three schemes × 10y NAV + benchmark + rf, with hand-verified published
  figures at a fixed `asOf` (`02 §10.4`). Commit the source and the date.
- **Done when:** tolerances met; a `README` in the fixture folder records
  where each published number came from.

### Task 2.3 — `mfMetrics.service.ts` + `mfMetricsJob` (M)
- Load series, compute per horizon, write `MfSchemeMetrics` (incl. horizon 0
  from latest snapshot + meta), `status` per rules in `02 §1`.
- Job nightly, chunked, `runAsSystem`; alert if < 90% computed.
- **Done when:** integration test on fixture DB produces rows for all
  horizons with correct statuses (`INSUFFICIENT_DATA`, `BENCHMARK_UNAVAILABLE`
  paths covered); idempotency.

### Task 2.4 — Universes and peer ranks (M)
- `mfPeerRank.service.ts` + `mfPeerRankJob`: universe membership (`03 §1`),
  percentile with ties, direction table, consistency metrics that need the
  universe (`02 §6`), survivorship-adjusted medians.
- **Done when:** percentile/tie tests; universe exclusion tests (IDCW,
  UNMAPPED, MERGED-for-ranking-but-included-for-medians); min-size test.

### Task 2.5 — Scoring models (L)
- `mfScoring/mfScoreMath.ts` (pillar, re-normalisation, blend, buckets) and
  `models/activeEquity.ts`, `index.ts`, `debtDuration.ts`, `debtUltraShort.ts`,
  `hybrid.ts`, `fof.ts` as data-only weight tables with `methodologyVersion`.
- `mfScore.service.ts` + `mfScoreJob` writing `MfSchemeScore` append-only with
  the `03 §10` explainability payload.
- Tests `03 §11`.
- **Done when:** all tests pass; `mf-score-append-only` and
  `mf-no-rating-under-36m` invariants pass.

### Task 2.6 — Reconciliation job (S)
- `jobs/mfReconciliationJob.ts` per `06 §2`, panel fixture, alert wiring.
- **Done when:** a deliberately corrupted NAV in test triggers a drift failure
  naming the scheme.

### Task 2.7 — Backtest script (M)
- `scripts/mf-backtest.ts` per `06 §3`; output markdown to
  `docs/mf-analytics/backtests/`.
- Store the regression coefficient in `constants.ts` for the version.
- **Done when:** script runs on the local backfilled DB and the report is
  committed; acceptance thresholds documented as met or the weights revised.

---

## Phase 3 — Read API + fund page (M)

### Task 3.1 — Reference read endpoints (M)
- Routes under `/api/mf-analytics/schemes/:schemeCode` — meta, metrics (all
  horizons), score (latest + `?version=`), peers summary, holdings snapshot.
  `asyncHandler` on every handler; `requireFeature('MF_ANALYTICS')`.
- Controllers return shared DTOs only.
- **Done when:** route tests; a locally-declared type in the controller is a
  review failure — reconcile against shared.

### Task 3.2 — Fund detail page (M)
- `apps/web/src/pages/mf/FundDetailPage.tsx`: score + rating with pillar
  breakdown (expandable to inputs, medians, percentiles), horizon tabs, rolling
  return distribution chart, drawdown chart, calendar-year table with quartile,
  portfolio characteristics, structural facts, risk-o-meter, disclaimer, and
  every `06 §6` honesty state.
- React Query keys in a shared `mfAnalyticsKeys` module.
- **Done when:** page renders every fixture state (rated, unrated,
  small-category, stale holdings, benchmark unavailable); field-by-field
  reconciliation against `mfAnalytics.types.ts` recorded in the PR.

### Task 3.3 — Methodology page (S)
- `/methodology/mf-score` rendering model tables from the model constants.
- **Done when:** a weight change in `activeEquity.ts` shows on the page with
  no other edit.

---

## Phase 4 — Portfolio analysis (L)

### Task 4.1 — Schema migration: user-scoped tables (S)
- `MfAnalysisRun`, `MfFinding`, `MfFundVerdict` per `05 §1` with RLS policies
  **and** `USER_SCOPED_MODELS` entries in one migration/commit.
- Extend `user-scoped-coverage`, add `mf-user-scoped-coverage`, extend
  `rls-isolation`.
- **Done when:** all RLS tests pass; writes under `NOBYPASSRLS` role succeed
  inside `runAsUser`.

### Task 4.2 — `mfPortfolioAnalysis.service.ts` (L)
- Everything in `04 §1–7`. Extend `mfOverlap.service.ts` rather than
  duplicating. Reuse `capitalGains.service.ts`, `goalMath.ts`, XIRR.
- Tests `04 §9` including the family-view `null` vs `[]` regression.
- **Done when:** tests pass under `scope.runAs`; no `prisma.$transaction`
  in the file (use `runInTransaction`).

### Task 4.3 — Portfolio page (M)
- `apps/web/src/pages/mf/MfPortfolioPage.tsx`: totals, fund list with score
  chips and user XIRR vs fund CAGR, overlap matrix, look-through (top stocks,
  sectors, cap, credit, asset class, target drift), cost with direct-plan
  savings, tax lots with LTCG countdown, goal fit, family-scope notices.
- **Done when:** fixture states render; reconciliation recorded.

---

## Phase 5 — Findings, verdicts, prose (L)

### Task 5.1 — Facts builder + rule contract (M)
- `types.ts`, `constants.ts` (`MfRuleConstants` defaults), `mfFacts.builder.ts`
  (batched loads, snapshot), rule registry.
- `mf-rules-pure` invariant test.
- **Done when:** a fixture user yields a `MfAnalysisFacts` that round-trips
  through JSON unchanged.

### Task 5.2 — Fund-scope rules (L)
- One file per rule in `05 §4` (fund scope), one test file per rule with
  fire / no-fire / counterfactual assertions; registry coverage test.
- **Done when:** all 24 rules and tests present; coverage test passes.

### Task 5.3 — Portfolio-scope rules (M)
- The nine rules in `05 §4` (portfolio scope), same test pattern.

### Task 5.4 — Verdict table + engine (M)
- `mfVerdict.ts` (decision table, `breakEvenMonths`), supersede logic,
  `mfAnalysisEngine.service.ts` orchestrator, `mfAnalysisJob` with the three
  triggers (`01 §5`) and 1/hour user refresh rate limit.
- Tests `05 §8.3–5, 7–8`.
- **Done when:** engine tests pass; `PARTIAL` path covered; replay from
  snapshot works.

### Task 5.5 — Prose pipeline (M)
- `ai/prompts/mfAnalysis.prose.ts`, prose job on its own queue, budget
  accounting on the run, `proseConsistency.ts` extension with numeric-token
  verification, `RIA_VERDICTS_ENABLED` prompt branch.
- Test `05 §8.6` with a stubbed model.
- **Done when:** a fabricated number is rejected and headlines fall back;
  verification failure alert wired.

### Task 5.6 — Findings/verdict API + UI (M)
- Routes: latest run for user (`GET /api/mf-analytics/runs/latest`), findings
  by fund, verdict with reasons and switch cost, `POST /refresh` (rate-limited).
  API applies the `RIA_VERDICTS_ENABLED` stripping.
- UI: findings list per fund (severity, headline, evidence table, "what would
  change this"), verdict chip, prose block only when `proseVerified`, partial
  run banner, disclaimer.
- **Done when:** both gating states render correctly; reconciliation recorded.

---

## Phase 6 — Hardening (M)

### Task 6.1 — Operational alerts (S) — `06 §7`.
### Task 6.2 — Admin qualitative facts UI (S) — CRUD for `MfSchemeQualitativeFact`, admin-only route.
### Task 6.3 — Methodology changelog + backtest doc for v1 (S).
### Task 6.4 — Load test (S) — `mfMetricsJob` for 1,500 schemes × 5 horizons within the Bull lock window when chunked; document chunk size.
### Task 6.5 — CONTEXT.md update (S) — add a §9.13 "MF analytics" summary pointing at `docs/mf-analytics/`, and add the layer's invariants to §16.

---

## Definition of done for the layer

- All invariant tests in `06 §1` green.
- Reconciliation panel within tolerance for the last month.
- Backtest report committed and acceptance thresholds met for `ACTIVE_EQUITY`.
- Every fund a fixture user holds shows: score or an honest unrated state,
  ≥ 1 finding, a verdict, and either verified prose or headlines.
- Family VIEWER with restricted caps sees floors and "not shared", never zeros.
- `RIA_VERDICTS_ENABLED=false` in production until registration is confirmed.
