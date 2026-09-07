# 02 — Metrics

`services/mfAnalytics/mfMetricsMath.ts` — pure functions, `Decimal` in and out,
no I/O, no Prisma. `mfMetrics.service.ts` loads series and calls them.
Everything here is unit-tested against golden fixtures (§8).

---

## 1. Conventions

- **Return series basis.** Two series per scheme:
  - *Daily* series from `MFNav.adjustedNav` — used for rolling returns and
    drawdown (needs granularity).
  - *Monthly* series (month-end NAV, last available NAV on or before month-end)
    — used for all volatility and risk-adjusted metrics. This matches Morningstar
    / Value Research convention, is robust to NAV gaps, and gives 36/60/120
    observations for 3/5/10 years.
- **Simple returns**, not log returns: `r_t = NAV_t / NAV_{t-1} − 1`.
- **Annualisation** of monthly figures: mean × 12, standard deviation × √12.
- **Risk-free rate**: monthly `rf_m = (1 + rf_annual)^(1/12) − 1` using the
  `TBILL_91D` rate forward-filled to each month-end.
- **Benchmark**: the scheme's `benchmarkIndexCode`. If null or if the index has
  gaps > 5 business days in the window → `BENCHMARK_UNAVAILABLE` for every
  benchmark-relative metric; absolute metrics still compute.
- **Horizons**: 1, 3, 5, 7, 10 years. A horizon is computable only if the scheme
  has NAV history covering the full window ending at `asOf` (window start = asOf
  − N years, exact date; if no NAV that day, nearest prior within 7 days).
- **Minimum observations**: monthly metrics need ≥ 12 months; Sharpe/Sortino/
  alpha/beta need ≥ 36. Below threshold → `INSUFFICIENT_DATA`.
- **`Decimal` precision**: set `Decimal.set({ precision: 28 })` once in the math
  module. Round only at serialisation (6 dp for ratios, 4 dp for money).

---

## 2. Return metrics

### 2.1 Point-to-point CAGR
`CAGR = (NAV_end / NAV_start)^(1/N) − 1` for N-year horizon. For horizon 1 report
absolute return (SEBI convention: < 1 year absolute, ≥ 1 year annualised).

### 2.2 Rolling returns (window W ∈ {1, 3, 5} years, daily step)
For every date t in the horizon where NAV at t−W exists:
`RR_t = (NAV_t / NAV_{t−W})^(1/W) − 1`.
Report: `mean`, `median`, `min`, `max`, `p10`, `p25`, `p75`, `p90`,
`pctNegative`, `pctBelowBenchmark`, `pctBelowCategoryMedian`, `observations`.

Rolling returns are the primary performance evidence in findings — they show
what a random-entry investor actually experienced. Point-to-point is reported
but not used in scoring.

### 2.3 Calendar-year returns
For each complete calendar year in the horizon: fund, benchmark, category
median, fund rank. Stored as an array.

### 2.4 Hypothetical SIP return
Monthly ₹10,000 on the 1st NAV date of each month for the horizon; XIRR of the
cash flows against terminal value. Reuse the XIRR implementation in
`@portfolioos/shared` finance math (if absent, add one — Newton with bisection
fallback, tolerance 1e-8).

---

## 3. Risk metrics (monthly series)

| Metric | Formula |
|---|---|
| `stdDevAnn` | `σ(r_m) × √12` |
| `downsideDevAnn` | `√( mean( min(r_m − rf_m, 0)² ) ) × √12` |
| `maxDrawdown` | from *daily* series: `min_t ( NAV_t / max_{s≤t} NAV_s − 1 )` |
| `maxDrawdownDurationDays` | peak date → trough date |
| `recoveryDays` | trough date → first date NAV ≥ prior peak; `null` if not yet recovered |
| `worstMonth`, `bestMonth` | min / max `r_m` |
| `worstCalendarYear` | min of §2.3 |
| `var95Monthly` | 5th percentile of `r_m` (historical, not parametric) |
| `cvar95Monthly` | mean of `r_m` at or below `var95Monthly` |
| `pctNegativeMonths` | share of `r_m < 0` |

---

## 4. Risk-adjusted metrics (monthly, ≥ 36 obs)

Let `e_m = r_m − rf_m` (fund excess), `b_m = rb_m − rf_m` (benchmark excess).

| Metric | Formula |
|---|---|
| `sharpe` | `(mean(e_m) × 12) / stdDevAnn` |
| `sortino` | `(mean(e_m) × 12) / downsideDevAnn` |
| `beta` | `cov(e_m, b_m) / var(b_m)` |
| `jensenAlphaAnn` | `(mean(e_m) − beta × mean(b_m)) × 12` |
| `treynor` | `(mean(e_m) × 12) / beta` (report `null` if `beta ≤ 0.1`) |
| `trackingErrorAnn` | `σ(r_m − rb_m) × √12` |
| `informationRatio` | `(mean(r_m − rb_m) × 12) / trackingErrorAnn` |
| `calmar` | `CAGR / |maxDrawdown|` (report `null` if drawdown > −1%) |
| `omega` | `Σ max(r_m − τ, 0) / Σ max(τ − r_m, 0)` with `τ = rf_m` |
| `m2` | Modigliani: `sharpe × σ_bench_ann + rf_ann` — useful for prose ("equivalent return at benchmark risk") |

Guard every division: denominator `< 1e-9` → `null` with `status: INSUFFICIENT_DATA`
and `statusReason: 'degenerate_denominator'`.

---

## 5. Benchmark-relative behaviour (monthly)

| Metric | Formula |
|---|---|
| `upCapture` | `CAGR_fund(months where rb_m > 0) / CAGR_bench(same months)` |
| `downCapture` | same for `rb_m < 0` |
| `captureRatio` | `upCapture / downCapture` |
| `battingAverage` | share of months `r_m > rb_m` |
| `outperformanceAnn` | `CAGR_fund − CAGR_bench` |

Capture CAGRs use geometric compounding over the selected months, annualised by
the count of selected months, per Morningstar's definition.

---

## 6. Consistency (uses universes — computed in `mfPeerRank.service.ts`)

| Metric | Definition |
|---|---|
| `rollingBeatBenchPct` | § 2.2 `1 − pctBelowBenchmark` for the 3-year window |
| `rollingBeatCategoryPct` | share of rolling-3y windows above the category median rolling-3y return *for the same window end* |
| `quartileHistory` | for each of the last 5 calendar years: Q1–Q4 in category |
| `quartileConsistency` | share of years in Q1 or Q2 |
| `survivorshipAdjusted` | `true` if the category median includes schemes that later merged / wound up (universe includes `MERGED`/`WOUND_UP` schemes whose history overlaps the window). Always compute this way; document it in methodology |

---

## 7. Portfolio-characteristic metrics (from latest `MfPortfolioSnapshot`)

Computed once per snapshot, not per horizon. Stored in the `horizonYears = 0`
row of `MfSchemeMetrics` (convention: 0 = "current portfolio").

| Metric | Formula / source |
|---|---|
| `numHoldings` | count of `kind = EQUITY` (or DEBT) holdings |
| `top10WeightPct` | Σ top 10 weights |
| `hhi` | Σ `w_i²` (weights as fractions) |
| `effectiveHoldings` | `1 / hhi` |
| `cashPct` | from snapshot |
| `activeShare` | `½ Σ |w_fund,i − w_bench,i|` — needs benchmark constituents; if unavailable → `BENCHMARK_UNAVAILABLE` |
| `marketCapSplit` | `{ large, mid, small, unclassified }` % using AMFI list |
| `sectorWeights` | map sector → % |
| `sectorActiveWeights` | fund − benchmark per sector (needs constituents) |
| `turnoverPct` | `min(Σ buys, Σ sells) / avg AUM` over trailing 12 monthly snapshots, where buys/sells are inferred from weight × AUM deltas; report as "estimated" |
| `styleBox` | 3×3 (cap × value/growth) — cap from split; value/growth from weighted P/B and P/E vs universe medians (requires fundamentals on `StockMaster`; if absent, cap-only 1×3 box) |
| `styleDrift` | for the last 12 snapshots: max deviation of `marketCapSplit` from the mandated SEBI band for the sub-category |
| **Debt-only** | |
| `modifiedDuration` | from factsheet if disclosed; else weighted from holding maturities (approximation, flagged) |
| `averageMaturityYears` | weighted |
| `ytmPct` | weighted |
| `creditQualitySplit` | `{ sov, aaa, aaPlus, aa, aaMinus, aAndBelow, unrated }` |
| `belowAAPct` | Σ weights rated AA− or lower + unrated |
| `topIssuerPct` | largest single issuer (non-sovereign) |

---

## 8. Structural metrics (from meta tables, `horizonYears = 0`)

| Metric | Source |
|---|---|
| `terPct` | latest `MfSchemeTer` |
| `terCategoryMedianPct` | universe median |
| `terPercentile` | universe |
| `aum` | latest `MfSchemeAum` |
| `aumGrowth12mPct` | |
| `aumCategoryPercentile` | |
| `managerTenureYears` | current lead manager `fromDate` → asOf |
| `managerChangesLast3y` | count of `MfSchemeManager` rows with `toDate` in window |
| `fundAgeYears` | `inceptionDate` → asOf |
| `exitLoadMaxDays` | from `exitLoadRules` |

---

## 9. Output shape — `MfHorizonMetrics` (shared type)

```ts
export interface MfHorizonMetrics {
  asOf: string; horizonYears: number; observationsMonthly: number;
  status: MfMetricStatus; statusReason?: string;
  returns: { cagr: Ratio|null; absolute: Ratio|null; benchmarkCagr: Ratio|null;
             categoryMedianCagr: Ratio|null; rolling1y?: RollingStats; rolling3y?: RollingStats;
             rolling5y?: RollingStats; calendarYears: CalendarYearRow[]; sipXirr: Ratio|null };
  risk: { stdDevAnn; downsideDevAnn; maxDrawdown; maxDrawdownDurationDays; recoveryDays;
          worstMonth; bestMonth; worstCalendarYear; var95Monthly; cvar95Monthly; pctNegativeMonths };
  riskAdjusted: { sharpe; sortino; beta; jensenAlphaAnn; treynor; trackingErrorAnn;
                  informationRatio; calmar; omega; m2 };
  relative: { upCapture; downCapture; captureRatio; battingAverage; outperformanceAnn };
  consistency: { rollingBeatBenchPct; rollingBeatCategoryPct; quartileHistory; quartileConsistency;
                 survivorshipAdjusted: boolean };
}
// All numeric fields: Ratio | null. A null is always accompanied by a per-field status
// in `fieldStatus: Record<string, MfMetricStatus>` at the top level.
```

Portfolio and structural metrics live in `MfCurrentProfile` (the horizon-0 row).

---

## 10. Tests (`packages/api/test/services/mfAnalytics/`)

Golden fixtures in `test/fixtures/mf/`:

1. **Synthetic series with known answers.** Construct 60 monthly returns by
   hand (e.g. constant 1%/month) so Sharpe, σ, CAGR are closed-form. Assert to
   1e-9.
2. **Benchmark-relative synthetics.** Fund = 1.2 × benchmark ⇒ beta = 1.2,
   alpha = 0, up/down capture = 1.2. Fund = benchmark + 0.5%/month ⇒ beta = 1,
   alpha = 6%/yr, IR = ∞ guard → `null`.
3. **Drawdown.** Series that falls 30% then recovers ⇒ maxDrawdown −0.30,
   correct duration and recovery days; series that never recovers ⇒
   `recoveryDays: null`.
4. **Real-fund fixtures (3 schemes).** 10 years of NAV + benchmark, with
   published 3y/5y Sharpe, σ and returns hand-verified against AMFI/Value
   Research at a fixed `asOf`. Tolerance: returns ±0.05 pp, σ ±0.1 pp,
   Sharpe ±0.03 (methodology differences are expected at that level).
5. **Insufficient data.** 24 months ⇒ 1y OK, 3y `INSUFFICIENT_DATA`, no throw.
6. **Benchmark gap.** Remove 10 consecutive index days ⇒ relative metrics
   `BENCHMARK_UNAVAILABLE`, absolute metrics OK.
7. **IDCW adjustment.** A scheme with a 10% payout: `adjustedNav` series gives
   the same CAGR as the growth option of the same scheme (±0.1 pp).
8. **Decimal invariant.** Feed a series and assert no `number` type leaks
   (`typeof` check on every output field) — covered also by the lint rule.
9. **Determinism.** Same inputs twice ⇒ byte-identical JSON.

Every rule in `05-FINDINGS-ENGINE.md` reads from this shape; the fixtures above
double as fact fixtures for rule tests.
