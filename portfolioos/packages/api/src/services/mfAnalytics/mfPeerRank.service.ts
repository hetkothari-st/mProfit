/**
 * Peer universes and percentile ranks for the mutual fund analytics layer
 * (`docs/mf-analytics/03-SCORING.md §1`, `02-METRICS.md §6`,
 * `07-IMPLEMENTATION-PLAN.md` Task 2.4).
 *
 * This module answers one question — *who is this fund actually being compared
 * against?* — and then does the comparison. Everything downstream (`mfScore`,
 * the findings engine, every "top decile" claim the UI makes) inherits the
 * answer, so each membership rule below is load-bearing and none of them is a
 * detail.
 *
 * ## The four rules, and why each exists
 *
 * 1. **`status = ACTIVE` for ranking.** A merged or wound-up scheme is not a
 *    fund a user can choose today; ranking a live fund against a corpse is
 *    ranking it against an option that does not exist.
 *
 * 2. **`sebiSubCategory ≠ 'UNMAPPED'`.** A scheme whose AMFI category text we
 *    could not resolve has no known peers. Dropping it into a guessed universe
 *    produces a *confidently wrong* rating — a large-cap fund rated against
 *    small caps looks like a defensive star. `null` is the honest answer.
 *
 * 3. **`optionType = GROWTH` only.** An IDCW option is the *same portfolio*
 *    with the same manager and the same holdings; including it counts one fund
 *    twice, which drags every percentile toward that fund's own value and
 *    inflates `universeSize` past the `MIN_UNIVERSE_SIZE` gate on categories
 *    that have not really earned it. A user who holds the IDCW option still
 *    gets a rank — resolved through `growthSiblingSchemeCode` by
 *    {@link resolveRankableSchemeCode}.
 *
 * 4. **DIRECT and REGULAR rank separately** (`00-README.md` invariant 3). The
 *    two plans differ by distributor commission alone — typically 60–120 bps,
 *    which is larger than the return dispersion inside many debt categories.
 *    Ranked together, every direct plan would out-rank every regular plan of
 *    the same fund and the score would be measuring the plan, not the manager.
 *    `universeKey()` from `@portfolioos/shared` builds the key so ranks and
 *    lookups cannot disagree about what a universe is.
 *
 * ## The ranking-vs-median survivorship split (read this before "fixing" it)
 *
 * There are **two** selections here and they are deliberately different:
 *
 *   - `rankingUniverse` — ACTIVE only. Used for every percentile.
 *   - `medianUniverse`  — ACTIVE **plus** MERGED / WOUND_UP schemes whose NAV
 *     history overlaps the window. Used for every category *median*.
 *
 * This looks like a bug. It is the survivorship-bias correction `02 §6`
 * explicitly requires. Funds do not merge at random: they merge after they
 * have underperformed badly enough that the AMC would rather the track record
 * stopped existing. Compute the category median from survivors only and you
 * have quietly deleted the bottom of the distribution — every surviving fund
 * then appears to have beaten a median that was never really there. The
 * `survivorshipAdjusted: true` flag on the consistency block says out loud
 * which convention produced the number, so a reader never has to assume.
 *
 * Percentiles keep the survivors-only universe on purpose: a percentile is a
 * statement about *choosable alternatives today*, and its accompanying
 * `universeMedian` (`03 §10`) must come from the very same set or the
 * explanation "1.12 vs a median of 0.87, 78th percentile" stops being
 * internally consistent.
 *
 * ## What this module does not do
 *
 * Percentile arithmetic and the direction table live in `mfScoring/
 * mfScoreMath.ts` and are imported, never re-implemented — two copies of the
 * tie rule is two answers to "what is the 50th percentile".
 */

import {
  Decimal,
  toDecimal,
  universeKey as buildUniverseKey,
  specFor,
  serializeRatio,
  serializeRatioOrNull,
  serializePct,
  UNMAPPED_SUBCATEGORY,
  MF_HORIZONS,
  MIN_UNIVERSE_SIZE,
} from '@portfolioos/shared';
import type {
  MfCurrentProfile,
  MfHorizonMetrics,
  MfHorizonYears,
  MfMetricStatus,
  MfPeerPercentiles,
  MfPlanType,
  MfOptionType,
  MfSchemeStatus,
  MfModelKey,
  SebiSubCategory,
  Pct,
  Ratio,
} from '@portfolioos/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import {
  MODEL_SCOPED_METRICS,
  percentileRankForMetric,
} from './mfScoring/mfScoreMath.js';
import {
  toDailySeries,
  windowStartPoint,
  horizonCagr,
  calendarYearReturns,
  EPSILON,
  type SeriesPoint,
} from './mfMetricsMath.js';

// `mfMetricsMath` and `mfScoreMath` both do this; decimal.js precision is
// global rather than per-instance, so whichever of the three loads first wins
// and they must agree.
Decimal.set({ precision: 28 });

// ---------------------------------------------------------------------------
// 0. Constants
// ---------------------------------------------------------------------------

/**
 * Bumped when anything in this file changes what a percentile *means* —
 * membership rules, the metric list, the median convention. Stored on every
 * persisted payload so a rank computed months ago stays interpretable rather
 * than silently meaning something else (the same discipline `03 §9` imposes on
 * `methodologyVersion`).
 */
export const MF_PEER_RANK_VERSION = '1.0.0';

/**
 * The rolling window behind `rollingBeatCategoryPct` (`02 §6`, `03 §4`).
 * Three years, matching `rollingBeatBenchPct`, so the two consistency inputs
 * in the CONSISTENCY pillar describe the same investor experience over the
 * same windows and differ only in what they are measured against.
 */
export const ROLLING_CATEGORY_WINDOW_YEARS = 3;

/** `02 §6`: quartile history covers at most the last five calendar years. */
export const QUARTILE_HISTORY_MAX_YEARS = 5;

/**
 * NAV rows are fetched for at most this many schemes per query.
 *
 * A universe can hold 60+ schemes and we need ~13 years of daily NAV for each
 * (the deepest horizon, 10y, plus the 3y rolling look-back that sits behind
 * its earliest window end). One unchunked `IN (…)` over that range is a
 * multi-hundred-thousand-row result held entirely in the driver before the
 * first row is usable, and it is exactly the shape of query that pushes a
 * universe past the 5-minute `JOB_TIMEOUT_MS`/`LOCK_DURATION_MS` ceiling in
 * `lib/queue.ts`. Twenty-five keeps each round trip to roughly 80k rows.
 */
export const NAV_FETCH_CHUNK_SIZE = 25;

/**
 * Years of NAV history to load: the deepest horizon plus the rolling window
 * that must sit behind that horizon's earliest window end, plus one year of
 * slack for the `WINDOW_START_TOLERANCE_DAYS` search.
 */
const NAV_LOOKBACK_YEARS = 10 + ROLLING_CATEGORY_WINDOW_YEARS + 1;

/**
 * `MfPeerRank.percentiles` is documented as `{ metricName: percentile }` and
 * stays literally that — but a percentile without its median is unusable for
 * the `03 §10` explainability payload, and the universe-derived consistency
 * values have nowhere else to live (the column set is fixed; `schema.prisma`
 * is owned elsewhere). Both are stored under `$`-prefixed keys, which cannot
 * collide with a metric name, so a reader that does `payload[metric]` still
 * sees exactly the documented shape. Never hand-parse the payload — go through
 * {@link parsePeerRankPayload}.
 */
const MEDIANS_KEY = '$medians';
const UNIVERSE_KEY_FIELD = '$universe';
const VERSION_KEY = '$version';

const RANKABLE_STATUSES: readonly MfSchemeStatus[] = ['ACTIVE', 'MERGED', 'WOUND_UP'];

/**
 * The `horizonYears` under which `MfSchemeMetrics` stores `MfCurrentProfile`
 * — the current portfolio + structural row of `02 §7-8`. `mfMetrics.service`
 * writes it with this literal; `mfFacts.builder` reads it back with the same
 * one. It is 0 because it is not a return window at all.
 */
export const STRUCTURAL_HORIZON = 0;

/**
 * The status written beside a structural percentile we could not produce.
 *
 * Matches `statusForReason('no_data')` in `mfMetrics.service.ts`, which is what
 * the metrics job itself puts there. A fund with no expense ratio on file must
 * come back from this job in exactly the state it went in — `null` with a
 * status — and never as `0`: a zero expense ratio is a real and excellent
 * value, so publishing it for "unknown" tells the user the fund is free.
 */
const PROFILE_UNRANKED_STATUS: MfMetricStatus = 'INSUFFICIENT_DATA';

// ---------------------------------------------------------------------------
// 1. Which metrics get ranked
// ---------------------------------------------------------------------------

type MetricBlock = 'returns' | 'risk' | 'riskAdjusted' | 'relative' | 'consistency';

interface RankedMetricSpec {
  /** Name as it appears in `METRIC_DIRECTION`; also the payload key. */
  metric: string;
  block: MetricBlock;
  field: string;
  /**
   * Rank the absolute value rather than the signed one.
   *
   * `maxDrawdown`, `worstMonth`, `worstCalendarYear` and the VaR pair are all
   * stored as signed losses (−0.30 is a 30% fall) but carry `LOWER_IS_BETTER`
   * in `METRIC_DIRECTION`, whose `maxDrawdown` comment states that callers
   * pass the absolute value. Ranking the signed number under that direction
   * would invert them — a −45% drawdown would out-rank a −5% one. The same
   * magnitude convention therefore applies to every signed-loss metric, not
   * just the one the comment happens to name.
   */
  magnitude?: boolean;
}

/**
 * Every `MfHorizonMetrics` leaf that has a direction entry, plus the two
 * consistency figures this module computes itself.
 *
 * `beta` and `captureRatio` are absent deliberately: neither has a direction,
 * because neither is better high or low. A beta of 1.4 is not a worse fund
 * than a beta of 0.7, it is a different one, and percentile-ranking it would
 * assert an ordering the metric does not have.
 */
export const RANKED_METRICS: readonly RankedMetricSpec[] = Object.freeze([
  { metric: 'cagr', block: 'returns', field: 'cagr' },
  { metric: 'absolute', block: 'returns', field: 'absolute' },
  { metric: 'sipXirr', block: 'returns', field: 'sipXirr' },

  { metric: 'stdDevAnn', block: 'risk', field: 'stdDevAnn' },
  { metric: 'downsideDevAnn', block: 'risk', field: 'downsideDevAnn' },
  { metric: 'maxDrawdown', block: 'risk', field: 'maxDrawdown', magnitude: true },
  { metric: 'worstMonth', block: 'risk', field: 'worstMonth', magnitude: true },
  { metric: 'worstCalendarYear', block: 'risk', field: 'worstCalendarYear', magnitude: true },
  { metric: 'var95Monthly', block: 'risk', field: 'var95Monthly', magnitude: true },
  { metric: 'cvar95Monthly', block: 'risk', field: 'cvar95Monthly', magnitude: true },
  { metric: 'pctNegativeMonths', block: 'risk', field: 'pctNegativeMonths' },

  { metric: 'sharpe', block: 'riskAdjusted', field: 'sharpe' },
  { metric: 'sortino', block: 'riskAdjusted', field: 'sortino' },
  { metric: 'jensenAlphaAnn', block: 'riskAdjusted', field: 'jensenAlphaAnn' },
  { metric: 'treynor', block: 'riskAdjusted', field: 'treynor' },
  { metric: 'informationRatio', block: 'riskAdjusted', field: 'informationRatio' },
  { metric: 'calmar', block: 'riskAdjusted', field: 'calmar' },
  { metric: 'omega', block: 'riskAdjusted', field: 'omega' },
  { metric: 'm2', block: 'riskAdjusted', field: 'm2' },
  { metric: 'trackingErrorAnn', block: 'riskAdjusted', field: 'trackingErrorAnn' },

  { metric: 'upCapture', block: 'relative', field: 'upCapture' },
  { metric: 'downCapture', block: 'relative', field: 'downCapture' },
  { metric: 'battingAverage', block: 'relative', field: 'battingAverage' },
  { metric: 'outperformanceAnn', block: 'relative', field: 'outperformanceAnn' },

  { metric: 'rollingBeatBenchPct', block: 'consistency', field: 'rollingBeatBenchPct' },
  // Computed here, not by the metrics service — both need the universe.
  { metric: 'rollingBeatCategoryPct', block: 'consistency', field: 'rollingBeatCategoryPct' },
  { metric: 'quartileConsistency', block: 'consistency', field: 'quartileConsistency' },
] as const);

/**
 * `directionFor` throws when a model-scoped metric is asked for from the wrong
 * model — correct, because a model file naming such an input is a bug. Here it
 * is not a bug: we iterate every metric for every universe, and tracking error
 * simply is not scored outside INDEX. Skip rather than throw.
 */
function isRankableInModel(metric: string, modelKey: MfModelKey): boolean {
  const scope = MODEL_SCOPED_METRICS[metric];
  return scope === undefined || scope.includes(modelKey);
}

// ---------------------------------------------------------------------------
// 2. Types
// ---------------------------------------------------------------------------

/** The `MfSchemeMeta` columns membership actually depends on. */
export interface MfUniverseCandidate {
  schemeCode: string;
  sebiSubCategory: string;
  planType: MfPlanType;
  optionType: MfOptionType;
  status: MfSchemeStatus;
  inceptionDate: Date;
  statusChangedAt: Date | null;
  growthSiblingSchemeCode: string | null;
}

/** The two selections, per horizon. See the module header for why they differ. */
export interface UniverseSelection {
  universeKey: string;
  horizonYears: MfHorizonYears;
  /** ACTIVE only. Percentiles and `universeSize` come from this. */
  rankingUniverse: string[];
  /** `rankingUniverse` ∪ dead schemes overlapping the window. Medians only. */
  medianUniverse: string[];
  /** True when `medianUniverse` genuinely contains a dead scheme. */
  survivorshipAdjusted: boolean;
}

/** One calendar year's category position (`02 §2.3`, feeds `MfCalendarYearRow`). */
export interface MfPeerCalendarYear {
  year: number;
  /** Survivorship-adjusted: median universe. */
  categoryMedian: Ratio | null;
  /** 1-based, within the ranking universe. */
  rank: number | null;
  universeSize: number | null;
  quartile: 1 | 2 | 3 | 4 | null;
}

/**
 * The `02 §6` consistency figures that cannot be computed without a universe,
 * plus the category median the return block needs. These are *values*, not
 * percentiles — the metrics layer merges them into `MfHorizonMetrics`.
 */
export interface MfUniverseDerivedMetrics {
  /** Survivorship-adjusted median point-to-point CAGR for the horizon. */
  categoryMedianCagr: Ratio | null;
  /** Share of rolling-3y windows above the category median *for the same window end*. */
  rollingBeatCategoryPct: Ratio | null;
  quartileHistory: Array<{ year: number; quartile: 1 | 2 | 3 | 4 | null }>;
  quartileConsistency: Ratio | null;
  /** Always true when a dead scheme overlapped; the flag records the convention. */
  survivorshipAdjusted: boolean;
  calendarYears: MfPeerCalendarYear[];
  /** Reported alongside `universeSize` so the two selections stay auditable. */
  medianUniverseSize: number;
}

/**
 * Every `horizonYears` value `MfPeerRank` can carry.
 *
 * `MF_HORIZONS` covers the five return windows. `0` is the horizon-0
 * *structural* row (`02 §8`) — TER and AUM are properties of the fund today,
 * not of a return window, so they have no place in any of the five and the
 * shared `MfHorizonYears` union deliberately excludes 0.
 */
export type MfRankHorizon = MfHorizonYears | typeof STRUCTURAL_HORIZON;

/** One persisted `MfPeerRank` row, in memory. */
export interface MfPeerRankRow {
  schemeCode: string;
  asOf: Date;
  horizonYears: MfRankHorizon;
  peer: MfPeerPercentiles;
  /** Null on the horizon-0 structural row: none of it applies to a fee. */
  universeDerived: MfUniverseDerivedMetrics | null;
  /**
   * `universeSize < MIN_UNIVERSE_SIZE`. The row is still written — `03 §1`
   * says metrics and percentiles are published and only the *rating* is
   * withheld — and the scorer turns this into `CATEGORY_TOO_SMALL`. Dropping
   * the universe here would leave the scorer unable to tell "too small" from
   * "never computed".
   */
  universeTooSmall: boolean;
}

/** Everything one universe needs, already loaded. Pure input to the maths. */
export interface UniverseComputeInput {
  universeKey: string;
  modelKey: MfModelKey;
  asOf: Date;
  candidates: readonly MfUniverseCandidate[];
  /** `schemeCode` → horizon → the metrics row, present only where one exists. */
  metricsByScheme: ReadonlyMap<string, ReadonlyMap<number, LoadedSchemeMetrics>>;
  /** `schemeCode` → cleaned daily adjusted-NAV series. */
  navByScheme: ReadonlyMap<string, readonly SeriesPoint[]>;
}

export interface LoadedSchemeMetrics {
  status: string;
  metrics: MfHorizonMetrics | null;
}

// ---------------------------------------------------------------------------
// 3. IDCW → growth resolution
// ---------------------------------------------------------------------------

/**
 * The scheme code whose peer rank applies to `meta` (`03 §1`).
 *
 * A GROWTH option ranks as itself. An IDCW option is the same portfolio, so it
 * is deliberately absent from every universe and instead borrows its growth
 * sibling's rank. `null` — not the scheme's own code — when the sibling has
 * not been resolved yet: showing an IDCW option a rank computed from its own
 * payout-depressed NAV series would understate the fund by the whole
 * distribution, which is precisely the failure `MFNav.adjustedNav` exists to
 * prevent.
 */
export function resolveRankableSchemeCode(meta: {
  schemeCode: string;
  optionType: MfOptionType;
  growthSiblingSchemeCode: string | null;
}): string | null {
  if (meta.optionType === 'GROWTH') return meta.schemeCode;
  return meta.growthSiblingSchemeCode ?? null;
}

// ---------------------------------------------------------------------------
// 4. Membership (pure)
// ---------------------------------------------------------------------------

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function minusYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Is this scheme eligible to appear in *any* universe at all?
 *
 * Applied before the ranking/median split, because the three rules it encodes
 * (mapped category, growth option, known status) disqualify a scheme from both
 * selections. Only `status = ACTIVE` distinguishes the two.
 */
export function isUniverseEligible(c: MfUniverseCandidate): boolean {
  if (c.sebiSubCategory === UNMAPPED_SUBCATEGORY) return false;
  if (c.optionType !== 'GROWTH') return false;
  return RANKABLE_STATUSES.includes(c.status);
}

/**
 * Does a dead scheme's history overlap the horizon window?
 *
 * A fund that wound up in 2015 tells us nothing about the 2023-2026 median and
 * including it would drag the median toward a market regime that is not in the
 * window. A fund that wound up in 2024, however, was a real alternative for
 * most of a 3-year window ending in 2026 and its absence is exactly the
 * survivorship hole we are filling.
 *
 * `statusChangedAt === null` on a dead scheme means we do not know when it
 * died; treated as "still overlapping", because excluding it would silently
 * reintroduce the bias for every scheme with incomplete metadata.
 */
export function overlapsWindow(
  c: MfUniverseCandidate,
  windowStart: Date,
  asOf: Date,
): boolean {
  if (c.inceptionDate.getTime() > asOf.getTime()) return false;
  const died = c.statusChangedAt;
  if (died === null) return true;
  return died.getTime() >= windowStart.getTime();
}

/**
 * Build the two selections for one `(universe, horizon)` pair.
 *
 * Per-horizon membership is real: a fund with four years of NAV belongs in the
 * 3-year universe and not the 5-year one. For live schemes the signal is the
 * `MfSchemeMetrics` row's `status` for that horizon — `OK` is precisely the
 * metrics layer saying "the window was computable", so re-deriving coverage
 * from NAV here would be a second opinion that can disagree with the numbers
 * being ranked. Dead schemes get no metrics rows (the metrics job runs for
 * ACTIVE schemes only), so their coverage is tested against NAV directly.
 */
export function selectUniverseMembers(
  input: {
    universeKey: string;
    horizonYears: MfHorizonYears;
    asOf: Date;
    candidates: readonly MfUniverseCandidate[];
    hasOkMetrics: (schemeCode: string, horizonYears: number) => boolean;
    coversWindow: (schemeCode: string, horizonYears: number) => boolean;
  },
): UniverseSelection {
  const { universeKey, horizonYears, asOf, candidates } = input;
  const windowStart = minusYears(asOf, horizonYears);

  const rankingUniverse: string[] = [];
  const deadOverlapping: string[] = [];

  for (const c of candidates) {
    if (!isUniverseEligible(c)) continue;
    if (c.status === 'ACTIVE') {
      if (input.hasOkMetrics(c.schemeCode, horizonYears)) rankingUniverse.push(c.schemeCode);
      continue;
    }
    // MERGED / WOUND_UP — excluded from ranking, included in medians.
    if (!overlapsWindow(c, windowStart, asOf)) continue;
    if (!input.coversWindow(c.schemeCode, horizonYears)) continue;
    deadOverlapping.push(c.schemeCode);
  }

  return {
    universeKey,
    horizonYears,
    rankingUniverse,
    medianUniverse: [...rankingUniverse, ...deadOverlapping],
    survivorshipAdjusted: deadOverlapping.length > 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Small numeric helpers (pure)
// ---------------------------------------------------------------------------

function sortAsc(values: readonly Decimal[]): Decimal[] {
  return [...values].sort((a, b) => a.comparedTo(b));
}

/** Median with the even-length average. `null` on an empty set, never `0`. */
export function medianOf(values: readonly Decimal[]): Decimal | null {
  if (values.length === 0) return null;
  const sorted = sortAsc(values);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!.plus(sorted[mid]!).dividedBy(2);
}

/**
 * Quartile from a 1-based rank in a universe of `n`. Rank 1 of 40 is Q1;
 * rank 40 is Q4. `null` for an empty universe.
 */
export function quartileFromRank(rank: number, n: number): 1 | 2 | 3 | 4 | null {
  if (n <= 0 || rank <= 0) return null;
  const q = Math.ceil((rank * 4) / n);
  return Math.min(4, Math.max(1, q)) as 1 | 2 | 3 | 4;
}

/** Competition rank: 1 + the number of strictly better values. Ties share a rank. */
function competitionRank(value: Decimal, universe: readonly Decimal[]): number {
  let better = 0;
  for (const v of universe) if (v.greaterThan(value)) better += 1;
  return better + 1;
}

/**
 * Rolling `windowYears` CAGR at every NAV date, keyed by the window *end*.
 *
 * `mfMetricsMath.rollingReturns` returns the aggregate stat block, which is
 * the right shape for `MfRollingStats` and the wrong one here: comparing a
 * fund's rolling distribution against the category's requires the two to be
 * lined up window-end by window-end. A fund whose good windows all ended in
 * 2021 and a category whose good windows all ended in 2024 can have identical
 * distributions and opposite records against each other. The window-start
 * lookup is `windowStartPoint`, the same primitive `rollingReturns` uses, so
 * the two agree on what a window is.
 */
export function rollingSeriesByWindowEnd(
  daily: readonly SeriesPoint[],
  windowYears: number,
): Map<number, Decimal> {
  const out = new Map<number, Decimal>();
  if (daily.length < 2) return out;
  const exponent = toDecimal(1).dividedBy(toDecimal(windowYears));
  for (const point of daily) {
    const start = windowStartPoint(daily, point.date, windowYears);
    if (start === null) continue;
    if (start.value.abs().lessThan(EPSILON)) continue;
    const growth = point.value.dividedBy(start.value);
    if (growth.lessThanOrEqualTo(0)) continue;
    out.set(point.date.getTime(), growth.pow(exponent).minus(1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Reading a metric out of the stored `MfHorizonMetrics` JSON
// ---------------------------------------------------------------------------

function readMetricValue(
  metrics: MfHorizonMetrics | null,
  spec: RankedMetricSpec,
): Decimal | null {
  if (metrics === null) return null;
  const block = (metrics as unknown as Record<string, unknown>)[spec.block];
  if (block === null || typeof block !== 'object') return null;
  const raw = (block as Record<string, unknown>)[spec.field];
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let d: Decimal;
  try {
    d = toDecimal(raw as Decimal.Value);
  } catch {
    // A non-numeric string in a numeric slot is a corrupt metrics row. It is
    // not this module's job to repair it, and ranking `NaN` would poison every
    // peer's percentile — treat it as absent, which is what `null` means.
    logger.warn(
      { metric: spec.metric, raw },
      '[mfPeerRank] non-numeric metric value; treated as unavailable',
    );
    return null;
  }
  if (!d.isFinite()) return null;
  return spec.magnitude ? d.abs() : d;
}

// ---------------------------------------------------------------------------
// 7. The computation (pure)
// ---------------------------------------------------------------------------

/**
 * Compute every peer-rank row for one universe, across every horizon.
 *
 * Pure: takes loaded data, returns rows. The I/O wrapper below does the
 * fetching, so this whole thing is testable against synthetic universes with
 * no database — the same reason `mfScoreMath.ts` is sterile.
 */
export function computeUniversePeerRanks(input: UniverseComputeInput): MfPeerRankRow[] {
  const { universeKey, modelKey, asOf, candidates, metricsByScheme, navByScheme } = input;

  /**
   * `BENCHMARK_UNAVAILABLE` counts as computable.
   *
   * The status describes ONE input to the row, not the row. A fund whose
   * benchmark index we hold no prices for still has a max drawdown, a worst
   * month, a share of negative months and a Sharpe ratio — all computed from
   * its own NAV and the risk-free series, none of which the benchmark touches.
   * Excluding it discarded every one of those and left the fund with no
   * percentiles, no pillar scores and `INSUFFICIENT_HISTORY`, which reads as
   * "this fund is too young to judge" about a fund with ten years of history.
   *
   * Measured on 2026-08-31: 1,051 schemes carry this status at the 3-year
   * horizon against 266 `OK`, and every debt and hybrid fund in the database
   * scored null on ALL SIX pillars because of it — including DOWNSIDE and
   * CONSISTENCY, which reference no benchmark-relative metric at all.
   *
   * Nothing downstream needs protecting from this. Ranking is per metric and
   * already skips nulls — `rollingBeatBenchPct` ranks 809 schemes where
   * `maxDrawdown` ranks 1,113 — so a benchmark-relative metric simply continues
   * to have no value for these funds, while the NAV-derived ones gain the peers
   * they should always have had. Category medians computed over more of the
   * category are more representative, not less.
   *
   * `QUARANTINED` and `INSUFFICIENT_DATA` stay excluded: those describe the NAV
   * series itself, so nothing in the row is trustworthy.
   */
  const hasOkMetrics = (schemeCode: string, horizonYears: number): boolean => {
    const status = metricsByScheme.get(schemeCode)?.get(horizonYears)?.status;
    return status === 'OK' || status === 'BENCHMARK_UNAVAILABLE';
  };

  const coversWindow = (schemeCode: string, horizonYears: number): boolean => {
    const daily = navByScheme.get(schemeCode);
    if (daily === undefined || daily.length < 2) return false;
    return windowStartPoint(daily, asOf, horizonYears) !== null;
  };

  // Rolling-3y series is horizon-independent — only which window ends we keep
  // changes per horizon — so build it once per scheme, not once per (scheme,
  // horizon). At ~3,000 window ends per scheme this is the single largest cost
  // in the module.
  const rollingByScheme = new Map<string, Map<number, Decimal>>();
  const calendarByScheme = new Map<string, Map<number, Decimal>>();
  for (const [schemeCode, daily] of navByScheme) {
    rollingByScheme.set(
      schemeCode,
      rollingSeriesByWindowEnd(daily, ROLLING_CATEGORY_WINDOW_YEARS),
    );
    const cy = new Map<number, Decimal>();
    for (const row of calendarYearReturns(daily)) cy.set(row.year, row.value);
    calendarByScheme.set(schemeCode, cy);
  }

  const rows: MfPeerRankRow[] = [];

  for (const horizonYears of MF_HORIZONS) {
    const selection = selectUniverseMembers({
      universeKey,
      horizonYears,
      asOf,
      candidates,
      hasOkMetrics,
      coversWindow,
    });

    if (selection.rankingUniverse.length === 0) continue;

    // ── Category medians, from the SURVIVORSHIP-ADJUSTED selection ────────
    const categoryMedianCagr = medianOf(
      selection.medianUniverse
        .map((code) => {
          const daily = navByScheme.get(code);
          if (daily === undefined) return null;
          const r = horizonCagr(daily, asOf, horizonYears);
          return r.value;
        })
        .filter((v): v is Decimal => v !== null),
    );

    // ── rollingBeatCategoryPct, per window end ───────────────────────────
    const windowStart = minusYears(asOf, horizonYears);
    const categoryMedianByWindowEnd = buildCategoryMedianByWindowEnd(
      selection.medianUniverse,
      rollingByScheme,
      windowStart,
      asOf,
    );

    const beatByScheme = new Map<string, Decimal | null>();
    for (const code of selection.rankingUniverse) {
      beatByScheme.set(
        code,
        rollingBeatCategoryPct(rollingByScheme.get(code), categoryMedianByWindowEnd),
      );
    }

    // ── Calendar-year rank / quartile ────────────────────────────────────
    const calendar = buildCalendarYearRows({
      horizonYears,
      asOf,
      selection,
      calendarByScheme,
    });

    const quartileHistoryByScheme = new Map<
      string,
      Array<{ year: number; quartile: 1 | 2 | 3 | 4 | null }>
    >();
    const quartileConsistencyByScheme = new Map<string, Decimal | null>();
    for (const code of selection.rankingUniverse) {
      const history = calendar.years.map((y) => ({
        year: y.year,
        quartile: calendar.quartileByScheme.get(code)?.get(y.year) ?? null,
      }));
      quartileHistoryByScheme.set(code, history);
      const known = history.filter((h) => h.quartile !== null);
      quartileConsistencyByScheme.set(
        code,
        known.length === 0
          ? null
          : toDecimal(known.filter((h) => h.quartile === 1 || h.quartile === 2).length)
              .dividedBy(toDecimal(known.length)),
      );
    }

    // ── Percentiles ──────────────────────────────────────────────────────
    // Locally-computed consistency values are ranked exactly like the stored
    // ones; they are inputs to the CONSISTENCY pillar and must arrive on the
    // same 0-1 scale.
    const localValues = new Map<string, Map<string, Decimal | null>>([
      ['rollingBeatCategoryPct', new Map(beatByScheme)],
      ['quartileConsistency', new Map(quartileConsistencyByScheme)],
    ]);

    const valuesByMetric = new Map<string, Map<string, Decimal>>();
    for (const spec of RANKED_METRICS) {
      if (!isRankableInModel(spec.metric, modelKey)) continue;
      const values = new Map<string, Decimal>();
      for (const code of selection.rankingUniverse) {
        const local = localValues.get(spec.metric);
        const v =
          local !== undefined
            ? local.get(code) ?? null
            : readMetricValue(metricsByScheme.get(code)?.get(horizonYears)?.metrics ?? null, spec);
        if (v !== null) values.set(code, v);
      }
      // A percentile needs a POOL, and the pool for a metric is the members
      // that actually carry it — not the members of the universe.
      //
      // `universeSize` counts funds with usable metrics, so it can be 26 while
      // exactly one of them has a TER. Ranking that fund against itself yields
      // percentile 0.500000 and a "category median" equal to its own value,
      // and COST then contributes 15% of its rating on the strength of a number
      // with nothing behind it. Observed on ICICI Prudential Large & Mid Cap:
      // value 0.67, universeMedian 0.67, percentile exactly 0.5 — and the fund
      // page told the reader cost was its weakest area because of it.
      //
      // The floor is `MIN_UNIVERSE_SIZE`, the same one `03 §1` already applies
      // to category statistics elsewhere; applying it per metric rather than
      // per universe is the whole correction. Dropping a metric here costs no
      // rating: it is not a `RATING_REQUIRED_PILLAR` input, so its pillar
      // simply redistributes weight to the inputs that do have a pool.
      if (values.size >= MIN_UNIVERSE_SIZE) valuesByMetric.set(spec.metric, values);
    }

    const universeSize = selection.rankingUniverse.length;

    for (const code of selection.rankingUniverse) {
      const percentiles: Record<string, Ratio> = {};
      const medians: Record<string, Ratio> = {};

      for (const [metric, values] of valuesByMetric) {
        const target = values.get(code);
        if (target === undefined) continue;
        const all = [...values.values()];
        const pct = percentileRankForMetric(metric, all, target, modelKey);
        if (pct === null) continue;
        percentiles[metric] = serializeRatio(pct);
        const med = medianOf(all);
        if (med !== null) medians[metric] = serializeRatio(med);
      }

      rows.push({
        schemeCode: code,
        asOf,
        horizonYears,
        peer: {
          universeKey,
          universeSize,
          percentiles,
          medians,
        },
        universeDerived: {
          categoryMedianCagr: serializeRatioOrNull(categoryMedianCagr),
          rollingBeatCategoryPct: serializeRatioOrNull(beatByScheme.get(code) ?? null),
          quartileHistory: quartileHistoryByScheme.get(code) ?? [],
          quartileConsistency: serializeRatioOrNull(
            quartileConsistencyByScheme.get(code) ?? null,
          ),
          survivorshipAdjusted: selection.survivorshipAdjusted,
          calendarYears: calendar.years.map((y) => ({
            year: y.year,
            categoryMedian: y.categoryMedian,
            rank: calendar.rankByScheme.get(code)?.get(y.year) ?? null,
            universeSize: y.universeSize,
            quartile: calendar.quartileByScheme.get(code)?.get(y.year) ?? null,
          })),
          medianUniverseSize: selection.medianUniverse.length,
        },
        universeTooSmall: universeSize < MIN_UNIVERSE_SIZE,
      });
    }
  }

  return rows;
}

/**
 * Median rolling-3y return per window end, over the median universe.
 *
 * Window ends outside the horizon window are dropped: a 3-year horizon ending
 * today asks how consistent the fund has been *over those three years*, not
 * over its whole life.
 */
function buildCategoryMedianByWindowEnd(
  medianUniverse: readonly string[],
  rollingByScheme: ReadonlyMap<string, Map<number, Decimal>>,
  windowStart: Date,
  asOf: Date,
): Map<number, Decimal> {
  const bucket = new Map<number, Decimal[]>();
  const lo = windowStart.getTime();
  const hi = asOf.getTime();

  for (const code of medianUniverse) {
    const series = rollingByScheme.get(code);
    if (series === undefined) continue;
    for (const [time, value] of series) {
      if (time < lo || time > hi) continue;
      const list = bucket.get(time);
      if (list === undefined) bucket.set(time, [value]);
      else list.push(value);
    }
  }

  const out = new Map<number, Decimal>();
  for (const [time, values] of bucket) {
    const med = medianOf(values);
    if (med !== null) out.set(time, med);
  }
  return out;
}

/**
 * `02 §6`: share of the fund's rolling-3y windows that beat the category
 * median rolling-3y return *for the same window end*.
 *
 * `null` — not `0` — when there is not a single comparable window end. Zero is
 * a real and damning answer ("never once beat the category"); using it to mean
 * "we have no data" is how a new fund gets flagged as a persistent
 * underperformer on its first day.
 */
export function rollingBeatCategoryPct(
  fundSeries: ReadonlyMap<number, Decimal> | undefined,
  categoryMedianByWindowEnd: ReadonlyMap<number, Decimal>,
): Decimal | null {
  if (fundSeries === undefined) return null;
  let comparable = 0;
  let beaten = 0;
  for (const [time, value] of fundSeries) {
    const median = categoryMedianByWindowEnd.get(time);
    if (median === undefined) continue;
    comparable += 1;
    if (value.greaterThan(median)) beaten += 1;
  }
  if (comparable === 0) return null;
  return toDecimal(beaten).dividedBy(toDecimal(comparable));
}

interface CalendarBuildResult {
  years: Array<{ year: number; categoryMedian: Ratio | null; universeSize: number }>;
  rankByScheme: Map<string, Map<number, number>>;
  quartileByScheme: Map<string, Map<number, 1 | 2 | 3 | 4 | null>>;
}

/**
 * Calendar-year medians (median universe), ranks and quartiles (ranking
 * universe) for the complete calendar years inside the horizon window.
 *
 * `02 §6` says "the last 5 calendar years". Capped at the horizon as well,
 * because a 3-year horizon carrying a five-year quartile history would let the
 * CONSISTENCY pillar score a fund on two years that its own metrics window
 * deliberately excludes.
 */
function buildCalendarYearRows(input: {
  horizonYears: MfHorizonYears;
  asOf: Date;
  selection: UniverseSelection;
  calendarByScheme: ReadonlyMap<string, Map<number, Decimal>>;
}): CalendarBuildResult {
  const { horizonYears, asOf, selection, calendarByScheme } = input;

  const lastCompleteYear = asOf.getUTCFullYear() - 1;
  const span = Math.min(QUARTILE_HISTORY_MAX_YEARS, horizonYears);
  const firstYear = lastCompleteYear - span + 1;

  const years: CalendarBuildResult['years'] = [];
  const rankByScheme = new Map<string, Map<number, number>>();
  const quartileByScheme = new Map<string, Map<number, 1 | 2 | 3 | 4 | null>>();

  for (let year = firstYear; year <= lastCompleteYear; year++) {
    const medianValues: Decimal[] = [];
    for (const code of selection.medianUniverse) {
      const v = calendarByScheme.get(code)?.get(year);
      if (v !== undefined) medianValues.push(v);
    }

    const rankingValues: Array<{ code: string; value: Decimal }> = [];
    for (const code of selection.rankingUniverse) {
      const v = calendarByScheme.get(code)?.get(year);
      if (v !== undefined) rankingValues.push({ code, value: v });
    }

    if (rankingValues.length === 0 && medianValues.length === 0) continue;

    years.push({
      year,
      categoryMedian: serializeRatioOrNull(medianOf(medianValues)),
      universeSize: rankingValues.length,
    });

    const pool = rankingValues.map((r) => r.value);
    for (const { code, value } of rankingValues) {
      const rank = competitionRank(value, pool);
      let ranks = rankByScheme.get(code);
      if (ranks === undefined) {
        ranks = new Map();
        rankByScheme.set(code, ranks);
      }
      ranks.set(year, rank);

      let quartiles = quartileByScheme.get(code);
      if (quartiles === undefined) {
        quartiles = new Map();
        quartileByScheme.set(code, quartiles);
      }
      quartiles.set(year, quartileFromRank(rank, pool.length));
    }
  }

  return { years, rankByScheme, quartileByScheme };
}

// ---------------------------------------------------------------------------
// 7b. Horizon-0 structural ranks — TER and AUM (`02 §8`, `03 §1`)
// ---------------------------------------------------------------------------

/**
 * `03 §1`'s direction table names TER (lower-is-better) and AUM
 * (higher-is-better *up to a cap*) alongside the return metrics, so these were
 * always meant to be ranked here. They were not, and the consequence was not
 * cosmetic: `terPercentile` is the sole input to the COST pillar of all six
 * models, so a permanently-null COST pillar meant cost never moved a single
 * fund's score — 15% of an ACTIVE_EQUITY score, 30% for FOF (doubled precisely
 * because layered TERs matter), and 35% for INDEX, where fee *is* the thesis.
 * `aumCategoryPercentile` (INDEX SCALE, 15) went the same way, `mf.cost.high-ter`
 * could never fire, and `mf.pf.cost` had nothing to average.
 *
 * ## Horizon-0 membership is a different question from horizon-N membership
 *
 * A return-window universe asks "does this fund have `horizonYears` of usable
 * NAV?", and {@link selectUniverseMembers} answers it from the metrics row's
 * per-horizon `status`. The structural universe must NOT ask that. An expense
 * ratio is published from a fund's first day; a fund with twelve months of NAV
 * has a TER that is every bit as real, and as comparable, as a twenty-year
 * fund's. Gating the cost universe on three years of history would silently
 * shrink it — and shrink it *non-randomly*, toward older funds, in a direction
 * that flatters exactly the incumbents whose fees are usually the ones worth
 * questioning. It would also inflate `universeTooSmall` on young categories.
 *
 * The membership rule is therefore: **eligible** (mapped sub-category, GROWTH
 * option, so the same three rules the module header sets out), **ACTIVE** (a
 * percentile is a statement about choosable alternatives today), and **has a
 * horizon-0 profile row carrying at least one structural value**. Note what is
 * absent: no NAV test, no `hasOkMetrics`. In particular the profile row's own
 * `status` is deliberately ignored — it describes the *portfolio snapshot*
 * (`INSUFFICIENT_DATA` when the AMC has not disclosed holdings), which has
 * nothing whatever to do with whether the AMC publishes an expense ratio.
 *
 * Per metric, only members that actually carry that value contribute one and
 * receive a percentile — the same convention the horizon rows already use,
 * where `universeSize` is the universe's membership and each metric is ranked
 * over whichever subset of it has the number.
 *
 * ## Why the structural median is survivors-only
 *
 * The medians at the return horizons are survivorship-adjusted because funds
 * merge *after underperforming*, so a survivors-only performance median has
 * had its bottom quietly deleted. No such force acts on fees: a wound-up
 * fund's expense ratio is not evidence about what a fund in this category
 * charges today, and dead schemes carry no horizon-0 profile row in any case
 * (the metrics job runs for ACTIVE schemes only). The median here comes from
 * the same set as the percentile, which is also what `03 §10` requires — "0.62%
 * vs a category median of 0.48%, 22nd percentile" has to be internally
 * consistent to be worth printing, and `HIGH_TER` prints exactly that.
 */
interface StructuralMetricSpec {
  /** Name in `METRIC_DIRECTION`; also the key in the `MfPeerRank` payload. */
  metric: string;
  /** Where the raw value sits on `MfCurrentProfile`. */
  valueField: 'terPct' | 'aum';
  /** Where the percentile is written back on `MfCurrentProfile`. */
  percentileField: 'terPercentile' | 'aumCategoryPercentile';
  /**
   * Where the universe median is written back, when the profile has a slot.
   * Only TER does, and it is not decorative: `HIGH_TER`'s counterfactual reads
   * "Would clear at a TER at or below the category median {median}%", so
   * without it the finding cannot name the figure the user could act against.
   */
  medianField: 'terCategoryMedianPct' | null;
  /**
   * Units of the median as written back to the profile. `Pct` for TER (0.62 is
   * 0.62% a year) — the profile field is `terCategoryMedianPct` and the brand
   * is what stops a stray ×100.
   */
  medianUnit: 'pct' | null;
}

/**
 * The horizon-0 metrics that get ranked.
 *
 * Direction and any plateau are NOT restated here — `percentileRankForMetric`
 * resolves both from `METRIC_DIRECTION` / `METRIC_PLATEAU_CAP` by name, so TER
 * inherits `LOWER_IS_BETTER` (cheapest fund ranks best) and `aum` inherits
 * `HIGHER_IS_BETTER_TO_CAP` with `AUM_PLATEAU_CAP_INR`. A second copy of
 * either would be a second answer to "which fund is better".
 *
 * `aumGrowth12mPct` is on the profile and has a direction, but it is not here:
 * it is computed per fund from that fund's own AUM series and is already
 * comparable across funds without a rank, and the INDEX model consumes it
 * as-is. Adding it would be a change to what a model scores, not a bug fix.
 */
export const STRUCTURAL_RANKED_METRICS: readonly StructuralMetricSpec[] = Object.freeze([
  Object.freeze({
    metric: 'terPct',
    valueField: 'terPct',
    percentileField: 'terPercentile',
    medianField: 'terCategoryMedianPct',
    medianUnit: 'pct',
  } as const),
  Object.freeze({
    metric: 'aum',
    valueField: 'aum',
    percentileField: 'aumCategoryPercentile',
    medianField: null,
    medianUnit: null,
  } as const),
] as const);

/**
 * The horizon-0 profile fields this module owns. Anything here is null-with-a-
 * status until the peer-rank job has run for the day; nothing else in the
 * profile is touched.
 */
export const STRUCTURAL_PROFILE_FIELDS: readonly string[] = Object.freeze(
  STRUCTURAL_RANKED_METRICS.flatMap((s) =>
    s.medianField === null ? [s.percentileField] : [s.percentileField, s.medianField],
  ),
);

/**
 * Read one structural value off a stored profile.
 *
 * `Pct` and `Money` both cross the boundary as Decimal *strings* (CONTEXT.md
 * §3.1), so a string is the expected shape; a number is tolerated because an
 * older row could carry one, and anything else is treated as absent rather
 * than coerced. A non-`OK` `fieldStatus` entry also means absent: the shared
 * contract is that a null always carries a status, and honouring the status is
 * what stops a half-written row from being ranked as fact.
 */
function readStructuralValue(
  profile: MfCurrentProfile | null,
  spec: StructuralMetricSpec,
): Decimal | null {
  if (profile === null) return null;
  const status = profile.fieldStatus?.[spec.valueField];
  if (status !== undefined && status !== 'OK') return null;
  const raw = (profile as unknown as Record<string, unknown>)[spec.valueField];
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let d: Decimal;
  try {
    d = toDecimal(raw as Decimal.Value);
  } catch {
    logger.warn(
      { metric: spec.metric, raw },
      '[mfPeerRank] non-numeric structural value; treated as unavailable',
    );
    return null;
  }
  return d.isFinite() ? d : null;
}

/**
 * The horizon-0 ranking universe. See the block comment above for why this is
 * emphatically not `selectUniverseMembers(…, 0)`.
 */
export function selectStructuralUniverseMembers(
  candidates: readonly MfUniverseCandidate[],
  profileByScheme: ReadonlyMap<string, MfCurrentProfile>,
): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (!isUniverseEligible(c)) continue;
    // Percentiles rank choosable alternatives; a dead scheme is not one. Dead
    // schemes also have no horizon-0 profile, so this is belt and braces.
    if (c.status !== 'ACTIVE') continue;
    const profile = profileByScheme.get(c.schemeCode);
    if (profile === undefined) continue;
    // A profile with neither a TER nor an AUM contributes nothing to any
    // structural rank; counting it would inflate `universeSize` with funds
    // that could not have been ranked on anything.
    if (!STRUCTURAL_RANKED_METRICS.some((s) => readStructuralValue(profile, s) !== null)) continue;
    out.push(c.schemeCode);
  }
  return out;
}

/** Profile fields one scheme's horizon-0 row should carry after this run. */
export interface StructuralProfilePatch {
  schemeCode: string;
  asOf: Date;
  /**
   * `MfCurrentProfile` field name → serialised value, or `null` when the
   * universe could not produce one. Keys are exactly
   * {@link STRUCTURAL_PROFILE_FIELDS}, always all of them, so a field that
   * *stopped* being computable is actively nulled rather than left stale.
   */
  fields: Record<string, Ratio | Pct | null>;
}

export interface StructuralComputeInput {
  universeKey: string;
  modelKey: MfModelKey;
  asOf: Date;
  candidates: readonly MfUniverseCandidate[];
  /** `schemeCode` → the stored horizon-0 profile, where one exists. */
  profileByScheme: ReadonlyMap<string, MfCurrentProfile>;
}

export interface StructuralRankResult {
  /** `MfPeerRank` rows at `horizonYears = 0`. The source of record. */
  rows: MfPeerRankRow[];
  /** The same numbers, shaped for the profile write-back. */
  patches: StructuralProfilePatch[];
}

/**
 * Compute the horizon-0 percentiles and medians for one universe. Pure.
 *
 * The rank rows and the profile patches are produced in the same pass from the
 * same `Decimal`s, so `MfPeerRank(horizonYears = 0)` and
 * `MfCurrentProfile.terPercentile` cannot disagree by construction — the
 * profile field is a denormalisation of the rank row, not a second computation
 * of it.
 */
export function computeStructuralPeerRanks(
  input: StructuralComputeInput,
): StructuralRankResult {
  const { universeKey, modelKey, asOf, candidates, profileByScheme } = input;

  const universe = selectStructuralUniverseMembers(candidates, profileByScheme);
  if (universe.length === 0) return { rows: [], patches: [] };

  const valuesByMetric = new Map<string, Map<string, Decimal>>();
  const medianByMetric = new Map<string, Decimal>();
  for (const spec of STRUCTURAL_RANKED_METRICS) {
    const values = new Map<string, Decimal>();
    for (const code of universe) {
      const v = readStructuralValue(profileByScheme.get(code) ?? null, spec);
      if (v !== null) values.set(code, v);
    }
    // Same floor as the horizon metrics above, and this is the pass where it
    // actually bites. TER and AUM come from factsheets, which are ingested per
    // AMC, so a category of 26 rated funds routinely has ONE fund carrying a
    // TER. Ranking it against itself produced percentile 0.500000 and a
    // "category median" equal to its own value — and COST, at 15% weight, was
    // scored on that. ICICI Prudential Large & Mid Cap read value 0.67,
    // universeMedian 0.67, percentile 0.5, and its fund page told the reader
    // cost was its weakest area purely because of the degenerate midpoint.
    //
    // Withholding costs no rating — COST is not a RATING_REQUIRED_PILLAR input,
    // so the pillar redistributes weight to inputs that have a pool — and it
    // restores the honest answer, which the plain overview already knows how to
    // render: "we could not score Cost for this fund".
    if (values.size < MIN_UNIVERSE_SIZE) continue;
    valuesByMetric.set(spec.metric, values);
    const med = medianOf([...values.values()]);
    if (med !== null) medianByMetric.set(spec.metric, med);
  }

  const universeSize = universe.length;
  const rows: MfPeerRankRow[] = [];
  const patches: StructuralProfilePatch[] = [];

  for (const code of universe) {
    const percentiles: Record<string, Ratio> = {};
    const medians: Record<string, Ratio> = {};
    // Seeded null so the patch is *total* over the fields this module owns: a
    // field that stopped being computable (its last peer dropped out of the
    // category, say) is actively nulled rather than left holding yesterday's
    // percentile as though it were today's.
    const fields: Record<string, Ratio | Pct | null> = {};
    for (const field of STRUCTURAL_PROFILE_FIELDS) fields[field] = null;

    for (const spec of STRUCTURAL_RANKED_METRICS) {
      const med = medianByMetric.get(spec.metric) ?? null;
      // The category median is a property of the category, not of this fund,
      // so it is published even to a fund that has no TER of its own — that
      // fund's percentile is still null, which is the honest answer.
      if (spec.medianField !== null) {
        fields[spec.medianField] =
          med === null ? null : spec.medianUnit === 'pct' ? serializePct(med) : serializeRatio(med);
      }
      // `MfPeerPercentiles.medians` is `Record<string, Ratio>` for every
      // horizon, and the brand describes the *encoding* (a Decimal string),
      // not the unit — a `cagr` median is a fraction, a `terPct` median is
      // percent and an `aum` median is rupees. The profile write-back below is
      // where the unit brand is asserted, via `medianUnit`.
      if (med !== null) medians[spec.metric] = serializeRatio(med);

      const values = valuesByMetric.get(spec.metric);
      const target = values?.get(code);
      if (values === undefined || target === undefined) {
        fields[spec.percentileField] = null;
        continue;
      }
      // Direction and plateau resolved by name — TER LOWER_IS_BETTER (the
      // cheapest fund ranks best), AUM HIGHER_IS_BETTER_TO_CAP.
      const pct = percentileRankForMetric(spec.metric, [...values.values()], target, modelKey);
      fields[spec.percentileField] = pct === null ? null : serializeRatio(pct);
      if (pct !== null) percentiles[spec.metric] = serializeRatio(pct);
    }

    patches.push({ schemeCode: code, asOf, fields });

    // A member that could not be ranked on anything gets no `MfPeerRank` row:
    // an empty percentile map is indistinguishable from "never computed" and
    // would only add rows that assert nothing.
    if (Object.keys(percentiles).length === 0) continue;

    rows.push({
      schemeCode: code,
      asOf,
      horizonYears: STRUCTURAL_HORIZON,
      peer: { universeKey, universeSize, percentiles, medians },
      universeDerived: null,
      universeTooSmall: universeSize < MIN_UNIVERSE_SIZE,
    });
  }

  return { rows, patches };
}

// ---------------------------------------------------------------------------
// 8. Payload serialisation
// ---------------------------------------------------------------------------

/**
 * The stored form of one row's `percentiles` column. Flat metric→percentile at
 * the top level (exactly what `schema.prisma` documents), with medians, the
 * universe-derived block and the module version under `$`-prefixed keys that
 * cannot collide with a metric name.
 */
export function serializePeerRankPayload(row: MfPeerRankRow): Prisma.InputJsonValue {
  return {
    ...row.peer.percentiles,
    [MEDIANS_KEY]: row.peer.medians,
    [UNIVERSE_KEY_FIELD]: row.universeDerived,
    [VERSION_KEY]: MF_PEER_RANK_VERSION,
  } as unknown as Prisma.InputJsonValue;
}

export interface PersistedPeerRank {
  schemeCode: string;
  asOf: Date;
  horizonYears: number;
  peer: MfPeerPercentiles;
  universeDerived: MfUniverseDerivedMetrics | null;
  version: string | null;
}

/** The inverse. Never hand-parse the column — the `$` keys are an internal detail. */
export function parsePeerRankPayload(row: {
  schemeCode: string;
  asOf: Date;
  horizonYears: number;
  universeKey: string;
  universeSize: number;
  percentiles: unknown;
}): PersistedPeerRank {
  const raw =
    row.percentiles !== null && typeof row.percentiles === 'object'
      ? (row.percentiles as Record<string, unknown>)
      : {};

  const percentiles: Record<string, Ratio> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('$')) continue;
    if (typeof v === 'string') percentiles[k] = v as Ratio;
  }

  const mediansRaw = raw[MEDIANS_KEY];
  const medians: Record<string, Ratio> = {};
  if (mediansRaw !== null && typeof mediansRaw === 'object') {
    for (const [k, v] of Object.entries(mediansRaw as Record<string, unknown>)) {
      if (typeof v === 'string') medians[k] = v as Ratio;
    }
  }

  const universeDerived = raw[UNIVERSE_KEY_FIELD];
  const version = raw[VERSION_KEY];

  return {
    schemeCode: row.schemeCode,
    asOf: row.asOf,
    horizonYears: row.horizonYears,
    peer: {
      universeKey: row.universeKey,
      universeSize: row.universeSize,
      percentiles,
      medians,
    },
    universeDerived:
      universeDerived !== null && typeof universeDerived === 'object'
        ? (universeDerived as unknown as MfUniverseDerivedMetrics)
        : null,
    version: typeof version === 'string' ? version : null,
  };
}

// ---------------------------------------------------------------------------
// 9. I/O — loading a universe
// ---------------------------------------------------------------------------

export interface UniverseRef {
  universeKey: string;
  sebiSubCategory: string;
  planType: MfPlanType;
}

/**
 * Every `(sub-category, plan)` pair with at least one ACTIVE growth scheme.
 *
 * Discovery is driven off ACTIVE schemes only. A universe whose live members
 * have all merged away is not a universe any more; keeping it would emit rows
 * ranking nobody against a median of the dead.
 */
export async function listUniverses(): Promise<UniverseRef[]> {
  const grouped = await prisma.mfSchemeMeta.groupBy({
    by: ['sebiSubCategory', 'planType'],
    where: {
      status: 'ACTIVE',
      optionType: 'GROWTH',
      sebiSubCategory: { not: UNMAPPED_SUBCATEGORY },
    },
  });

  return grouped
    .map((g) => ({
      universeKey: buildUniverseKey(g.sebiSubCategory, g.planType),
      sebiSubCategory: g.sebiSubCategory,
      planType: g.planType,
    }))
    .sort((a, b) => a.universeKey.localeCompare(b.universeKey));
}

async function loadCandidates(ref: UniverseRef): Promise<MfUniverseCandidate[]> {
  const rows = await prisma.mfSchemeMeta.findMany({
    where: {
      sebiSubCategory: ref.sebiSubCategory,
      planType: ref.planType,
      optionType: 'GROWTH',
      status: { in: [...RANKABLE_STATUSES] },
    },
    select: {
      schemeCode: true,
      sebiSubCategory: true,
      planType: true,
      optionType: true,
      status: true,
      inceptionDate: true,
      statusChangedAt: true,
      growthSiblingSchemeCode: true,
    },
    orderBy: { schemeCode: 'asc' },
  });
  return rows;
}

async function loadMetrics(
  schemeCodes: readonly string[],
  asOf: Date,
): Promise<Map<string, Map<number, LoadedSchemeMetrics>>> {
  const out = new Map<string, Map<number, LoadedSchemeMetrics>>();
  for (let i = 0; i < schemeCodes.length; i += NAV_FETCH_CHUNK_SIZE) {
    const chunk = schemeCodes.slice(i, i + NAV_FETCH_CHUNK_SIZE);
    const rows = await prisma.mfSchemeMetrics.findMany({
      where: { schemeCode: { in: [...chunk] }, asOf },
      select: { schemeCode: true, horizonYears: true, status: true, metrics: true },
    });
    for (const r of rows) {
      let byHorizon = out.get(r.schemeCode);
      if (byHorizon === undefined) {
        byHorizon = new Map();
        out.set(r.schemeCode, byHorizon);
      }
      byHorizon.set(r.horizonYears, {
        status: r.status,
        metrics:
          r.metrics !== null && typeof r.metrics === 'object'
            ? (r.metrics as unknown as MfHorizonMetrics)
            : null,
      });
    }
  }
  return out;
}

/**
 * Daily adjusted-NAV series per scheme.
 *
 * The join is two hops and deliberately not a Prisma relation — see the
 * `MfSchemeMeta.schemeCode` comment in `schema.prisma`. `adjustedNav` is the
 * only column the analytics layer may read (`01 §2`); `nav` steps down on
 * every IDCW payout. Quarantined rows are filtered because the ingest
 * validation kept them precisely so the gap stays visible rather than closing
 * up over a bad print.
 */
async function loadNavSeries(
  schemeCodes: readonly string[],
  asOf: Date,
): Promise<Map<string, SeriesPoint[]>> {
  const out = new Map<string, SeriesPoint[]>();
  if (schemeCodes.length === 0) return out;

  const since = minusYears(asOf, NAV_LOOKBACK_YEARS);

  for (let i = 0; i < schemeCodes.length; i += NAV_FETCH_CHUNK_SIZE) {
    const chunk = schemeCodes.slice(i, i + NAV_FETCH_CHUNK_SIZE);
    const funds = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { in: [...chunk] } },
      select: { id: true, schemeCode: true },
    });
    if (funds.length === 0) continue;
    const codeByFundId = new Map(funds.map((f) => [f.id, f.schemeCode]));

    const navs = await prisma.mFNav.findMany({
      where: {
        fundId: { in: funds.map((f) => f.id) },
        isQuarantined: false,
        adjustedNav: { not: null },
        date: { gte: since, lte: asOf },
      },
      select: { fundId: true, date: true, adjustedNav: true },
      orderBy: { date: 'asc' },
    });

    const raw = new Map<string, SeriesPoint[]>();
    for (const n of navs) {
      const code = codeByFundId.get(n.fundId);
      if (code === undefined || n.adjustedNav === null) continue;
      const list = raw.get(code);
      const point: SeriesPoint = { date: n.date, value: toDecimal(n.adjustedNav) };
      if (list === undefined) raw.set(code, [point]);
      else list.push(point);
    }
    for (const [code, points] of raw) out.set(code, toDailySeries(points));
  }

  return out;
}

// ---------------------------------------------------------------------------
// 10. I/O — persistence
// ---------------------------------------------------------------------------

/**
 * Upsert on `(schemeCode, asOf, horizonYears)`, so a same-day re-run rewrites
 * identical content rather than duplicating it (`01 §5` idempotency). One
 * `runInTransaction` per universe would be the obvious alternative; it is not
 * used because a universe's write set can run to hundreds of rows and holding
 * one transaction across all of them is the long-transaction failure mode
 * CONTEXT.md §5 warns about. These are reference-data rows with no
 * cross-row invariant to protect: a partial write is re-run and converges.
 */
export async function persistPeerRanks(rows: readonly MfPeerRankRow[]): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const payload = serializePeerRankPayload(row);
    await prisma.mfPeerRank.upsert({
      where: {
        schemeCode_asOf_horizonYears: {
          schemeCode: row.schemeCode,
          asOf: row.asOf,
          horizonYears: row.horizonYears,
        },
      },
      create: {
        schemeCode: row.schemeCode,
        asOf: row.asOf,
        horizonYears: row.horizonYears,
        universeKey: row.peer.universeKey,
        universeSize: row.peer.universeSize,
        percentiles: payload,
      },
      update: {
        universeKey: row.peer.universeKey,
        universeSize: row.peer.universeSize,
        percentiles: payload,
        computedAt: new Date(),
      },
    });
    written += 1;
  }
  return written;
}

/**
 * Write the horizon-0 percentiles back onto the stored `MfCurrentProfile`.
 *
 * ## The ordering problem, and which way out was taken
 *
 * `mfMetricsJob` writes the profile at 23:15 and `mfPeerRankJob` computes ranks
 * at 00:30 (`01 §5`), so a percentile simply is not knowable when the profile
 * is first written — which is why `mfMetrics.service` emits
 * `terPercentile` / `terCategoryMedianPct` / `aumCategoryPercentile` as null
 * with a status. There were two ways to close the gap:
 *
 *   (a) the peer-rank job patches the stored horizon-0 `metrics` JSON, or
 *   (b) every consumer reads the percentile from `MfPeerRank(horizonYears = 0)`
 *       and the profile fields are retired.
 *
 * **(a) is what this does**, for two reasons. First, *every* consumer already
 * reads the profile out of the horizon-0 `metrics` JSON and nothing reads a
 * horizon-0 peer-rank row: `mfFacts.builder.ts` (which feeds `mf.cost.high-ter`)
 * indexes it by `PROFILE_HORIZON`, `mfPortfolioAnalysis.service.ts` pulls
 * `terPercentile` straight out of the same payload for `mf.pf.cost`, and
 * `mfAnalytics.controller.ts` returns it as `MfCurrentProfile`. Patching in
 * place gives all of them the same number with no consumer changes and so no
 * window in which two of them disagree. Second, (b) would mean deleting
 * `terPercentile` from `MfCurrentProfile` in `packages/shared`, which is the
 * published API contract the web app now renders — a DTO removal that has to
 * be weighed against the frontend, not slipped in behind a bug fix.
 *
 * The `MfPeerRank(horizonYears = 0)` row is still written, and it is the source
 * of record: it carries `universeKey`, `universeSize` and the category median
 * that `03 §10`'s explainability payload needs, in exactly the shape every
 * other horizon uses. The profile field is a denormalisation of it, produced in
 * the same pass from the same `Decimal` — see {@link computeStructuralPeerRanks}.
 *
 * What (a) costs: a `mfMetricsJob` re-run later the same day rewrites the
 * profile and blanks these three fields until the next peer-rank run. That is
 * the correct failure mode rather than a silent one — the fields go back to
 * null *with a status*, which every consumer already treats as "not available",
 * and no consumer ever sees a stale percentile presented as current.
 *
 * Idempotent: re-running writes byte-identical JSON. Key order is preserved
 * because `computeProfile` always emits all three fields (assigning to an
 * existing key does not move it) and `fieldStatus` is mutated by delete/set
 * rather than rebuilt.
 */
export async function persistStructuralProfilePatches(
  patches: readonly StructuralProfilePatch[],
): Promise<number> {
  let written = 0;

  for (const patch of patches) {
    const where = {
      schemeCode_asOf_horizonYears: {
        schemeCode: patch.schemeCode,
        asOf: patch.asOf,
        horizonYears: STRUCTURAL_HORIZON,
      },
    };

    const row = await prisma.mfSchemeMetrics.findUnique({ where, select: { metrics: true } });
    if (
      row === null ||
      row.metrics === null ||
      typeof row.metrics !== 'object' ||
      Array.isArray(row.metrics)
    ) {
      // Membership required this row to exist, so we are here only if the
      // metrics job rewrote or removed it since it was loaded. The next run
      // repairs it; throwing would fail a whole universe over one scheme.
      logger.warn(
        { schemeCode: patch.schemeCode, asOf: patch.asOf.toISOString() },
        '[mfPeerRank] horizon-0 profile vanished between load and write-back; skipped',
      );
      continue;
    }

    const profile: Record<string, unknown> = { ...(row.metrics as Record<string, unknown>) };
    const rawStatus = profile['fieldStatus'];
    const fieldStatus: Record<string, unknown> =
      rawStatus !== null && typeof rawStatus === 'object' && !Array.isArray(rawStatus)
        ? { ...(rawStatus as Record<string, unknown>) }
        : {};

    for (const [field, value] of Object.entries(patch.fields)) {
      profile[field] = value;
      // The shared contract is "a null always carries a status, a present
      // value never does" (`02 §9`), and `mfMetrics.service`'s FieldStatus
      // records an entry only for nulls. Mirror it exactly in both directions.
      if (value === null) fieldStatus[field] = PROFILE_UNRANKED_STATUS;
      else delete fieldStatus[field];
    }
    profile['fieldStatus'] = fieldStatus;

    await prisma.mfSchemeMetrics.update({
      where,
      // `computedAt` is deliberately untouched: the metrics were not
      // recomputed, one derived field on them was filled in.
      data: { metrics: profile as Prisma.InputJsonValue },
    });
    written += 1;
  }

  return written;
}

// ---------------------------------------------------------------------------
// 11. Orchestration for one universe
// ---------------------------------------------------------------------------

export interface UniverseRunResult {
  universeKey: string;
  /** Ranking-universe size at the shallowest horizon that produced rows. */
  rowsWritten: number;
  /** Includes `0` when the horizon-0 structural pass produced rows. */
  horizons: number[];
  /** Horizon-0 profiles patched with TER / AUM percentiles. */
  profilesPatched: number;
}

/**
 * Load, compute and persist one universe. The job loops over this.
 *
 * The universe is the natural batch: ranking one fund requires every other
 * member's metrics in memory anyway, so a per-scheme unit of work would load
 * the same universe once per member.
 */
export async function runPeerRankForUniverse(
  ref: UniverseRef,
  asOf: Date,
): Promise<UniverseRunResult> {
  const day = startOfUtcDay(asOf);
  const candidates = await loadCandidates(ref);
  const eligible = candidates.filter(isUniverseEligible);
  if (eligible.length === 0) {
    return { universeKey: ref.universeKey, rowsWritten: 0, horizons: [], profilesPatched: 0 };
  }

  const codes = eligible.map((c) => c.schemeCode);
  const [metricsByScheme, navByScheme] = await Promise.all([
    loadMetrics(codes, day),
    loadNavSeries(codes, day),
  ]);

  const spec = specFor(ref.sebiSubCategory as SebiSubCategory);
  if (spec === undefined) {
    throw new Error(
      `[mfPeerRank] "${ref.sebiSubCategory}" is not a known SEBI sub-category; ` +
        'the universe cannot be scored under any model.',
    );
  }

  const rows = computeUniversePeerRanks({
    universeKey: ref.universeKey,
    modelKey: spec.modelKey,
    asOf: day,
    candidates: eligible,
    metricsByScheme,
    navByScheme,
  });

  // ── Horizon-0 structural pass ──────────────────────────────────────────
  //
  // Reuses the `metricsByScheme` load above — `loadMetrics` already fetches
  // every horizon at this `asOf`, horizon 0 included — so the value that gets
  // ranked is byte-for-byte the value sitting on the profile. Loading TER from
  // `MfSchemeTer` again here would be a second opinion that can disagree with
  // the number the UI is showing.
  //
  // Computed independently of `rows`, and unconditionally: a category whose
  // funds are all younger than three years produces no horizon rows at all and
  // must still get its cost universe. That is the whole point of the
  // membership rule in §7b.
  const profileByScheme = new Map<string, MfCurrentProfile>();
  for (const [schemeCode, byHorizon] of metricsByScheme) {
    const h0 = byHorizon.get(STRUCTURAL_HORIZON);
    if (h0 === undefined || h0.metrics === null) continue;
    // `LoadedSchemeMetrics.metrics` is typed for the return-window rows; the
    // horizon-0 row stores an `MfCurrentProfile` in the same JSON column
    // (`mfMetrics.service.persistSchemeMetrics`).
    profileByScheme.set(schemeCode, h0.metrics as unknown as MfCurrentProfile);
  }

  const structural = computeStructuralPeerRanks({
    universeKey: ref.universeKey,
    modelKey: spec.modelKey,
    asOf: day,
    candidates: eligible,
    profileByScheme,
  });

  const written = await persistPeerRanks([...rows, ...structural.rows]);
  const profilesPatched = await persistStructuralProfilePatches(structural.patches);

  const allRows = [...rows, ...structural.rows];
  return {
    universeKey: ref.universeKey,
    rowsWritten: written,
    horizons: [...new Set(allRows.map((r) => r.horizonYears))].sort((a, b) => a - b),
    profilesPatched,
  };
}

// ---------------------------------------------------------------------------
// 12. Reading a rank back (IDCW-aware)
// ---------------------------------------------------------------------------

/**
 * The peer rank that applies to `schemeCode`, following the IDCW → growth
 * sibling hop when needed. Returns `null` when the scheme has no rankable
 * sibling, which is the honest answer — see {@link resolveRankableSchemeCode}.
 */
export async function getPeerRankForScheme(
  schemeCode: string,
  asOf: Date,
  horizonYears: MfRankHorizon,
): Promise<PersistedPeerRank | null> {
  const meta = await prisma.mfSchemeMeta.findUnique({
    where: { schemeCode },
    select: { schemeCode: true, optionType: true, growthSiblingSchemeCode: true },
  });
  if (meta === null) return null;
  const rankable = resolveRankableSchemeCode(meta);
  if (rankable === null) return null;

  const row = await prisma.mfPeerRank.findUnique({
    where: {
      schemeCode_asOf_horizonYears: {
        schemeCode: rankable,
        asOf: startOfUtcDay(asOf),
        horizonYears,
      },
    },
  });
  if (row === null) return null;
  return parsePeerRankPayload(row);
}
