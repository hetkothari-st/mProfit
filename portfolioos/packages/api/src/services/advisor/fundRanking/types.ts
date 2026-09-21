/**
 * The fund-ranking contract.
 *
 * Everything in this folder is pure: plain inputs, plain outputs, no Prisma, no
 * clock, no randomness. That is not a style preference — a ranking that cannot
 * be unit-tested without a database is a ranking whose output cannot be
 * defended to the person who acted on it, which is the same reason
 * `AdvisorFacts` exists (see ../types.ts).
 */

import type { Decimal } from 'decimal.js';
import type { AdvisorAssetBucketValue } from '../types.js';
import type { NavGap } from './navGaps.js';

// ─── Inputs ──────────────────────────────────────────────────────

/** One scheme, as the ranking sees it. Everything optional is genuinely
 *  optional: `null` means "we do not hold this", never zero. */
export interface FundCandidate {
  schemeCode: string;
  schemeName: string;
  amcName: string;
  /** MutualFundMaster.category — EQUITY, DEBT, INDEX_FUND, ETF, … */
  category: string;
  /** The raw AMFI header line; carries the SEBI category and open/close-ended. */
  subCategory: string | null;
  isin: string | null;
  isActive: boolean;
  /** AMFI's published Plan / Option columns. Preferred over reading the scheme
   *  name: the name was the weakest link in the gate that keeps regular plans
   *  out of advice. Null on rows loaded before the 8-column NAVAll format. */
  planType: string | null;
  optionType: string | null;
  /** Ascending by date. The only history we actually have. */
  navHistory: NavObservation[];
  /** Direct-plan TER from AMFI's published file. Null means unknown — never
   *  zero, which would rank an unpriced fund as the cheapest in its bucket. */
  terPct: number | null;
  /** MATCHED | UNMATCHED | AMBIGUOUS from the last TER refresh; see terJoin.ts. */
  terJoinStatus: string | null;
  /**
   * The largest hole in this fund's NAV history, when the caller measured it
   * somewhere other than from `navHistory`.
   *
   * The scoring run holds every observation and lets `readTraits` compute it.
   * The release gate does not — it loads two dates per scheme, because
   * loading every NAV for every fund at boot would read tens of millions of
   * rows — so it measures gaps in SQL and passes the answer in. Absent means
   * "not measured elsewhere, compute it from the history".
   */
  navGap?: NavGap | null;
  aumInr: Decimal | null;
  managerTenureYears: number | null;
  benchmarkTri: NavObservation[] | null;
}

export interface NavObservation {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  nav: number;
}

// ─── Eligibility ─────────────────────────────────────────────────

export const EXCLUSION_REASONS = [
  'inactive',
  'regular_plan',
  'plan_unknown',
  'not_growth_option',
  'option_unknown',
  'category_unknown',
  'category_not_in_bucket',
  'close_ended',
  'segregated_portfolio',
  'nfo_or_no_history',
  'track_record_too_short',
  'nav_stale',
  'nav_history_gap',
  'aum_below_floor',
  'aum_unknown',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export interface EligibilityResult {
  eligible: boolean;
  reasons: ExclusionReason[];
  /** What we decided the scheme is, from name and category. */
  traits: FundTraits;
  /**
   * The persisted form of `reasons`, as written to
   * `FundScoreSnapshot.exclusionReasons`.
   *
   * Most reasons are complete in themselves — "regular_plan" says everything
   * there is to say. `nav_history_gap` is not: "this fund has a hole" is
   * useless without "where, and how big", and that span is the whole content
   * of the finding. So a reason that carries evidence is written as an object
   * beside the plain tokens rather than being flattened into one.
   *
   * Readers that ask `reasons.includes('regular_plan')` keep working; a
   * reader that wants the span asks for the object. `reasonTokens()` reads
   * either shape.
   */
  detailedReasons: DetailedExclusionReason[];
}

/** A plain reason, or one carrying the evidence behind it. */
export type DetailedExclusionReason =
  | ExclusionReason
  | { reason: 'nav_history_gap'; from: string; to: string; tradingDaysMissing: number };

/** The reason tokens from either shape, for callers that only want the set. */
export function reasonTokens(reasons: readonly DetailedExclusionReason[]): ExclusionReason[] {
  return reasons.map((r) => (typeof r === 'string' ? r : r.reason));
}

export interface FundTraits {
  plan: 'DIRECT' | 'REGULAR' | 'UNKNOWN';
  option: 'GROWTH' | 'IDCW' | 'UNKNOWN';
  structure: 'OPEN_ENDED' | 'CLOSE_ENDED' | 'UNKNOWN';
  /** Index funds and ETFs are scored on cost and tracking, never on returns. */
  passive: boolean;
  segregatedPortfolio: boolean;
  trackRecordYears: number | null;
  navAgeDays: number | null;
  /** The biggest hole inside the fund's own NAV history; see navGaps.ts. */
  navGap: NavGap | null;
}

// ─── Metrics ─────────────────────────────────────────────────────

export interface FundMetrics {
  /** Rolling N-year returns, stepped monthly, annualised, in percent. */
  rollingReturnsPct: number[];
  /** Share of rolling windows that beat the category median, 0–100. */
  outperformanceConsistencyPct: number | null;
  /** Share of the peer/benchmark downside the fund captured, in percent.
   *  Lower is better; 100 means it fell exactly as much as its comparator. */
  downsideCapturePct: number | null;
  sortino: number | null;
  maxDrawdownPct: number | null;
  /** Passive only. Annualised NAV return minus comparator return. */
  trackingDifferencePct: number | null;
  /** Passive only. Annualised standard deviation of the return difference. */
  trackingErrorPct: number | null;
  /** True when tracking numbers are measured against the median of same-index
   *  peers rather than the real benchmark TRI, because we have no TRI. */
  trackingIsPeerRelative: boolean;
  observations: number;
}

// ─── Scoring ─────────────────────────────────────────────────────

/** A metric that could not be computed, and the weight it gave up. The weight
 *  is redistributed across the metrics that survived — never treated as zero,
 *  which would silently rank a fund as the worst rather than as unknown. */
export interface DataGap {
  metric: string;
  reason: string;
  weightReleased: number;
}

export interface FundScore {
  schemeCode: string;
  bucket: AdvisorAssetBucketValue;
  /** 0–100, percentile-normalised within the bucket. Null when nothing could
   *  be scored at all. */
  score: number | null;
  /** Each scored component, already percentile-normalised, with its weight. */
  components: ScoreComponent[];
  dataGaps: DataGap[];
  model: 'PASSIVE' | 'ACTIVE';
}

export interface ScoreComponent {
  metric: string;
  /** The raw metric value, for the evidence trail. */
  raw: number;
  /** 0–100 within the bucket, already oriented so higher is better. */
  percentile: number;
  weight: number;
}

// ─── Methodology config ──────────────────────────────────────────

/** The per-client selection parameters. Named separately because selection is
 *  pure and travels to the rules on its own, without the scoring weights. */
export interface SelectionConfig {
  incumbentRankBand: number;
  hysteresisMarginPct: number;
  hysteresisSnapshots: number;
  maxAmcSharePct: number;
  overlapPenaltyPerPct: number;
  maxOverlapPct: number;
  /** Below this many days held, a switch is suppressed: exit load is unknown,
   *  and most equity funds charge one inside a year. See selection.ts. */
  minHoldingDaysForSwitch?: number;
}

export interface MethodologyConfig {
  eligibility: {
    minTrackRecordYearsActive: number;
    minTrackRecordYearsPassive: number;
    minAumInr: number;
    /** v2: a scheme we cannot size is ineligible rather than scored without
     *  its size. With no AUM source at all (v1) this had to be false, or the
     *  universe would have been empty. */
    requireAum?: boolean;
    requireDirectPlan: boolean;
    requireGrowthOption: boolean;
    requireOpenEnded: boolean;
    maxNavStalenessDays: number;
    /**
     * The longest run of TRADING days a fund may miss inside its own NAV
     * history before it is excluded. Trading days, not calendar days: a
     * calendar threshold loose enough to survive Diwali is too loose to
     * catch a real outage. Default 5 when absent — a fund that has not
     * priced for a week is not one to rank, let alone recommend.
     */
    maxNavGapTradingDays?: number;
    /**
     * The longest run of consecutive WEEKDAYS the universe-derived trading
     * calendar may be missing before the scoring run refuses to write.
     *
     * Not a bound on real holidays — it sits just above the longest cluster
     * the Indian market can legitimately close for (three weekdays at the
     * outside), because the calendar is derived from the same feed the funds
     * are, so a dead feed makes every fund look healthy against a calendar
     * that stopped with it. Default 4 when absent.
     */
    maxCalendarGapWeekdays?: number;
  };
  metrics: {
    rollingReturnYears: number;
    rollingStepMonths: number;
    minRollingWindows: number;
    riskFreeRatePct: number;
  };
  scoringActive: Record<string, number>;
  scoringPassive: Record<string, number>;
  selection: SelectionConfig;
  /** Release-gate thresholds: the share of otherwise-eligible schemes that
   *  must have each figure before named-fund advice may boot. */
  coverage?: {
    minTerCoveragePct: number;
    minAumCoveragePct: number;
    /**
     * The fewest eligible candidates a bucket may have before naming funds
     * from it is a pretence. A bucket with two eligible schemes is not being
     * ranked — whichever one wins, the client gets the only real option and
     * the AMC cap and hysteresis rules have nothing to work with.
     *
     * Only buckets an active ModelPortfolio actually allocates to are
     * checked; a bucket nothing invests in needs no depth.
     */
    minCandidatesPerBucket?: number;
  };
  snapshotMaxAgeDays: number;
}
