/**
 * API-boundary types for the mutual fund analytics layer.
 *
 * This is the contract. The frontend imports from here and never redeclares a
 * shape locally — the `/advisor` page once crashed on first load precisely
 * because it declared its own version of a server type and `tsc` had nothing
 * to compare against (CONTEXT.md §11). Every controller returns one of these
 * and nothing else.
 *
 * Three conventions run through the whole file:
 *
 *  1. **Numerics are branded Decimal strings.** `Money`, `Ratio` and `Pct`,
 *     never `number`. The exceptions are genuine counts and day-differences,
 *     which are integers by nature and carry no precision risk.
 *
 *  2. **A value that could not be computed is `null` with a status beside
 *     it, never `0`.** `02-METRICS.md §1`: a consumer that receives a
 *     non-`OK` metric renders it as unavailable. Zero is a real Sharpe ratio;
 *     using it to mean "we don't know" is how a fund with no benchmark ends
 *     up displayed as a fund with no alpha.
 *
 *  3. **`asOf` travels with the data.** Every computed artefact carries the
 *     date it was computed against, because the backtest, the reconciliation
 *     job and the "why did this change?" question all depend on being able to
 *     re-derive a number from the inputs available at that instant.
 */

import type { Money } from './decimal.js';
import type { Ratio, Pct } from './ratio.js';
import type {
  MfModelKey,
  SebiCategory,
  SebiSubCategory,
} from './sebiCategories.js';

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * Mirrors the `MfMetricStatus` Prisma enum. This is the same pattern as
 * `cii_unavailable` in `capitalGains.service.ts`: the calculator reports why
 * it could not answer rather than returning a plausible-looking number the
 * caller cannot distinguish from a real one.
 */
export type MfMetricStatus =
  | 'OK'
  | 'INSUFFICIENT_DATA'
  | 'BENCHMARK_UNAVAILABLE'
  | 'STALE'
  | 'QUARANTINED'
  /**
   * The metric is undefined for this fund *by construction*, not missing.
   *
   * Treynor at a beta of 0.05, Calmar over a fund that has never fallen 1%,
   * a CAGR at the 1-year horizon where SEBI mandates an absolute figure: in
   * each case every input was present and the ratio simply has no meaning.
   *
   * This is not in `00-README.md`'s five-value list, and it is added
   * deliberately. The alternative was `status: 'OK'` with a null value, which
   * breaks invariant 4 in the most dangerous direction available: that
   * invariant tells consumers to render a *non-OK* metric as unavailable, so
   * `OK` is the one status that licenses rendering the number — and the
   * number is null. A consumer following the documented contract to the
   * letter would print 0.00 for a fund whose Treynor is undefined, which is
   * precisely the "never render a null as zero" failure the whole status
   * vocabulary exists to prevent. `INSUFFICIENT_DATA` was the other option
   * and is also wrong: it sends the UI hunting for history that need not
   * exist, and makes a correctly-un-ranked liquid fund look under-covered.
   *
   * Mirrors the third-state pattern already established for
   * `hasNoCover === null` in the family layer (CONTEXT.md §6): "does not
   * apply" is a distinct answer from both "yes" and "we don't know".
   */
  | 'NOT_APPLICABLE';

/** Mirrors `MfRatingStatus`. */
export type MfRatingStatus =
  | 'RATED'
  | 'INSUFFICIENT_HISTORY'
  | 'CATEGORY_TOO_SMALL'
  | 'NOT_APPLICABLE';

export type MfPlanType = 'DIRECT' | 'REGULAR';
export type MfOptionType = 'GROWTH' | 'IDCW_PAYOUT' | 'IDCW_REINVEST';
export type MfSchemeStatus = 'ACTIVE' | 'MERGED' | 'WOUND_UP' | 'SUSPENDED';
export type MfHoldingKind =
  | 'EQUITY'
  | 'DEBT'
  | 'CASH'
  | 'DERIVATIVE'
  | 'REIT_INVIT'
  | 'GOLD'
  | 'OTHER';

/** The five reporting horizons, plus 0 for "current portfolio" (`02 §7`). */
export type MfHorizonYears = 1 | 3 | 5 | 7 | 10;
export const MF_HORIZONS: readonly MfHorizonYears[] = [1, 3, 5, 7, 10] as const;

/**
 * A value paired with the reason it might be missing. Used wherever a single
 * scalar needs its own status rather than sharing the block-level one — a
 * benchmark gap invalidates alpha but not standard deviation, so they cannot
 * share a status field.
 */
export interface MfValue<T> {
  value: T | null;
  status: MfMetricStatus;
  statusReason?: string;
}

// ---------------------------------------------------------------------------
// Scheme metadata
// ---------------------------------------------------------------------------

/** Parsed exit-load ladder: "1% if redeemed within 365 days". */
export interface MfExitLoadRule {
  daysUpTo: number;
  pct: Pct;
}

/** Mirrors `MfSchemeMeta`, minus ingestion internals (`sourceHash`, `fetchedAt`). */
export interface MfSchemeMetaDto {
  schemeCode: string;
  isin: string | null;
  schemeName: string;
  amcCode: string;
  amcName: string;
  sebiCategory: SebiCategory;
  /** `UNMAPPED` for schemes whose AMFI category text we could not resolve. */
  sebiSubCategory: SebiSubCategory | 'UNMAPPED';
  planType: MfPlanType;
  optionType: MfOptionType;
  /** Always a Total Return Index code; PRI benchmarks are rejected at ingest. */
  benchmarkIndexCode: string | null;
  inceptionDate: string;
  status: MfSchemeStatus;
  statusChangedAt: string | null;
  /**
   * Set only where the surviving scheme's mandate is unchanged. We do not
   * splice a predecessor's NAV history into the survivor's return series —
   * that would rewrite the fund's risk history (`01 §7`).
   */
  predecessorSchemeCode: string | null;
  /**
   * IDCW options share a portfolio with their growth sibling, so they are
   * scored once, on the growth option, and IDCW holders resolve through here
   * (`03 §1`).
   */
  growthSiblingSchemeCode: string | null;
  /** SEBI expects this displayed wherever a scheme is presented (`06 §4`). */
  riskometer: string | null;
  exitLoadText: string | null;
  exitLoadRules: MfExitLoadRule[] | null;
  minSip: Money | null;
  /** Age in years at `asOf`; convenience for the "unrated until" copy. */
  fundAgeYears: Ratio | null;
}

// ---------------------------------------------------------------------------
// Return / risk metrics (`02-METRICS.md §9`)
// ---------------------------------------------------------------------------

/** Distribution of rolling-window CAGRs (`02 §2.2`). */
export interface MfRollingStats {
  windowYears: 1 | 3 | 5;
  observations: number;
  mean: Ratio | null;
  median: Ratio | null;
  min: Ratio | null;
  max: Ratio | null;
  p10: Ratio | null;
  p25: Ratio | null;
  p75: Ratio | null;
  p90: Ratio | null;
  pctNegative: Ratio | null;
  pctBelowBenchmark: Ratio | null;
  pctBelowCategoryMedian: Ratio | null;
}

export interface MfCalendarYearRow {
  year: number;
  fund: Ratio | null;
  benchmark: Ratio | null;
  categoryMedian: Ratio | null;
  /** 1-based rank within the category universe for that year. */
  rank: number | null;
  universeSize: number | null;
  quartile: 1 | 2 | 3 | 4 | null;
}

export interface MfReturnMetrics {
  /** Annualised for horizons >= 1y. Null for horizon 1, which reports `absolute`. */
  cagr: Ratio | null;
  /** SEBI convention: sub-1-year performance is stated absolute, not annualised. */
  absolute: Ratio | null;
  benchmarkCagr: Ratio | null;
  categoryMedianCagr: Ratio | null;
  rolling1y: MfRollingStats | null;
  rolling3y: MfRollingStats | null;
  rolling5y: MfRollingStats | null;
  calendarYears: MfCalendarYearRow[];
  /** XIRR of a hypothetical monthly SIP over the horizon (`02 §2.4`). */
  sipXirr: Ratio | null;
}

export interface MfRiskMetrics {
  stdDevAnn: Ratio | null;
  downsideDevAnn: Ratio | null;
  /** Negative: -0.30 is a 30% peak-to-trough fall. From the daily series. */
  maxDrawdown: Ratio | null;
  maxDrawdownDurationDays: number | null;
  /** Null means "has not recovered yet", which is distinct from "recovered in 0 days". */
  recoveryDays: number | null;
  worstMonth: Ratio | null;
  bestMonth: Ratio | null;
  worstCalendarYear: Ratio | null;
  /** Historical 5th percentile of monthly returns, not the parametric estimate. */
  var95Monthly: Ratio | null;
  cvar95Monthly: Ratio | null;
  pctNegativeMonths: Ratio | null;
}

export interface MfRiskAdjustedMetrics {
  sharpe: Ratio | null;
  sortino: Ratio | null;
  beta: Ratio | null;
  jensenAlphaAnn: Ratio | null;
  /** Null when beta <= 0.1 — the ratio explodes and means nothing there. */
  treynor: Ratio | null;
  trackingErrorAnn: Ratio | null;
  informationRatio: Ratio | null;
  /** Null when the drawdown is shallower than -1%, for the same reason. */
  calmar: Ratio | null;
  omega: Ratio | null;
  /** Modigliani M2: the fund's return restated at benchmark risk. */
  m2: Ratio | null;
}

export interface MfRelativeMetrics {
  upCapture: Ratio | null;
  downCapture: Ratio | null;
  captureRatio: Ratio | null;
  battingAverage: Ratio | null;
  outperformanceAnn: Ratio | null;
}

export interface MfConsistencyMetrics {
  rollingBeatBenchPct: Ratio | null;
  rollingBeatCategoryPct: Ratio | null;
  /** Most recent 5 calendar years, oldest first. */
  quartileHistory: Array<{ year: number; quartile: 1 | 2 | 3 | 4 | null }>;
  quartileConsistency: Ratio | null;
  /**
   * True when the category medians behind these figures include schemes that
   * later merged or wound up. We always compute it that way — excluding the
   * dead funds would flatter every survivor — and say so rather than leaving
   * the reader to assume either.
   */
  survivorshipAdjusted: boolean;
}

/**
 * One horizon's full quantitative profile. Mirrors the `metrics` Json column
 * on `MfSchemeMetrics`.
 */
export interface MfHorizonMetrics {
  asOf: string;
  horizonYears: MfHorizonYears;
  observationsMonthly: number;
  status: MfMetricStatus;
  statusReason?: string;
  benchmarkCode: string | null;
  riskFreeSeries: string | null;
  mathVersion: string;
  returns: MfReturnMetrics;
  risk: MfRiskMetrics;
  riskAdjusted: MfRiskAdjustedMetrics;
  relative: MfRelativeMetrics;
  consistency: MfConsistencyMetrics;
  /**
   * Per-field status, keyed by dotted path ("riskAdjusted.sortino"). A null in
   * any block above is always accompanied by an entry here, so the UI can say
   * *why* a number is missing instead of rendering a dash.
   */
  fieldStatus: Record<string, MfMetricStatus>;
}

// ---------------------------------------------------------------------------
// Current portfolio + structural profile (the horizon-0 row, `02 §7-8`)
// ---------------------------------------------------------------------------

export interface MfMarketCapSplit {
  large: Pct | null;
  mid: Pct | null;
  small: Pct | null;
  /** ISINs we could not place on the AMFI half-yearly list. Reported, not hidden. */
  unclassified: Pct | null;
}

export interface MfCreditQualitySplit {
  sov: Pct | null;
  aaa: Pct | null;
  aaPlus: Pct | null;
  aa: Pct | null;
  aaMinus: Pct | null;
  aAndBelow: Pct | null;
  unrated: Pct | null;
}

export interface MfTopHolding {
  isin: string | null;
  securityName: string;
  kind: MfHoldingKind;
  weightPct: Pct;
  sector: string | null;
  marketCapBucket: 'LARGE' | 'MID' | 'SMALL' | null;
}

/**
 * Everything derived from the latest monthly portfolio disclosure and the
 * meta tables. Stored as the `horizonYears = 0` metrics row.
 */
export interface MfCurrentProfile {
  asOf: string;
  /** Disclosure date of the snapshot these numbers came from — often ~40 days
   *  behind `asOf`, which is why the UI badges it (`06 §6`). */
  snapshotAsOf: string | null;
  status: MfMetricStatus;
  statusReason?: string;

  // Portfolio characteristics
  numHoldings: number | null;
  top10WeightPct: Pct | null;
  hhi: Ratio | null;
  effectiveHoldings: Ratio | null;
  cashPct: Pct | null;
  activeShare: Ratio | null;
  marketCapSplit: MfMarketCapSplit | null;
  sectorWeights: Record<string, Pct> | null;
  sectorActiveWeights: Record<string, Pct> | null;
  /** Inferred from weight x AUM deltas across 12 snapshots — always "estimated". */
  turnoverPct: Pct | null;
  turnoverIsEstimated: boolean;
  styleBox: { cap: 'LARGE' | 'MID' | 'SMALL'; style: 'VALUE' | 'BLEND' | 'GROWTH' | null } | null;
  styleDrift: Ratio | null;
  topHoldings: MfTopHolding[];

  // Debt-only
  modifiedDuration: Ratio | null;
  /** True when duration was weighted from holding maturities rather than
   *  disclosed by the AMC — an approximation the rules must not treat as fact. */
  durationIsApproximated: boolean;
  averageMaturityYears: Ratio | null;
  ytmPct: Pct | null;
  creditQualitySplit: MfCreditQualitySplit | null;
  belowAAPct: Pct | null;
  topIssuerPct: Pct | null;

  // Structural
  terPct: Pct | null;
  terCategoryMedianPct: Pct | null;
  terPercentile: Ratio | null;
  aum: Money | null;
  aumGrowth12mPct: Pct | null;
  aumCategoryPercentile: Ratio | null;
  managerTenureYears: Ratio | null;
  managerChangesLast3y: number | null;
  currentManagers: Array<{ name: string; role: string | null; fromDate: string }>;
  fundAgeYears: Ratio | null;
  exitLoadMaxDays: number | null;

  fieldStatus: Record<string, MfMetricStatus>;
}

// ---------------------------------------------------------------------------
// Peer ranks and scores
// ---------------------------------------------------------------------------

/** Percentile per metric, higher always meaning "better" after direction is applied. */
export interface MfPeerPercentiles {
  universeKey: string;
  universeSize: number;
  percentiles: Record<string, Ratio>;
  medians: Record<string, Ratio>;
}

/** One input to a pillar, carrying enough to explain itself without recomputation. */
export interface MfPillarInput {
  value: Ratio | null;
  percentile: Ratio | null;
  status: MfMetricStatus;
  universeMedian: Ratio | null;
  /** Per-horizon percentiles before blending, keyed by horizon (`03 §10`). */
  horizonBlend?: Partial<Record<`${MfHorizonYears}`, Ratio>>;
  weight: Ratio;
}

export interface MfPillarScore {
  /** Null when no input had `status: OK`; the weight is then redistributed. */
  score: Ratio | null;
  /** Post-redistribution weight, so the pillars always sum to 1. */
  weight: Ratio;
  inputs: Record<string, MfPillarInput>;
}

export interface MfSchemeScoreDto {
  schemeCode: string;
  asOf: string;
  methodologyVersion: string;
  modelKey: MfModelKey;
  ratingStatus: MfRatingStatus;
  /** 0-100. Null unless `ratingStatus === 'RATED'`. */
  composite: Ratio | null;
  /** 1-5, by fixed distribution within the universe. Null unless RATED. */
  rating: 1 | 2 | 3 | 4 | 5 | null;
  pillars: Record<string, MfPillarScore>;
  universeKey: string;
  universeSize: number;
  computedAt: string;
  /**
   * The scheme's SEBI risk-o-meter, denormalised from `MfSchemeMetaDto`.
   *
   * Duplicated deliberately. `06-QUALITY-COMPLIANCE.md §4` requires the
   * risk-o-meter to be shown wherever a scheme is presented, and a score is
   * the most prominent presentation this layer produces. Carrying it on the
   * score makes that structural: a client cannot obtain a rating without also
   * holding the risk disclosure that must sit beside it. Leaving it only on
   * the meta DTO would make the guarantee a convention, and a convention is
   * what gets dropped when someone builds a compact score widget.
   */
  riskometer: string | null;
  /**
   * Months of NAV history behind this score, and the date the scheme becomes
   * ratable. Both null once `ratingStatus === 'RATED'`.
   *
   * `06 §6` mandates the copy "Unrated - {N} months of history (rated from
   * {date})" for `INSUFFICIENT_HISTORY`. Without these two fields the client
   * cannot render the required sentence and would fall back to a bare
   * "Unrated", which tells the user nothing about whether to wait or to look
   * elsewhere.
   */
  historyMonths: number | null;
  ratedFrom: string | null;
}

/** Admin-curated facts no feed provides (`01 §2`, `03 §4`). */
export interface MfQualitativeFactDto {
  factType: string;
  value: unknown;
  validFrom: string;
  validTo: string | null;
  source: string;
}

// ---------------------------------------------------------------------------
// Portfolio-level analysis (`04-PORTFOLIO-ANALYSIS.md §8`)
// ---------------------------------------------------------------------------

export type MfGainType = 'STCG' | 'LTCG';

export interface MfLotDto {
  schemeCode: string;
  schemeName: string;
  units: string;
  cost: Money;
  currentValue: Money;
  gain: Money;
  purchaseDate: string;
  holdingDays: number;
  gainType: MfGainType;
  /** Null when already LTCG. */
  daysToLtcg: number | null;
  /** §112A FMV-on-31-Jan-2018 cost, where it applies. */
  grandfatheredCost: Money | null;
  /** Null means we do not know this scheme's exit load, not that it is zero. */
  exitLoadPct: Pct | null;
  exitLoadInr: Money | null;
  /** At the statutory CG rate — never the income slab (CONTEXT.md §9.8). */
  taxIfSoldTodayInr: Money | null;
  harvestableLossInr: Money | null;
}

export interface MfHeldFundDto {
  schemeCode: string;
  meta: MfSchemeMetaDto;
  units: string;
  investedValue: Money;
  currentValue: Money;
  absoluteGain: Money;
  absoluteGainPct: Pct | null;
  /** XIRR over the user's real cash flows. Null if it did not converge. */
  userXirr: Ratio | null;
  userXirrStatus: MfMetricStatus;
  userXirrStatusReason?: string;
  /** The fund's own CAGR over the same window, for the timing comparison. */
  fundCagrSamePeriod: Ratio | null;
  /**
   * `userXirr - fundCagrSamePeriod`. Negative means entry/exit timing cost the
   * user relative to a lump sum on day one. Reported, never moralised — the
   * rule that surfaces it is INFO and explicitly descriptive (`05 §4`).
   */
  timingGap: Ratio | null;
  holdingPeriodDays: number;
  sipActive: boolean;
  weightInMfPortfolio: Pct;
  weightInNetWorth: Pct | null;
  score: MfSchemeScoreDto | null;
  lots: MfLotDto[];
}

export interface MfOverlapPair {
  schemeCodeA: string;
  schemeCodeB: string;
  schemeNameA: string;
  schemeNameB: string;
  /**
   * Sum of min(weight) over common ISINs, in **percent** — `55.000000` means
   * 55% of the two funds' holdings are the same securities.
   *
   * Percent, not a fraction, because the field is branded `Pct` and its source
   * (`MfPortfolioHolding.weightPct`) is already percent. An earlier version of
   * this comment said "0.50 = half", which contradicted the brand; that is the
   * exact ×100 confusion `Ratio` and `Pct` exist to make a compile error.
   *
   * Note for the `REDUNDANT_FUNDS` rule: `MfRuleConstants
   * .redundantFundsOverlapFloor` is a FRACTION (0.5). Scale before comparing.
   * `redundancyScore` on the totals block is a `Ratio` and *is* a fraction.
   */
  overlapPct: Pct;
  sameSubCategory: boolean;
  snapshotAsOfA: string;
  snapshotAsOfB: string;
  topShared: Array<{
    isin: string | null;
    securityName: string;
    weightInA: Pct;
    weightInB: Pct;
  }>;
}

export interface MfLookThroughStock {
  isin: string | null;
  securityName: string;
  /** weight_in_mf_portfolio x weight_in_fund, summed across funds. */
  effectiveWeightPct: Pct;
  effectiveWeightOfNetWorthPct: Pct | null;
  contributors: Array<{ schemeCode: string; schemeName: string; weightPct: Pct }>;
}

export interface MfAllocationComparison {
  model: string;
  actual: Record<string, Pct>;
  target: Record<string, Pct>;
  drift: Record<string, Pct>;
  /** Reuses the advisor REBALANCE tolerance constants, so the two can't disagree. */
  outsideTolerance: string[];
}

export interface MfLookThrough {
  topStocks: MfLookThroughStock[];
  sectors: Record<string, Pct>;
  /** Nifty 500 TRI sector weights, when constituents are loaded. Null otherwise. */
  sectorsBenchmark: Record<string, Pct> | null;
  marketCap: MfMarketCapSplit;
  credit: MfCreditQualitySplit | null;
  /** What actually determines the user's risk, as opposed to the fund labels. */
  assetClass: Record<string, Pct>;
  target: MfAllocationComparison | null;
  /** Funds with no usable snapshot — the look-through is a floor without them. */
  fundsWithoutHoldings: string[];
}

export interface MfCostSummary {
  /**
   * Null when no held fund has a known TER — never `0`.
   *
   * Zero is a real (and excellent) expense ratio, so using it for "we don't
   * know" tells the user their portfolio is free. Where SOME funds disclose a
   * TER the mean is taken over that known subset and `annualCostInr` is
   * charged on the same subset, so both are a FLOOR; `MfCostSummary.byFund`
   * carries `terPct: null` per fund so the gap is visible rather than implied.
   */
  weightedTerPct: Pct | null;
  /** Null under the same condition as `weightedTerPct`, and for the same reason. */
  annualCostInr: Money | null;
  /**
   * TER difference between each REGULAR plan held and its DIRECT sibling,
   * times current value. Usually the single largest actionable number in a
   * retail portfolio.
   */
  directPlanSavingsInr: Money;
  costCategoryPercentile: Ratio | null;
  /** Per-fund breakdown so the number is auditable, not just asserted. */
  byFund: Array<{
    schemeCode: string;
    terPct: Pct | null;
    directSiblingSchemeCode: string | null;
    directSiblingTerPct: Pct | null;
    annualSavingsInr: Money | null;
  }>;
}

export interface MfTaxSummary {
  unrealisedStcg: Money;
  unrealisedLtcg: Money;
  /** ₹1.25 lakh §112A allowance minus LTCG already realised this FY. */
  ltcgExemptionHeadroomInr: Money;
  financialYear: string;
  harvestCandidates: MfLotDto[];
  lots: MfLotDto[];
}

export interface MfGoalFitDto {
  goalId: string;
  goalName: string;
  targetDate: string;
  horizonYears: Ratio;
  schemeCodes: string[];
  suitability: 'SUITABLE' | 'MISMATCH' | 'UNDERPOWERED';
  reason: string;
  /**
   * Projected using the fund's **category median** rolling return, not its
   * own past return. Using the fund's own history is the classic
   * over-promise, and it is the number every brochure quotes.
   */
  projectedValue: Money | null;
  projectionBasis: 'CATEGORY_MEDIAN_ROLLING';
  targetValue: Money | null;
  shortfall: Money | null;
}

export interface MfPortfolioTotals {
  investedValue: Money;
  currentValue: Money;
  absoluteGain: Money;
  portfolioXirr: Ratio | null;
  portfolioXirrStatus: MfMetricStatus;
  /**
   * Null when no held fund has a known TER — never `0`.
   *
   * Zero is a real (and excellent) expense ratio, so using it for "we don't
   * know" tells the user their portfolio is free. Where SOME funds disclose a
   * TER the mean is taken over that known subset and `annualCostInr` is
   * charged on the same subset, so both are a FLOOR; `MfCostSummary.byFund`
   * carries `terPct: null` per fund so the gap is visible rather than implied.
   */
  weightedTerPct: Pct | null;
  /** Null under the same condition as `weightedTerPct`, and for the same reason. */
  annualCostInr: Money | null;
  directPlanSavingsInr: Money;
  /** 1 / sum(w_f^2): diversification across funds, not within them. */
  effectiveFundCount: Ratio;
  redundancyScore: Ratio | null;
  fundCount: number;
  equityFundCount: number;
}

/**
 * Family-view honesty (CONTEXT.md §6). When `partial` is true every aggregate
 * above is a **floor**, and the UI must say so — a restricted net worth
 * rendered as a total is a lie of omission, and rendering a hidden category as
 * ₹0 is worse.
 */
export interface MfAnalysisScope {
  partial: boolean;
  hiddenCategories: string[];
  memberCount: number | null;
}

export interface MfPortfolioAnalysisDto {
  asOf: string;
  runId: string;
  totals: MfPortfolioTotals;
  funds: MfHeldFundDto[];
  overlap: { pairs: MfOverlapPair[]; debtPairs: MfOverlapPair[] };
  lookThrough: MfLookThrough;
  cost: MfCostSummary;
  tax: MfTaxSummary;
  goals: MfGoalFitDto[];
  scope: MfAnalysisScope;
}

// ---------------------------------------------------------------------------
// Findings and verdicts (`05-FINDINGS-ENGINE.md §1-3`)
// ---------------------------------------------------------------------------

export type MfFindingSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';

export type MfFindingCategory =
  | 'PERFORMANCE'
  | 'RISK'
  | 'COST'
  | 'PORTFOLIO'
  | 'PEOPLE'
  | 'DEBT'
  | 'INDEX'
  | 'DATA'
  | 'USER'
  | 'TAX'
  | 'ALLOCATION'
  | 'GOAL';

/** One cited number behind a finding. The finding is only as good as these. */
export interface MfEvidence {
  /** Dotted path into `MfHorizonMetrics` / `MfCurrentProfile`, e.g. "riskAdjusted.sortino". */
  metric: string;
  label: string;
  horizonYears?: MfHorizonYears;
  value: Ratio | null;
  categoryMedian?: Ratio | null;
  percentile?: Ratio | null;
  benchmarkValue?: Ratio | null;
  unit: 'ratio' | 'pct' | 'inr' | 'days' | 'count';
}

export interface MfFinding {
  id: string;
  runId: string;
  /** Null for a portfolio-level finding. */
  schemeCode: string | null;
  ruleId: string;
  ruleVersion: string;
  code: string;
  category: MfFindingCategory;
  severity: MfFindingSeverity;
  /** 0-1. Scales with evidence quality: 10y data 1.0, 3y only 0.7, no benchmark 0.5. */
  confidence: Ratio;
  /** <= 120 chars, filled from a deterministic template. Never LLM-written. */
  headline: string;
  evidence: MfEvidence[];
  /**
   * Mandatory. A finding that cannot say what would clear it is an opinion,
   * not an observation, and the user has no way to act on or dispute it.
   */
  whatWouldChangeThis: string;
  createdAt: string;
}

export type MfVerdictKind =
  | 'HOLD'
  | 'MONITOR'
  | 'REVIEW'
  | 'SWITCH_CANDIDATE'
  | 'INSUFFICIENT_DATA';

export interface MfSwitchCost {
  exitLoadInr: Money;
  taxInr: Money;
  /**
   * (exitLoad + tax) / (expectedEdge x currentValue / 12), where the edge is
   * the category-median TER difference plus half the composite gap mapped
   * through the backtest regression coefficient — deliberately **not** the
   * replacement's past return, which is the over-promise the whole industry
   * makes on switch recommendations.
   */
  breakEvenMonths: Ratio | null;
}

export interface MfFundVerdictDto {
  id: string;
  runId: string;
  schemeCode: string;
  verdict: MfVerdictKind;
  /** Finding codes that drove it, in decision-table order. */
  reasons: string[];
  /**
   * Only ever set for SWITCH_CANDIDATE, and stripped by the API entirely when
   * `RIA_VERDICTS_ENABLED` is false — naming a replacement is regulated advice.
   */
  suggestedReplacementSchemeCode: string | null;
  suggestedReplacementName: string | null;
  switchCost: MfSwitchCost | null;
  /** Null unless `proseVerified`; failed verification shows headlines instead. */
  prose: string | null;
  proseModel: string | null;
  proseVerified: boolean;
  /** Set on the superseded row when a re-run changed the verdict. */
  supersededById: string | null;
  createdAt: string;
  /**
   * True when the API downgraded a SWITCH_CANDIDATE to REVIEW because
   * `RIA_VERDICTS_ENABLED` is false. The chip tooltip reads "analysis only"
   * rather than pretending the engine reached a milder conclusion.
   */
  advisoryGated: boolean;
}

export type MfAnalysisRunStatus = 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

/**
 * One entry per rule that ran, **including rules that emitted nothing**. This
 * is what makes "why was X not flagged?" answerable: silence becomes evidence
 * rather than the absence of it.
 */
export interface MfRuleRunRecord {
  ruleId: string;
  version: string;
  ran: boolean;
  emitted: number;
  error?: string;
}

export interface MfAnalysisRunDto {
  id: string;
  asOf: string;
  status: MfAnalysisRunStatus;
  triggeredBy: 'HOLDINGS_CHANGE' | 'SCORE_UPDATE' | 'USER_REFRESH' | 'SCHEDULE';
  startedAt: string;
  completedAt: string | null;
  portfolioAnalysis: MfPortfolioAnalysisDto;
  findings: MfFinding[];
  verdicts: MfFundVerdictDto[];
  ruleVersionsSnapshot: MfRuleRunRecord[];
  /**
   * On a PARTIAL run, the finding categories a failed rule would have covered.
   * The banner names them; the page never silently omits a section.
   */
  missingCategories: MfFindingCategory[];
}

// ---------------------------------------------------------------------------
// Composed fund view (what the fund detail page consumes)
// ---------------------------------------------------------------------------

export interface MfFundAnalyticsDto {
  meta: MfSchemeMetaDto;
  score: MfSchemeScoreDto | null;
  metrics: Partial<Record<`${MfHorizonYears}`, MfHorizonMetrics>>;
  profile: MfCurrentProfile | null;
  peer: Partial<Record<`${MfHorizonYears}`, MfPeerPercentiles>>;
  qualitative: MfQualitativeFactDto[];
  categoryStats: {
    universeKey: string;
    universeSize: number;
    medianComposite: Ratio | null;
    topQuartileComposite: Ratio | null;
  };
  /** Present only when the caller holds the scheme. */
  held: MfHeldFundDto | null;
  findings: MfFinding[];
  verdict: MfFundVerdictDto | null;
}

/**
 * One better-scoring fund in the same category, for the "alternatives" block.
 *
 * Deliberately NOT a recommendation, and the shape says so: there is no "switch
 * to this" field, no projected gain, and no ranking of the reader's options.
 * A recommendation needs the reader's holding size, cost basis, exit load and
 * capital-gains position — none of which a research page can see, and all of
 * which can turn a better fund into a worse decision.
 *
 * What this is: the funds a reader would find if they sorted the same category
 * by the same score, with the numbers that explain the difference.
 */
export interface MfAlternativeDto {
  schemeCode: string;
  schemeName: string;
  amcName: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  composite: Ratio | null;
  /** Latest disclosed expense ratio, percent units. Null when not yet ingested. */
  terPct: Pct | null;
  /** This fund's score minus the subject's, so the UI need not recompute it. */
  compositeDelta: Ratio | null;
}

export interface MfAlternativesDto {
  /** The scheme the alternatives are for. */
  schemeCode: string;
  universeKey: string;
  /** How many rated schemes the category holds — the pool these came from. */
  universeSize: number;
  asOf: string;
  subjectComposite: Ratio | null;
  subjectRating: 1 | 2 | 3 | 4 | 5 | null;
  subjectTerPct: Pct | null;
  /** Better-scoring funds, best first. Empty when the fund leads its category. */
  alternatives: MfAlternativeDto[];
}
