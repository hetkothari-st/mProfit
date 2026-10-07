# 03 — Scoring

`services/mfAnalytics/mfScoring/`. Produces one `MfSchemeScore` row per scheme
per month per methodology version. Every number in a score must be traceable
to a metric percentile, and every percentile to a universe.

---

## 1. Universes (`mfPeerRank.service.ts`)

`universeKey = "<sebiSubCategory>|<planType>"`.

Membership rules:
- `status = ACTIVE`
- `sebiSubCategory ≠ 'UNMAPPED'`
- has NAV history covering the horizon (per-horizon membership; a fund can be
  in the 3y universe but not the 5y)
- `optionType = GROWTH` only (IDCW options are the same portfolio; including
  them double-counts). Users holding IDCW options are mapped to the growth
  option's score via `MfSchemeMeta` sibling lookup (same ISIN prefix / AMC +
  name minus option suffix — store `growthSiblingSchemeCode` on meta).

Minimum size: **10 schemes**. Smaller universe ⇒ `ratingStatus: CATEGORY_TOO_SMALL`;
metrics and percentiles still published, rating withheld.

Percentile rank (higher = better, direction per metric):
```
pct = (count(worse) + 0.5 × count(equal)) / n
```
Direction table lives in `mfScoreMath.ts`: higher-is-better for returns,
Sharpe, Sortino, alpha, IR, up-capture, batting, consistency, active share,
manager tenure, AUM (up to a cap); lower-is-better for σ, downside dev,
drawdown magnitude, down-capture, TER, HHI, top-10, style drift,
manager changes, tracking error (index model only), below-AA %.

---

## 2. Model selection

`modelKey` chosen from `sebiCategory` + `sebiSubCategory`:

| Sub-categories | modelKey |
|---|---|
| Large, Large & Mid, Mid, Small, Multi, Flexi, Focused, Value, Contra, Dividend Yield, Sectoral/Thematic, ELSS | `ACTIVE_EQUITY` |
| Index Funds, ETFs | `INDEX` |
| Overnight, Liquid, Ultra Short, Low Duration, Money Market | `DEBT_ULTRA_SHORT` |
| Short, Medium, Medium-to-Long, Long, Dynamic Bond, Corporate Bond, Credit Risk, Banking & PSU, Gilt, Gilt 10y, Floater | `DEBT_DURATION` |
| Aggressive Hybrid, Balanced Hybrid, Dynamic Asset Allocation, Multi Asset, Equity Savings, Conservative Hybrid, Arbitrage | `HYBRID` |
| Retirement, Children's | `SOLUTION` (uses HYBRID model) |
| FoF (domestic / overseas) | `FOF` (ACTIVE_EQUITY model with cost pillar doubled — FoFs have layered TERs) |

Sectoral/thematic funds are scored within their own sub-category universe, and
the finding engine adds a `THEMATIC_CONCENTRATION` note regardless of score.

---

## 3. Horizon blending

Pillars that use horizon-dependent inputs blend percentiles:

| Available horizons | Weights (3y / 5y / 10y) |
|---|---|
| 3, 5, 10 | 20 / 30 / 50 |
| 3, 5 | 40 / 60 |
| 3 only | 100 |
| < 3 | no rating (`INSUFFICIENT_HISTORY`) |

The blend is on the *percentile*, not the raw metric. This is the Morningstar
approach and it rewards funds that were good across a whole cycle rather than a
recent hot streak.

---

## 4. Model: `ACTIVE_EQUITY` (`score-active-equity-v1`)

| Pillar | Weight | Inputs (each a blended percentile) | Input weights |
|---|---|---|---|
| `PERFORMANCE` | 30 | `sortino`, `informationRatio`, `jensenAlphaAnn` | 40 / 30 / 30 |
| `CONSISTENCY` | 20 | `rollingBeatBenchPct` (3y), `rollingBeatCategoryPct` (3y), `quartileConsistency` | 40 / 40 / 20 |
| `DOWNSIDE` | 20 | `downCapture`, `maxDrawdown`, `worstCalendarYear` | 40 / 40 / 20 |
| `COST` | 15 | `terPercentile` | 100 |
| `PORTFOLIO` | 10 | `activeShare`, `hhi` (inverse), `styleDrift` (inverse) | 40 / 30 / 30 |
| `PEOPLE_PARENT` | 5 | `managerTenureYears`, `managerChangesLast3y` (inverse), `amcQualitativeScore` | 40 / 30 / 30 |

`amcQualitativeScore` ∈ [0,1] from `MfSchemeQualitativeFact` rows of type
`AMC_REGULATORY_ACTION` (−0.5 if within 3 years), `AMC_FRONT_RUNNING` (−0.5),
default 1.0. Treated as a raw score, not a percentile.

**Pillar score** = weighted mean of input percentiles that have `status: OK`,
re-normalising weights across the available inputs. A pillar with **no** OK
inputs gets `score: null` and its weight is redistributed proportionally across
the remaining pillars. A rating requires `PERFORMANCE` and `CONSISTENCY` to be
non-null; otherwise `INSUFFICIENT_HISTORY`.

**Composite** = Σ pillar.score × pillar.weight, on 0–100.

---

## 5. Model: `INDEX` (`score-index-v1`)

Alpha is meaningless here; the fund's job is to track cheaply.

| Pillar | Weight | Inputs |
|---|---|---|
| `TRACKING` | 45 | `trackingErrorAnn` (inverse, 1y and 3y blended 50/50), `outperformanceAnn` vs own index (closeness to zero from below: penalise `|outperformance + TER|`) |
| `COST` | 35 | `terPercentile` |
| `SCALE` | 15 | `aumCategoryPercentile` (liquidity proxy), `aumGrowth12mPct` |
| `STRUCTURE` | 5 | ETF: bid-ask / iNAV deviation if available; index fund: `cashPct` (inverse) |

Universe: schemes tracking the **same** index, plan type. If < 10 ⇒ fall back
to the broad "Index Funds / ETFs" sub-category universe and note it.

---

## 6. Model: `DEBT_DURATION` (`score-debt-duration-v1`)

| Pillar | Weight | Inputs |
|---|---|---|
| `PERFORMANCE` | 25 | `sharpe`, `outperformanceAnn` vs benchmark |
| `CREDIT_QUALITY` | 25 | `belowAAPct` (inverse), `topIssuerPct` (inverse), `creditQualitySplit.sov + aaa` |
| `CONSISTENCY` | 15 | `rollingBeatBenchPct` (1y window for debt), `pctNegativeMonths` (inverse) |
| `DOWNSIDE` | 15 | `maxDrawdown`, `worstMonth` |
| `COST` | 15 | `terPercentile` |
| `MANDATE_FIT` | 5 | `modifiedDuration` inside the SEBI band for the sub-category (binary 1/0 as raw score) |

`DEBT_ULTRA_SHORT`: same pillars, weights 15 / 35 / 15 / 15 / 15 / 5 — credit
matters more, return dispersion is tiny.

---

## 7. Model: `HYBRID` (`score-hybrid-v1`)

`ACTIVE_EQUITY` pillars with `DOWNSIDE` raised to 25 and `PERFORMANCE` lowered
to 25; benchmark is the hybrid composite index. `PORTFOLIO` pillar adds
`equityAllocationDrift` — deviation of the equity share from the sub-category
band across the last 12 snapshots (inverse).

---

## 8. Rating buckets

Composite → rating within the universe by fixed distribution (Morningstar bell):

| Rating | Composite percentile within universe |
|---|---|
| 5 | top 10% |
| 4 | next 22.5% |
| 3 | middle 35% |
| 2 | next 22.5% |
| 1 | bottom 10% |

Ties at a boundary go to the higher rating. The rating is relative; the
composite is what the UI shows as the number.

---

## 9. Versioning and re-runs

- `methodologyVersion` string is a constant per model file. Any change to
  weights, inputs, direction, blending or bucket cut-offs **bumps the version**
  and updates `docs/mf-analytics/METHODOLOGY-CHANGELOG.md` (create on first bump).
- `mfScoreJob` writes a new row per `(schemeCode, asOf, methodologyVersion)`.
  It never updates. Re-running for the same `asOf` and version is a no-op
  (unique constraint + identical inputs).
- The API returns the latest row per scheme; a `?version=` query allows the
  admin methodology page to compare.
- A backtest (`06-QUALITY-COMPLIANCE.md §3`) is required before a new version
  becomes the default.

---

## 10. Explainability payload

Each `MfSchemeScore.pillars` entry stores, per input:

```json
{ "value": "1.120000", "percentile": "0.780000", "status": "OK",
  "universeMedian": "0.870000", "horizonBlend": {"3": "0.71", "5": "0.80", "10": "0.79"} }
```

so the UI and the findings engine can say "Sortino 1.12 vs category median 0.87
(78th percentile), consistent across 3, 5 and 10 years" without recomputation.

---

## 11. Tests (`test/services/mfAnalytics/mfScoring/`)

1. **Percentile math**: 5 values with ties ⇒ exact expected percentiles.
2. **Direction table**: every input named in a model has a direction entry
   (test iterates models and asserts coverage — catches a new input added
   without direction).
3. **Weight re-normalisation**: drop one input ⇒ remaining weights sum to 1;
   drop a whole pillar ⇒ composite still 0–100 and other pillar weights scale.
4. **Horizon blend**: synthetic percentiles per horizon ⇒ expected blend for
   each availability case.
5. **Rating buckets**: universe of 40 synthetic composites ⇒ 4/9/14/9/4 split.
6. **Insufficient history**: 30 months ⇒ `INSUFFICIENT_HISTORY`, `rating: null`,
   `composite: null`, pillars still reported where computable.
7. **Small universe**: 8 schemes ⇒ `CATEGORY_TOO_SMALL`.
8. **Append-only**: score job twice ⇒ one row; bump version constant in a test
   double ⇒ two rows, first unchanged byte-for-byte.
9. **IDCW mapping**: user holds IDCW option ⇒ score resolved from growth sibling.
