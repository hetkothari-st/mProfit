# 01 — Data Foundation

Professional analysis is ~60% data engineering. This doc defines every fund-side
dataset, where it comes from, how it is stored, how it is validated, and how it
is kept fresh. User-side holdings (MF Central, CAS, CASParser, Finvu) already
exist and are out of scope here.

All models in this doc are **reference data** — shared across users, not in
`USER_SCOPED_MODELS`, no RLS policy. They are written only under `runAsSystem`
by jobs.

---

## 1. Datasets and sources

| Dataset | Primary source | Fallback / paid | Refresh |
|---|---|---|---|
| NAV history | AMFI `NAVAll.txt` + historical endpoint (existing `amfi` feed) | MFAPI.in | daily |
| Scheme master + SEBI category | AMFI scheme master file; SEBI categorisation circulars | Morningstar Direct, ACE MF, CMOTS, Accord | monthly |
| TER, AUM, exit load, manager | AMC websites / factsheets (per-AMC adapters) | same paid feeds | monthly |
| Monthly portfolio holdings | AMC monthly portfolio disclosure (SEBI-mandated, Excel/PDF) | same paid feeds | monthly |
| Benchmark TRI | niftyindices.com (Nifty family), BSE (Sensex/BSE indices) | — | daily |
| Risk-free rate | RBI DBIE — 91-day T-bill cut-off yield | FBIL overnight MIBOR | weekly |
| Scheme mergers / renames | AMFI notices, AMC addenda | manual seed table | as they happen |

**Decision:** build the free path first (AMFI + AMC adapters + NSE indices). Keep
every ingestion behind an adapter interface so a paid feed can replace an adapter
without touching consumers.

---

## 2. Prisma schema additions

Add to `packages/api/prisma/schema.prisma`. Money in `Decimal(18,4)`; ratios and
percentages in `Decimal(12,6)` (six decimals is enough for a 0.0001% expense
ratio and a Sharpe of 1.234567). Every fetched row carries `sourceHash` and
`fetchedAt` for idempotency (`CONTEXT.md §3.3`).

```prisma
enum MfSebiCategory {
  EQUITY
  DEBT
  HYBRID
  SOLUTION_ORIENTED
  OTHER            // index funds, ETFs, FoFs
}

enum MfPlanType   { DIRECT REGULAR }
enum MfOptionType { GROWTH IDCW_PAYOUT IDCW_REINVEST }
enum MfSchemeStatus { ACTIVE MERGED WOUND_UP SUSPENDED }

model MfSchemeMeta {
  schemeCode            String          @id            // AMFI scheme code
  isin                  String?         @unique
  schemeName            String
  amcCode               String
  amcName               String
  sebiCategory          MfSebiCategory
  sebiSubCategory       String                         // "Large Cap Fund", "Corporate Bond Fund" …
  planType              MfPlanType
  optionType            MfOptionType
  benchmarkIndexCode    String?                        // → BenchmarkIndex.code (Tier-1 TRI)
  inceptionDate         DateTime
  predecessorSchemeCode String?                        // history chain for merged schemes
  status                MfSchemeStatus  @default(ACTIVE)
  statusChangedAt       DateTime?
  riskometer            String?
  exitLoadText          String?
  exitLoadRules         Json?                          // parsed: [{daysUpTo, pct}]
  minSip                Decimal?        @db.Decimal(18, 4)
  sourceHash            String
  fetchedAt             DateTime
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  terHistory     MfSchemeTer[]
  aumHistory     MfSchemeAum[]
  managers       MfSchemeManager[]
  snapshots      MfPortfolioSnapshot[]
  metrics        MfSchemeMetrics[]
  scores         MfSchemeScore[]

  @@index([sebiCategory, sebiSubCategory, planType, status])
  @@index([amcCode])
}

model MfSchemeTer {
  id          String   @id @default(cuid())
  schemeCode  String
  scheme      MfSchemeMeta @relation(fields: [schemeCode], references: [schemeCode])
  effectiveFrom DateTime
  terPct      Decimal  @db.Decimal(12, 6)              // e.g. 0.450000 = 0.45%
  sourceHash  String
  fetchedAt   DateTime
  @@unique([schemeCode, effectiveFrom])
}

model MfSchemeAum {
  id          String   @id @default(cuid())
  schemeCode  String
  scheme      MfSchemeMeta @relation(fields: [schemeCode], references: [schemeCode])
  asOf        DateTime                                 // month-end
  aum         Decimal  @db.Decimal(18, 4)              // INR, not crore
  sourceHash  String
  fetchedAt   DateTime
  @@unique([schemeCode, asOf])
}

model MfSchemeManager {
  id          String   @id @default(cuid())
  schemeCode  String
  scheme      MfSchemeMeta @relation(fields: [schemeCode], references: [schemeCode])
  managerName String
  role        String?                                  // "Lead", "Co-manager"
  fromDate    DateTime
  toDate      DateTime?                                // null = current
  sourceHash  String
  fetchedAt   DateTime
  @@index([schemeCode, toDate])
}

model MfPortfolioSnapshot {
  id           String   @id @default(cuid())
  schemeCode   String
  scheme       MfSchemeMeta @relation(fields: [schemeCode], references: [schemeCode])
  asOf         DateTime                                // month-end
  totalHoldings Int
  cashPct      Decimal  @db.Decimal(12, 6)
  sourceHash   String
  fetchedAt    DateTime
  holdings     MfPortfolioHolding[]
  @@unique([schemeCode, asOf])
}

enum MfHoldingKind { EQUITY DEBT CASH DERIVATIVE REIT_INVIT GOLD OTHER }

model MfPortfolioHolding {
  id            String   @id @default(cuid())
  snapshotId    String
  snapshot      MfPortfolioSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  kind          MfHoldingKind
  isin          String?
  securityName  String
  weightPct     Decimal  @db.Decimal(12, 6)
  quantity      Decimal? @db.Decimal(18, 6)
  marketValue   Decimal? @db.Decimal(18, 4)
  sector        String?                                // AMFI/industry classification
  marketCapBucket String?                              // LARGE | MID | SMALL (SEBI list)
  // debt-only
  issuer        String?
  creditRating  String?                                // "AAA", "AA+", "SOV", "A1+", "Unrated"
  maturityDate  DateTime?
  ytmPct        Decimal? @db.Decimal(12, 6)
  @@index([snapshotId])
  @@index([isin])
}

model BenchmarkIndex {
  code        String   @id                             // "NIFTY50_TRI", "NIFTY_MIDCAP150_TRI"
  name        String
  provider    String                                   // NSE | BSE | CRISIL
  isTotalReturn Boolean                                // ingest REJECTS false for benchmark use
  prices      BenchmarkIndexPrice[]
}

model BenchmarkIndexPrice {
  id        String   @id @default(cuid())
  indexCode String
  index     BenchmarkIndex @relation(fields: [indexCode], references: [code])
  date      DateTime
  value     Decimal  @db.Decimal(18, 6)
  sourceHash String
  @@unique([indexCode, date])
}

model RiskFreeRate {
  id        String   @id @default(cuid())
  series    String                                     // "TBILL_91D" | "MIBOR_ON"
  date      DateTime
  ratePct   Decimal  @db.Decimal(12, 6)                // annualised
  sourceHash String
  @@unique([series, date])
}

// Computed. See 02-METRICS.md for column semantics.
enum MfMetricStatus { OK INSUFFICIENT_DATA BENCHMARK_UNAVAILABLE STALE QUARANTINED }

model MfSchemeMetrics {
  id           String   @id @default(cuid())
  schemeCode   String
  scheme       MfSchemeMeta @relation(fields: [schemeCode], references: [schemeCode])
  asOf         DateTime
  horizonYears Int                                     // 1 | 3 | 5 | 7 | 10
  status       MfMetricStatus
  statusReason String?
  metrics      Json                                    // MfHorizonMetrics (shared type), Decimal strings
  benchmarkCode String?
  riskFreeSeries String?
  computedAt   DateTime @default(now())
  mathVersion  String                                  // "metrics-v1"
  @@unique([schemeCode, asOf, horizonYears])
  @@index([asOf])
}

model MfPeerRank {
  id           String   @id @default(cuid())
  schemeCode   String
  asOf         DateTime
  horizonYears Int
  universeKey  String                                  // "<sebiSubCategory>|<planType>"
  universeSize Int
  percentiles  Json                                    // { metricName: Decimal-string percentile }
  computedAt   DateTime @default(now())
  @@unique([schemeCode, asOf, horizonYears])
  @@index([universeKey, asOf])
}

enum MfRatingStatus { RATED INSUFFICIENT_HISTORY CATEGORY_TOO_SMALL NOT_APPLICABLE }

model MfSchemeScore {
  id                 String   @id @default(cuid())
  schemeCode         String
  scheme             MfSchemeMeta @relation(fields: [schemeCode], references: [schemeCode])
  asOf               DateTime
  methodologyVersion String                            // "score-active-equity-v1"
  modelKey           String                            // ACTIVE_EQUITY | INDEX | DEBT_SHORT | …
  ratingStatus       MfRatingStatus
  composite          Decimal? @db.Decimal(12, 6)       // 0–100
  rating             Int?                              // 1–5
  pillars            Json                              // { pillar: { score, weight, inputs: {…} } }
  universeKey        String
  universeSize       Int
  computedAt         DateTime @default(now())
  @@unique([schemeCode, asOf, methodologyVersion])     // append-only: new asOf or new version
  @@index([universeKey, asOf])
}

// Manual / curated facts that no feed provides reliably.
model MfSchemeQualitativeFact {
  id         String   @id @default(cuid())
  schemeCode String
  factType   String                                    // AMC_REGULATORY_ACTION | STRATEGY_CAPACITY_CAP | …
  value      Json
  validFrom  DateTime
  validTo    DateTime?
  source     String                                    // URL or note
  enteredBy  String                                    // admin userId
  createdAt  DateTime @default(now())
  @@index([schemeCode, factType])
}
```

**Do not put these in `USER_SCOPED_MODELS`.** Add a test in
`test/invariants/mf-reference-not-user-scoped.test.ts` asserting they are absent,
so a future refactor cannot accidentally hide market data behind RLS.

### Changes to existing `MFNav`

- Add `adjustedNav Decimal(18,6)?` — for IDCW options, NAV with distributions
  reinvested; for GROWTH equals `nav`. All return math uses `adjustedNav`.
- Add `isQuarantined Boolean @default(false)` + `quarantineReason String?`.
- Ensure `@@unique([schemeCode, date])` exists.

---

## 3. Price feeds

Under `src/priceFeeds/`. Each feed exposes `fetch(range)` returning parsed rows,
and is registered in `router.service.ts` only if the router needs to route to it
(indices are not looked up per-asset, so they may be job-only).

### `nseIndices.ts`
- Source: niftyindices.com historical data download (CSV per index per range).
- Only TRI series. Reject any index whose name lacks "TRI" / "Total Returns"
  unless explicitly whitelisted in `BENCHMARK_INDEX_SEED`.
- Seed list (minimum): `NIFTY50_TRI`, `NIFTY100_TRI`, `NIFTY200_TRI`,
  `NIFTY500_TRI`, `NIFTY_MIDCAP150_TRI`, `NIFTY_SMALLCAP250_TRI`,
  `NIFTY_LARGEMIDCAP250_TRI`, `NIFTY_MIDSMALLCAP400_TRI`,
  `NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI`, `NIFTY_SHORT_DURATION_DEBT`,
  `NIFTY_CORPORATE_BOND`, `NIFTY_LIQUID`, `CRISIL_COMPOSITE_BOND` (CRISIL feed later).
- Sensex TRI and BSE indices via a `bseIndices.ts` sibling.

### `rbiRiskFree.ts`
- RBI DBIE 91-day T-bill primary auction cut-off yield, weekly. Forward-fill to
  daily in the math layer, never in storage.

### `amfiSchemeMaster.ts`
- AMFI scheme master + NAV file give scheme code, ISIN, name, AMC, category text.
- Map AMFI category text → `sebiCategory` + `sebiSubCategory` via a maintained
  lookup table `SEBI_SUBCATEGORY_MAP` in `@portfolioos/shared` (36 SEBI
  sub-categories). Unknown category text → `IngestionFailure` with reason
  `unmapped_sebi_category`, scheme stored with `sebiSubCategory: 'UNMAPPED'` and
  excluded from universes.
- Plan/option parsed from scheme name suffix ("Direct Plan – Growth").
  Unparseable → `IngestionFailure`, excluded.

---

## 4. Factsheet / holdings adapters

Under `src/adapters/mfFactsheet/`. Follow the repo convention: pure
`<amc>.parse.ts` (fixture-tested, ≥5 fixtures) + `<amc>.v1.ts` (network).

`registry.ts` maps `amcCode` → adapter. Each adapter implements:

```ts
interface MfFactsheetAdapter {
  amcCode: string;
  fetchSchemeFacts(schemeCode: string): Promise<SchemeFactsRaw>;   // TER, AUM, managers, exit load
  fetchPortfolio(schemeCode: string, asOf: Date): Promise<PortfolioRaw>;
}
```

Start with the ten largest AMCs by AUM (covers ~85% of retail holdings): SBI,
ICICI Pru, HDFC, Nippon, Kotak, Axis, UTI, Aditya Birla SL, Mirae, DSP. Every
AMC not in the registry falls back to `AMC_NOT_SUPPORTED` — metadata partially
populated from AMFI, holdings absent, and every metric that needs holdings gets
`INSUFFICIENT_DATA`.

Holdings normalisation:
- Resolve `isin` → `StockMaster` for equity; unresolved ISINs keep the name and
  are counted but not sector-mapped.
- Sector: use AMFI industry classification as disclosed; map to your existing
  sector taxonomy in `StockMaster` where present.
- Market-cap bucket: from the AMFI half-yearly large/mid/small list (seed table
  `AmfiMarketCapList`, refreshed Jan/Jul). Do not derive from live market cap —
  SEBI's list is what the fund is measured against.
- Credit rating: normalise to a fixed ordinal scale
  (`SOV > AAA/A1+ > AA+ > AA > AA- > A+ > A > A- > BBB+ > BBB > BBB- > BELOW_IG > UNRATED`).

---

## 5. Jobs

All under `src/jobs/`, started in `index.ts` after `listen`, all `runAsSystem`.
Bull queue per job; respect `JOB_TIMEOUT_MS` / `LOCK_DURATION_MS`. Holdings
fetches for ~1,500 active schemes exceed 5 minutes — chunk into per-AMC jobs.

| Job | Schedule | Does |
|---|---|---|
| `mfMetadataJob` | 1st of month 02:00 IST | AMFI scheme master → `MfSchemeMeta`; per-AMC facts → TER/AUM/managers |
| `mfHoldingsJob` | 12th of month 02:00 IST (AMCs disclose by the 10th) | per-AMC portfolio → `MfPortfolioSnapshot` |
| `benchmarkPriceJob` | daily 20:00 IST | `nseIndices` + `bseIndices` → `BenchmarkIndexPrice` |
| `riskFreeRateJob` | weekly Mon 06:00 IST | `rbiRiskFree` → `RiskFreeRate` |
| `mfMetricsJob` | daily 22:00 IST (after AMFI NAV lands) | see `02-METRICS.md` — for every ACTIVE scheme |
| `mfPeerRankJob` | daily, after metrics | universes + percentiles → `MfPeerRank` |
| `mfScoreJob` | 15th of month, after holdings + metrics | see `03-SCORING.md` → `MfSchemeScore` |
| `mfAnalysisJob` | per user, triggered | see `05-FINDINGS-ENGINE.md`; `runAsUser` |
| `mfReconciliationJob` | monthly | see `06-QUALITY-COMPLIANCE.md` |

**Idempotency:** every job computes `sourceHash` per artefact and upserts on the
unique key. Re-running a job on the same day is a no-op.

**Failures:** every parse/fetch failure writes an `IngestionFailure` with a
scheme-scoped reason. Never `catch {}`.

**Triggering `mfAnalysisJob`:** enqueue when (a) a user's MF holdings projection
changes (hook into `recomputeForAsset` for `assetClass` in the MF set), (b) a
new `MfSchemeScore` lands for a scheme the user holds, (c) the user requests a
refresh (rate-limited 1/hour).

---

## 6. Validation at ingest (quarantine, don't compute)

Applied in the job layer before writing; rejected rows go to `IngestionFailure`
*and* — for NAV — a quarantined row so the gap is visible.

| Check | Action |
|---|---|
| NAV day-over-day change > 20% with no `CorporateAction` / IDCW record | quarantine NAV, reason `nav_jump` |
| NAV ≤ 0 or missing | quarantine |
| NAV date is a weekend/holiday and value ≠ previous | quarantine |
| Benchmark index `isTotalReturn = false` used as benchmark | reject at seed time |
| Holdings weights sum outside 97–103% | reject snapshot, reason `weights_sum` |
| TER outside 0.01–3.0% | reject, reason `ter_range` |
| AUM drop > 50% month-on-month | accept but flag `aum_shock` qualitative fact |
| Scheme in NAV file but absent from master | create stub `MfSchemeMeta` with `sebiSubCategory: 'UNMAPPED'` |
| Manager `fromDate` > today | reject |

---

## 7. Scheme merger handling

When AMFI announces a merger (scheme A absorbed into B):
1. Set A `status: MERGED`, `statusChangedAt`.
2. Set B `predecessorSchemeCode: A` **only if** the surviving scheme's mandate is
   unchanged (same sub-category). Otherwise B's history starts at merger date.
3. The NAV series used for B's metrics is B's own; A's history is *not* spliced
   in. (Splicing changes the fund's risk history and misleads.) A's history
   remains queryable for users who held A.

Merged and wound-up schemes stay in the DB with status set. Universes exclude
them for ranking but **include** them for survivorship-adjusted consistency
stats (see `02-METRICS.md §6`).

---

## 8. Shared types (`packages/shared/src/mfAnalytics.types.ts`)

Declare every API-boundary shape here — frontend imports them, never redeclares
(`CONTEXT.md §11`). Minimum set:

```ts
export type Ratio = string & { readonly __brand: 'Ratio' };   // Decimal string, e.g. "0.123456"
export type Pct   = string & { readonly __brand: 'Pct' };     // Decimal string, percent units

export interface MfSchemeMetaDto { … }                        // mirrors MfSchemeMeta minus internals
export interface MfHorizonMetrics { … }                       // see 02-METRICS.md §7
export interface MfPeerPercentiles { [metric: string]: Ratio }
export interface MfPillarScore { score: Ratio; weight: Ratio; inputs: Record<string, MfPillarInput> }
export interface MfPillarInput { value: Ratio | null; percentile: Ratio | null; status: MfMetricStatus }
export interface MfSchemeScoreDto { … }
export interface MfFinding { … }                              // see 05-FINDINGS-ENGINE.md
export interface MfFundVerdictDto { … }
export interface MfPortfolioAnalysisDto { … }                 // see 04-PORTFOLIO-ANALYSIS.md
```

Add `packages/shared/src/ratio.ts` with `serializeRatio(d: Decimal): Ratio`,
`toRatioDecimal(r: Ratio): Decimal`, `serializePct`, `toPctDecimal`. Extend
`portfolioos/no-money-coercion` lint to cover `Ratio` and `Pct`.
