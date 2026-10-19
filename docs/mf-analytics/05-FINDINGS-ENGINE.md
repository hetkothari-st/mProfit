# 05 — Findings, Verdicts and Prose

`services/mfAnalytics/` — `mfFacts.builder.ts`, `rules/`, `mfVerdict.ts`,
`mfAnalysisEngine.service.ts`. This mirrors `services/advisor/` exactly; read
`CONTEXT.md §9.8` first. The three guarantees carry over:

1. a broken rule is a broken rule, not a broken run;
2. "why was X *not* flagged?" is answerable — `ruleVersionsSnapshot` records
   every rule that ran, including silent ones;
3. a re-run never rewrites history.

---

## 1. User-scoped models

These hold user data. **RLS policy + `USER_SCOPED_MODELS` registration in the
same migration.** Extend `test/invariants/user-scoped-coverage.test.ts`.

```prisma
enum MfAnalysisRunStatus { RUNNING COMPLETED PARTIAL FAILED }

model MfAnalysisRun {
  id                   String   @id @default(cuid())
  userId               String
  user                 User     @relation(fields: [userId], references: [id])
  familyId             String?
  asOf                 DateTime
  status               MfAnalysisRunStatus
  factsSnapshot        Json                   // MfAnalysisFacts, for audit + replay
  portfolioAnalysis    Json                   // MfPortfolioAnalysisDto
  ruleVersionsSnapshot Json                   // [{ ruleId, version, ran, emitted, error? }]
  triggeredBy          String                 // HOLDINGS_CHANGE | SCORE_UPDATE | USER_REFRESH | SCHEDULE
  llmSpendInr          Decimal? @db.Decimal(18, 4)
  startedAt            DateTime @default(now())
  completedAt          DateTime?
  findings             MfFinding[]
  verdicts             MfFundVerdict[]
  @@index([userId, asOf])
}

enum MfFindingSeverity { INFO NOTICE WARNING CRITICAL }

model MfFinding {
  id            String   @id @default(cuid())
  runId         String
  run           MfAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  userId        String                       // denormalised for RLS
  schemeCode    String?                      // null = portfolio-level finding
  ruleId        String
  ruleVersion   String
  code          String                       // e.g. HIGH_DOWN_CAPTURE
  category      String                       // PERFORMANCE | RISK | COST | …
  severity      MfFindingSeverity
  confidence    Decimal  @db.Decimal(12, 6)  // 0–1
  headline      String                       // ≤ 120 chars, deterministic template
  evidence      Json                         // MfEvidence[]
  whatWouldChangeThis String
  createdAt     DateTime @default(now())
  @@index([runId]) @@index([userId, schemeCode])
}

enum MfVerdictKind { HOLD MONITOR REVIEW SWITCH_CANDIDATE INSUFFICIENT_DATA }

model MfFundVerdict {
  id              String   @id @default(cuid())
  runId           String
  run             MfAnalysisRun @relation(fields: [runId], references: [id])
  userId          String
  schemeCode      String
  verdict         MfVerdictKind
  reasons         Json                       // finding codes that drove it
  suggestedReplacementSchemeCode String?     // only for SWITCH_CANDIDATE; from AdvisorApprovedProduct
  switchCost      Json?                      // { exitLoadInr, taxInr, breakEvenMonths }
  prose           String?                    // LLM narrative, verified
  proseModel      String?
  proseVerified   Boolean  @default(false)
  supersededById  String?
  createdAt       DateTime @default(now())
  @@index([userId, schemeCode, createdAt])
}
```

---

## 2. `MfAnalysisFacts` (`types.ts`)

Immutable, assembled once per run by `mfFacts.builder.ts`. Rules receive this
and nothing else.

```ts
export interface MfAnalysisFacts {
  asOf: string; userId: string; scope: EffectiveScope;
  constants: MfRuleConstants;                     // thresholds, see §4
  portfolio: MfPortfolioAnalysisDto;              // 04
  funds: Record<string, MfFundFacts>;             // by schemeCode
  approvedUniverse: AdvisorApprovedProductFacts[];// for replacements
  userProfile: { riskProfile?: RiskProfileFacts; goals: GoalFacts[]; incomeKnown: boolean };
}
export interface MfFundFacts {
  meta: MfSchemeMetaDto;
  score: MfSchemeScoreDto | null;
  metrics: Record<1|3|5|7|10, MfHorizonMetrics | null>;
  profile: MfCurrentProfile | null;               // horizon-0 row
  peer: Record<1|3|5|7|10, MfPeerPercentiles | null>;
  qualitative: MfQualitativeFactDto[];
  held: MfHeldFundDto;                            // user's position, lots, XIRR
  categoryStats: { universeSize: number; medianComposite: Ratio|null; topQuartileComposite: Ratio|null };
}
```

The builder runs the `04` analysis, loads reference data in one batched query
per table, and snapshots the whole thing onto `MfAnalysisRun.factsSnapshot`.
A run can be replayed from its snapshot with a later rule version — that is how
you test a rule change against real historical runs without recomputing metrics.

---

## 3. Rule contract

```ts
export interface MfRule {
  id: string;                  // "mf.cost.regular-plan"
  version: string;             // bump on any threshold or logic change
  scope: 'FUND' | 'PORTFOLIO';
  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[];   // pure, sync, no I/O
}
export interface MfEvidence {
  metric: string;              // "riskAdjusted.sortino"
  horizonYears?: number;
  value: Ratio | null;
  categoryMedian?: Ratio | null;
  percentile?: Ratio | null;
  benchmarkValue?: Ratio | null;
  unit: 'ratio' | 'pct' | 'inr' | 'days' | 'count';
}
```

`headline` is a deterministic template filled from evidence — no LLM. Example:
`"Captured {downCapture}% of benchmark losses (category median {median}%)"`.
`whatWouldChangeThis` is also templated and is **mandatory** — a finding
without it is a lint error (add `portfolioos/finding-requires-counterfactual`
or a unit test that iterates rules against fixtures and asserts non-empty).

---

## 4. Rule catalogue (v1)

Thresholds live in `constants.ts` as `MfRuleConstants` and are passed via facts
so tests can override. Defaults below. Severity is fixed per rule; confidence
scales with evidence quality (e.g. 10y data ⇒ 1.0, 3y only ⇒ 0.7, benchmark
missing ⇒ 0.5).

### Fund-scope

| Rule id | Code | Trigger | Severity | Counterfactual template |
|---|---|---|---|---|
| `mf.perf.persistent-underperformance` | `PERSISTENT_UNDERPERFORMANCE` | `rollingBeatBenchPct(3y) < 0.30` and blended PERFORMANCE pillar percentile < 0.25 | WARNING | "Would clear if the fund beat its benchmark in > 30% of rolling 3-year windows" |
| `mf.perf.top-quartile-consistency` | `CONSISTENT_OUTPERFORMER` | `quartileConsistency ≥ 0.8` over ≥ 5 years and `rollingBeatBenchPct(3y) ≥ 0.7` | INFO | "Would lose this if quartile consistency fell below 80%" |
| `mf.perf.recent-reversal` | `RECENT_REVERSAL` | 10y percentile ≥ 0.75 but 1y percentile ≤ 0.25 (or vice versa) | NOTICE | "Watch whether the 3-year figure follows the 1-year" |
| `mf.risk.high-down-capture` | `HIGH_DOWN_CAPTURE` | `downCapture > 1.10` and percentile < 0.25 | WARNING | "Would clear at down-capture ≤ 1.10" |
| `mf.risk.deep-drawdown` | `DEEP_DRAWDOWN` | `maxDrawdown` worse than category p25 by > 5 pp | NOTICE | |
| `mf.risk.volatility-mismatch` | `RISK_PROFILE_MISMATCH` | fund `stdDevAnn` percentile (higher = riskier) > 0.75 and user risk profile ≤ MODERATE | WARNING | "Would clear if your risk profile were AGGRESSIVE or the fund's volatility fell to the category median" |
| `mf.cost.high-ter` | `HIGH_TER` | `terPercentile < 0.25` (i.e. costlier than 75% of peers) | NOTICE | "Would clear at a TER ≤ category median {median}%" |
| `mf.cost.regular-plan` | `REGULAR_PLAN_COST` | `planType = REGULAR` and direct sibling exists | WARNING | "Switching to the direct plan saves ≈ ₹{savings}/yr at current value" |
| `mf.portfolio.concentration` | `CONCENTRATED_PORTFOLIO` | `top10WeightPct > 60` and not a Focused/Sectoral sub-category | NOTICE | |
| `mf.portfolio.style-drift` | `STYLE_DRIFT` | `styleDrift` outside SEBI band for ≥ 3 of last 12 months | WARNING | "Would clear after 3 consecutive months inside the mandated band" |
| `mf.portfolio.closet-index` | `CLOSET_INDEX` | `activeShare < 0.40` and TER percentile < 0.5 (active fee for passive exposure) | WARNING | |
| `mf.portfolio.aum-capacity` | `AUM_CAPACITY` | Small-cap sub-category and AUM > `SMALLCAP_AUM_CAP_INR` (default ₹20,000 cr) | NOTICE | |
| `mf.people.manager-change` | `MANAGER_CHANGE` | lead manager changed within 12 months | NOTICE | "Track record before {date} belongs to the previous manager; this finding clears after 12 months" |
| `mf.people.amc-action` | `AMC_REGULATORY_ACTION` | qualitative fact within 3 years | WARNING | |
| `mf.debt.credit-quality` | `LOW_CREDIT_QUALITY` | `belowAAPct > 15` outside Credit Risk sub-category | WARNING | |
| `mf.debt.issuer-concentration` | `ISSUER_CONCENTRATION` | `topIssuerPct > 10` | NOTICE | |
| `mf.debt.duration-mismatch` | `DURATION_MISMATCH` | `modifiedDuration` outside SEBI band | WARNING | |
| `mf.index.tracking-error` | `HIGH_TRACKING_ERROR` | INDEX model, `trackingErrorAnn` percentile < 0.25 | WARNING | |
| `mf.data.insufficient-history` | `INSUFFICIENT_HISTORY` | `score.ratingStatus ≠ RATED` | INFO | "Rated once the fund has 36 months of NAV history (on {date})" |
| `mf.data.stale-holdings` | `STALE_HOLDINGS_DATA` | latest snapshot > 60 days old | INFO | |
| `mf.user.timing-gap` | `NEGATIVE_TIMING_GAP` | `timingGap < −0.03` over ≥ 3 years | INFO | descriptive only, never advisory |
| `mf.user.exit-load-window` | `EXIT_LOAD_ACTIVE` | any lot inside exit-load window | INFO | "Clears on {date}" |
| `mf.user.ltcg-approaching` | `LTCG_FLIP_SOON` | any STCG lot with `daysToLtcg ≤ 45` and gain > 0 | INFO | |
| `mf.tax.harvest` | `TAX_HARVEST_OPPORTUNITY` | `harvestableLossInr > MIN_HARVEST_INR` (₹5,000) and not in exit-load window | NOTICE | reuses advisor `TAX_HARVEST` math |

### Portfolio-scope

| Rule id | Code | Trigger | Severity |
|---|---|---|---|
| `mf.pf.redundant-funds` | `REDUNDANT_FUNDS` | pairwise overlap ≥ 0.50 in the same sub-category | WARNING |
| `mf.pf.too-many-funds` | `FUND_SPRAWL` | > 10 equity funds or `effectiveFundCount < 0.5 × count` | NOTICE |
| `mf.pf.single-stock` | `LOOK_THROUGH_CONCENTRATION` | underlying stock > 5% of MF book | NOTICE |
| `mf.pf.allocation-drift` | `ALLOCATION_DRIFT` | actual vs model equity share outside tolerance | WARNING |
| `mf.pf.cost` | `PORTFOLIO_COST_HIGH` | `costCategoryPercentile < 0.3` | NOTICE |
| `mf.pf.direct-savings` | `DIRECT_PLAN_SAVINGS` | `directPlanSavingsInr > ₹2,000/yr` | WARNING |
| `mf.pf.goal-mismatch` | `GOAL_MISMATCH` / `GOAL_UNDERPOWERED` | per §6 of `04` | WARNING |
| `mf.pf.ltcg-headroom` | `LTCG_HEADROOM_UNUSED` | headroom > ₹50k with LTCG lots available, within 60 days of FY end | NOTICE |
| `mf.pf.no-emergency-liquidity` | `NO_LIQUID_BUFFER` | no liquid/overnight fund and health-score emergency-fund component < threshold | NOTICE |

---

## 5. Verdict decision table (`mfVerdict.ts`)

Applied per fund, first matching row wins. Pure function of findings + facts.

| Order | Condition | Verdict |
|---|---|---|
| 1 | `score.ratingStatus ≠ RATED` and no CRITICAL finding | `INSUFFICIENT_DATA` |
| 2 | any CRITICAL finding (reserved for `AMC_REGULATORY_ACTION` with fund-specific impact, `LOW_CREDIT_QUALITY` with below-IG > 10%) | `SWITCH_CANDIDATE` if replacement exists, else `REVIEW` |
| 3 | rating ≤ 2 **and** `PERSISTENT_UNDERPERFORMANCE` **and** ≥ 1 more WARNING **and** an `AdvisorApprovedProduct` in the same sub-category with rating ≥ 4 **and** `switchCost.breakEvenMonths ≤ 24` | `SWITCH_CANDIDATE` |
| 4 | rating ≤ 2 **or** ≥ 2 WARNING findings | `REVIEW` |
| 5 | rating = 3 **or** exactly 1 WARNING **or** `MANAGER_CHANGE` / `RECENT_REVERSAL` | `MONITOR` |
| 6 | otherwise | `HOLD` |

`REGULAR_PLAN_COST` never drives `SWITCH_CANDIDATE` on its own — it is a
plan-switch within the same fund and gets its own action type
(`SWITCH_TO_DIRECT`) surfaced from the finding, not the verdict.

`breakEvenMonths` = `(exitLoadInr + taxInr) / ((replacementExpectedEdge) × currentValue / 12)`
where `replacementExpectedEdge` is the **category-median TER difference plus
half the composite-score gap mapped to alpha via the backtest coefficient**
(from `06 §3`). Do not use the replacement's past return — that is the
over-promise every "switch" recommendation industry-wide makes.

Verdict rows are append-only. On re-run: same verdict and same `reasons` set ⇒
no new row (touch nothing); anything else ⇒ new row, old row's
`supersededById` set.

---

## 6. Prose pipeline

Only after verdicts. Gated by `ENABLE_LLM_ADVISOR_PROSE` and the per-user
`AiUsage` budget; skipped entirely (findings still shown) if either is off.

1. Input to the model: the fund's findings (headline + evidence + counterfactual),
   verdict + reasons, score pillars, and the user's holding summary. **Never**
   raw NAV series, never other users' data.
2. System prompt (`ai/prompts/mfAnalysis.prose.ts`): write 3–6 sentences, plain
   English, no jargon without a gloss, no numbers that are not in the input,
   no "buy/sell" imperatives unless verdict is `SWITCH_CANDIDATE` **and**
   `RIA_VERDICTS_ENABLED`, end with the single most important
   `whatWouldChangeThis`.
3. Verification: extend `proseConsistency.ts` — extract every numeric token
   (with % / ₹ / x suffixes) from the prose; each must match (±rounding to the
   displayed precision) a value in the input evidence. Fail ⇒ `proseVerified:
   false`, prose discarded, deterministic headlines shown instead, event logged
   with the offending token.
4. Model: `LLM_ADVISOR_MODEL`. Record spend on the run.

---

## 7. Orchestrator (`mfAnalysisEngine.service.ts`)

```
runAnalysis(userId, trigger):
  runInTransaction: create MfAnalysisRun(RUNNING)
  facts = buildFacts(userId, asOf)                   // 04 + reference loads
  for each fund: for each FUND rule: try evaluate → findings; catch → record on ruleVersionsSnapshot, continue
  for each PORTFOLIO rule: same
  verdicts = decide(findings, facts)
  runInTransaction: write findings, verdicts (supersede logic), factsSnapshot, status COMPLETED|PARTIAL
  enqueue prose job (separate queue; failures never affect the run status)
```

`PARTIAL` = at least one rule errored. The UI shows a banner naming the rule
category that is missing, never silently omits.

---

## 8. Tests (`test/services/mfAnalytics/rules/`, `mfVerdict.test.ts`, `mfAnalysisEngine.test.ts`)

1. One test file per rule: fixture facts that fire it, fixture facts one notch
   below threshold that don't, and an assertion that `whatWouldChangeThis` is
   non-empty and mentions the threshold.
2. Rule coverage: iterate the registry; every rule has a test file (static
   assertion on the filesystem).
3. Verdict table: a fixture per row; order sensitivity (a fund satisfying rows
   3 and 4 gets row 3).
4. Engine: a rule that throws ⇒ run `PARTIAL`, other findings present,
   `ruleVersionsSnapshot` records the error.
5. Supersede: run twice unchanged ⇒ one verdict row; change a finding ⇒ two rows
   linked; first row byte-identical.
6. Prose: a stubbed LLM returning a number not in evidence ⇒ `proseVerified:
   false` and headlines fallback.
7. RLS: `MfFinding` / `MfFundVerdict` invisible cross-user; `USER_SCOPED_MODELS`
   coverage test passes.
8. Replay: load a stored `factsSnapshot`, run rules at a newer version ⇒ works
   without DB access to reference tables.
