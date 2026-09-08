/**
 * Pure arithmetic for the methodology backtest (`06-QUALITY-COMPLIANCE.md §3`).
 *
 * This file is the `.parse.ts` half of the repo's pure/side-effecting split
 * (CONTEXT.md §14): everything here is a total function of its arguments, so
 * `test/scripts/mf-backtest.test.ts` can exercise quintile bucketing, the
 * spread/hit-rate/monotonicity arithmetic, the regression and — most
 * importantly — the refusal gate, without a database, without Prisma and
 * without a single row of NAV history. `scripts/mf-backtest.ts` is the thin
 * loading shell that feeds it.
 *
 * The two things a backtest can lie about, and where they are handled:
 *
 *  1. **Lookahead.** Nothing in this file can look ahead, because it never
 *     reads anything: the shell is responsible for only ever handing it
 *     as-of-`t` scores. The one place the future legitimately appears is
 *     {@link forwardOutcome}, which measures what happened *after* `t` — that
 *     is the dependent variable, not an input to the score.
 *  2. **Survivorship.** Also the shell's job (universe membership as of `t`),
 *     but this file carries the *detector*: `deadSchemesInWindow` vs
 *     `deadSchemesRanked` in {@link BacktestCoverage}, checked by
 *     {@link checkPreconditions}. A run over a universe that contains only
 *     today's survivors is refused rather than reported, because such a run
 *     measures "did the funds that are still alive do well", to which the
 *     answer is yes by construction.
 *
 * Every number is a `Decimal`. A backtest decided by float drift is worthless:
 * the hit-rate gate is a strict `> 0` on a spread that is routinely in the
 * fourth decimal place, and IEEE-754 noise at that magnitude flips months.
 */

import { Decimal, toDecimal } from '@portfolioos/shared';
import type {
  MfCurrentProfile,
  MfHorizonMetrics,
  MfMetricStatus,
  MfModelKey,
  MfRatingStatus,
} from '@portfolioos/shared';
import {
  cagr,
  maxDrawdown,
  type SeriesPoint,
} from '../src/services/mfAnalytics/mfMetricsMath.js';
import {
  blendHorizons,
  composite,
  percentileRankForMetric,
  pillarScore,
  ratingStatusFor,
  type PillarForComposite,
  type PillarInputValue,
  type ScoringHorizon,
  type ScoringModel,
} from '../src/services/mfAnalytics/mfScoring/mfScoreMath.js';

// ---------------------------------------------------------------------------
// 0. Where each scored metric's value comes from
// ---------------------------------------------------------------------------

/**
 * Dotted path into `MfHorizonMetrics` for each model input that lives on a
 * per-horizon metrics row, plus whether it must be ranked on magnitude.
 *
 * This deliberately mirrors `RANKED_METRICS` in `mfPeerRank.service.ts` rather
 * than importing it. That module reaches for `lib/prisma.js` at import time to
 * expose its persistence helpers, and pulling a Prisma client (and with it
 * `config/env.ts`'s boot-time Zod validation) into a pure unit test would make
 * "can this math be tested without a DB" false. The duplication is four lines
 * of field paths; the coupling would be the whole ORM.
 *
 * `magnitude` exists for the same reason it does upstream: `maxDrawdown`,
 * `worstMonth` and `worstCalendarYear` are stored as signed losses (−0.30 is a
 * 30% fall) but carry `LOWER_IS_BETTER`, so ranking the signed value would put
 * a −45% drawdown *above* a −5% one.
 */
export const HORIZON_METRIC_SOURCES: Readonly<
  Record<string, { block: string; field: string; magnitude?: boolean }>
> = Object.freeze({
  sortino: { block: 'riskAdjusted', field: 'sortino' },
  sharpe: { block: 'riskAdjusted', field: 'sharpe' },
  informationRatio: { block: 'riskAdjusted', field: 'informationRatio' },
  jensenAlphaAnn: { block: 'riskAdjusted', field: 'jensenAlphaAnn' },
  trackingErrorAnn: { block: 'riskAdjusted', field: 'trackingErrorAnn' },
  downCapture: { block: 'relative', field: 'downCapture' },
  outperformanceAnn: { block: 'relative', field: 'outperformanceAnn' },
  maxDrawdown: { block: 'risk', field: 'maxDrawdown', magnitude: true },
  worstMonth: { block: 'risk', field: 'worstMonth', magnitude: true },
  worstCalendarYear: { block: 'risk', field: 'worstCalendarYear', magnitude: true },
  pctNegativeMonths: { block: 'risk', field: 'pctNegativeMonths' },
  rollingBeatBenchPct: { block: 'consistency', field: 'rollingBeatBenchPct' },
  rollingBeatCategoryPct: { block: 'consistency', field: 'rollingBeatCategoryPct' },
  quartileConsistency: { block: 'consistency', field: 'quartileConsistency' },
});

/**
 * Model inputs sourced from the horizon-0 structural row (`02 §8`), and the
 * `MfCurrentProfile` field each one ranks.
 *
 * `terPercentile` and `aumCategoryPercentile` are *outputs* of the peer-rank
 * job on the live path, so reading them back would be reading a percentile
 * computed against whatever universe the job saw — today's, in a table
 * backfilled today. The backtest ranks the raw `terPct` / `aum` against the
 * as-of-`t` universe itself, which is what `computeStructuralPeerRanks` does
 * upstream and is the only version of the number that carries no lookahead.
 */
export const STRUCTURAL_METRIC_SOURCES: Readonly<Record<string, string>> = Object.freeze({
  terPercentile: 'terPct',
  aumCategoryPercentile: 'aum',
  aumGrowth12mPct: 'aumGrowth12mPct',
  activeShare: 'activeShare',
  hhi: 'hhi',
  styleDrift: 'styleDrift',
  cashPct: 'cashPct',
  belowAAPct: 'belowAAPct',
  topIssuerPct: 'topIssuerPct',
  managerTenureYears: 'managerTenureYears',
  managerChangesLast3y: 'managerChangesLast3y',
});

/**
 * Model inputs this backtest cannot source, and why. Reported in the markdown
 * rather than silently dropped: a pillar scored on two of its three inputs is
 * a different pillar, and a reader comparing the backtest against `03 §4` must
 * be able to see which weights actually applied.
 *
 * `pillarScore` re-normalises across the inputs that are present, so an
 * unavailable input costs coverage, not correctness.
 */
export const UNSOURCEABLE_METRICS: Readonly<Record<string, string>> = Object.freeze({
  amcQualitativeScore:
    'RAW_SCORE from MfSchemeQualitativeFact; defaults to 1.00 for every clean AMC, so it is ' +
    'constant across a universe and contributes no ordering. Excluded rather than fed in as a ' +
    'constant, which would dilute the PEOPLE_PARENT pillar toward 1.00 for everyone.',
  sovAaaPct:
    'creditQualitySplit.sov + .aaa is derivable from the horizon-0 profile but only once debt ' +
    'holdings snapshots are backfilled; no snapshot history exists yet.',
  modifiedDurationInBand:
    'Needs the SEBI duration band per sub-category applied to a point-in-time modifiedDuration. ' +
    'MANDATE_FIT carries 5% of the DEBT models and is binary; deferred.',
  equityAllocationDrift:
    'Requires 12 trailing portfolio snapshots per scheme (`03 §7`). Snapshot history is not ' +
    'backfilled.',
  trackingDifferenceAbs:
    '|outperformanceAnn + terPct| mixes a per-horizon metric with a structural one; deriving it ' +
    'here would be a second implementation of an INDEX-model input. Deferred with the INDEX ' +
    'model, which is not the model the `06 §3` acceptance gate is stated for.',
  inavDeviationAbs: 'ETF bid-ask / iNAV deviation is not ingested by any feed in this repo.',
});

// ---------------------------------------------------------------------------
// 1. Forward outcome measurement (the dependent variable)
// ---------------------------------------------------------------------------

/** Calendar-day difference, absolute, on UTC midnights. */
function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round(Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** Last series point at or before `at`, or null. Series must be ascending. */
function pointAtOrBefore(series: readonly SeriesPoint[], at: Date): SeriesPoint | null {
  let found: SeriesPoint | null = null;
  for (const p of series) {
    if (p.date.getTime() <= at.getTime()) found = p;
    else break;
  }
  return found;
}

export function plusYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Tolerance either side of a window edge, in calendar days.
 *
 * A month-end that lands on a Sunday, a Diwali cluster, or a settlement
 * holiday has no NAV. Seven days is the same tolerance
 * `WINDOW_START_TOLERANCE_DAYS` uses upstream for the trailing windows, and
 * using a different one here would let a fund qualify for a metric window and
 * not for the forward window measuring it.
 */
export const FORWARD_EDGE_TOLERANCE_DAYS = 7;

export interface ForwardOutcome {
  /** Annualised return over `[t, t + years]`. Null when the window is incomplete. */
  forwardCagr: Decimal | null;
  /** Signed (negative) worst peak-to-trough inside `[t, t + years]`. */
  forwardMaxDrawdown: Decimal | null;
  reason: 'ok' | 'no_start_point' | 'no_end_point' | 'uncomputable';
}

/**
 * What actually happened to this fund over the `years` after `t`.
 *
 * This is the only function in the file that reads data dated after `t`, and
 * that is correct: it is the outcome the score is being tested against. The
 * discipline the no-lookahead rule imposes is that nothing derived here may
 * ever flow back into a composite — which is structurally guaranteed, because
 * the shell computes every composite before it computes any forward outcome.
 */
export function forwardOutcome(
  daily: readonly SeriesPoint[],
  t: Date,
  years: number,
): ForwardOutcome {
  const start = pointAtOrBefore(daily, t);
  if (start === null || daysBetween(start.date, t) > FORWARD_EDGE_TOLERANCE_DAYS) {
    return { forwardCagr: null, forwardMaxDrawdown: null, reason: 'no_start_point' };
  }

  const target = plusYears(t, years);
  const end = pointAtOrBefore(daily, target);
  if (end === null || daysBetween(end.date, target) > FORWARD_EDGE_TOLERANCE_DAYS) {
    // Deliberately NOT falling back to "the last NAV we have". A fund whose
    // series stops 14 months into the window is a fund that merged or wound
    // up, and annualising its truncated run as though it were a full three
    // years is how a backtest quietly deletes its own worst outcomes.
    return { forwardCagr: null, forwardMaxDrawdown: null, reason: 'no_end_point' };
  }

  const window = daily.filter(
    (p) => p.date.getTime() >= start.date.getTime() && p.date.getTime() <= end.date.getTime(),
  );

  const r = cagr(start.value, end.value, toDecimal(years));
  if (r.value === null) {
    return { forwardCagr: null, forwardMaxDrawdown: null, reason: 'uncomputable' };
  }

  const dd = maxDrawdown(window).maxDrawdown.value;
  return { forwardCagr: r.value, forwardMaxDrawdown: dd, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// 2. Quintile bucketing (`06 §3` step 2)
// ---------------------------------------------------------------------------

export const QUINTILE_COUNT = 5;

export interface QuintileAssignment<T> {
  /** Index 0 = Q1 = best-scored fifth. Always length 5; a bucket may be empty. */
  buckets: T[][];
  /**
   * How many funds were separated from an exactly-equal peer by a bucket
   * boundary. Reported, not hidden: at a boundary the split is arbitrary, and
   * a month whose Q1/Q5 spread rests on 40 tied funds cut in half is a month
   * whose result is noise.
   */
  boundaryTies: number;
}

/**
 * Sort descending by `value` and cut into five near-equal buckets.
 *
 * **Sizes.** `n` is almost never divisible by 5. Boundaries are
 * `floor(i × n / 5)`, which spreads the remainder deterministically across the
 * earlier buckets rather than dumping it all in Q5. For n = 23: 4/5/5/4/5.
 *
 * **Ties.** Equal composites are ordered by `key` (the scheme code) so a rerun
 * on the same data produces the same buckets — without it the answer would
 * depend on the order Postgres happened to return rows in, and two runs of the
 * "same" backtest could disagree. That ordering is arbitrary in the sense that
 * matters, so every tie split across a boundary is counted in `boundaryTies`.
 */
export function assignQuintiles<T>(
  items: readonly T[],
  value: (item: T) => Decimal,
  key: (item: T) => string,
): QuintileAssignment<T> {
  const sorted = [...items].sort((a, b) => {
    const c = value(b).comparedTo(value(a)); // descending: best first
    return c !== 0 ? c : key(a).localeCompare(key(b));
  });

  const n = sorted.length;
  const buckets: T[][] = [];
  const bounds: number[] = [];
  for (let i = 0; i <= QUINTILE_COUNT; i += 1) {
    bounds.push(Math.floor((i * n) / QUINTILE_COUNT));
  }
  for (let i = 0; i < QUINTILE_COUNT; i += 1) {
    buckets.push(sorted.slice(bounds[i]!, bounds[i + 1]!));
  }

  // A boundary tie is a cut between two adjacent, exactly-equal values.
  let boundaryTies = 0;
  for (let i = 1; i < QUINTILE_COUNT; i += 1) {
    const cut = bounds[i]!;
    if (cut <= 0 || cut >= n) continue;
    if (value(sorted[cut - 1]!).equals(value(sorted[cut]!))) boundaryTies += 1;
  }

  return { buckets, boundaryTies };
}

// ---------------------------------------------------------------------------
// 3. Small Decimal statistics
// ---------------------------------------------------------------------------

export function mean(values: readonly Decimal[]): Decimal | null {
  if (values.length === 0) return null;
  return values
    .reduce((acc, v) => acc.plus(v), new Decimal(0))
    .dividedBy(toDecimal(values.length));
}

export function median(values: readonly Decimal[]): Decimal | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!.plus(sorted[mid]!).dividedBy(2);
}

// ---------------------------------------------------------------------------
// 4. One month, one universe (`06 §3` steps 3-4)
// ---------------------------------------------------------------------------

/** A scheme that had both a score at `t` and a complete forward window. */
export interface BacktestMember {
  schemeCode: string;
  /** 0-100 composite computed from as-of-`t` data only. */
  composite: Decimal;
  /** Pillar key → pillar score in [0,1], or null where the pillar was unscoreable. */
  pillars: Readonly<Record<string, Decimal | null>>;
  forwardCagr: Decimal;
  /** Signed; null when the forward window had too few points to draw down in. */
  forwardMaxDrawdown: Decimal | null;
}

export interface UniverseMonth {
  monthEnd: Date;
  universeKey: string;
  modelKey: string;
  methodologyVersion: string;
  members: readonly BacktestMember[];
}

export interface QuintileStat {
  n: number;
  meanForwardCagr: Decimal | null;
  medianForwardCagr: Decimal | null;
  /** Mean of member forward drawdowns. Negative; less negative is better. */
  meanForwardMaxDrawdown: Decimal | null;
}

export interface MonthOutcome {
  monthEnd: Date;
  universeKey: string;
  modelKey: string;
  n: number;
  quintiles: QuintileStat[];
  /** Q1 mean − Q5 mean. Null when either end was empty. */
  spread: Decimal | null;
  /** Q1 ≥ Q2 ≥ Q3 ≥ Q4 ≥ Q5 on mean forward CAGR. */
  monotonic: boolean;
  /** Of the 4 adjacent quintile pairs, how many were correctly ordered. */
  adjacentPairsInOrder: number;
  adjacentPairsComparable: number;
  boundaryTies: number;
}

/**
 * Rank one universe-month by `rankBy` and measure the forward outcome of each
 * quintile.
 *
 * `rankBy` is what makes "the same per pillar in isolation" (`06 §3` step 4)
 * one code path rather than two: pass the composite for the headline result,
 * pass a single pillar's score to learn whether that pillar is carrying the
 * model. A member whose `rankBy` is null (an unscoreable pillar) is dropped
 * from that view — not defaulted to the median, which would manufacture a
 * middle-quintile fund out of missing data.
 */
export function monthOutcome(
  month: UniverseMonth,
  rankBy: (m: BacktestMember) => Decimal | null = (m) => m.composite,
): MonthOutcome {
  const rankable = month.members.filter((m) => rankBy(m) !== null);
  const { buckets, boundaryTies } = assignQuintiles(
    rankable,
    (m) => rankBy(m) as Decimal,
    (m) => m.schemeCode,
  );

  const quintiles: QuintileStat[] = buckets.map((bucket) => ({
    n: bucket.length,
    meanForwardCagr: mean(bucket.map((m) => m.forwardCagr)),
    medianForwardCagr: median(bucket.map((m) => m.forwardCagr)),
    meanForwardMaxDrawdown: mean(
      bucket.map((m) => m.forwardMaxDrawdown).filter((d): d is Decimal => d !== null),
    ),
  }));

  const q1 = quintiles[0]!.meanForwardCagr;
  const q5 = quintiles[QUINTILE_COUNT - 1]!.meanForwardCagr;
  const spread = q1 !== null && q5 !== null ? q1.minus(q5) : null;

  let inOrder = 0;
  let comparable = 0;
  for (let i = 0; i < QUINTILE_COUNT - 1; i += 1) {
    const a = quintiles[i]!.meanForwardCagr;
    const b = quintiles[i + 1]!.meanForwardCagr;
    if (a === null || b === null) continue;
    comparable += 1;
    if (a.greaterThanOrEqualTo(b)) inOrder += 1;
  }

  return {
    monthEnd: month.monthEnd,
    universeKey: month.universeKey,
    modelKey: month.modelKey,
    n: rankable.length,
    quintiles,
    spread,
    monotonic: comparable === QUINTILE_COUNT - 1 && inOrder === comparable,
    adjacentPairsInOrder: inOrder,
    adjacentPairsComparable: comparable,
    boundaryTies,
  };
}

// ---------------------------------------------------------------------------
// 5. Aggregation across months (`06 §3` step 4)
// ---------------------------------------------------------------------------

export interface BacktestAggregate {
  /** Universe-months contributing a comparable Q1 and Q5. */
  months: number;
  /** Share of months with Q1 − Q5 > 0. The `06 §3` acceptance gate. */
  hitRate: Decimal | null;
  meanSpread: Decimal | null;
  medianSpread: Decimal | null;
  /** Share of months where the five quintiles were fully ordered. */
  monotonicMonthRate: Decimal | null;
  /** Pooled share of correctly ordered adjacent quintile pairs. */
  adjacentPairOrderRate: Decimal | null;
  q1MeanForwardDrawdown: Decimal | null;
  q5MeanForwardDrawdown: Decimal | null;
  /**
   * `06 §3`: "Q1 forward drawdown not worse than Q5". Drawdowns are negative,
   * so "not worse" is `q1 >= q5`. Null when either side had no observation —
   * an unknown, never a pass.
   */
  drawdownAcceptable: boolean | null;
}

export function aggregate(outcomes: readonly MonthOutcome[]): BacktestAggregate {
  const withSpread = outcomes.filter((o) => o.spread !== null);
  const spreads = withSpread.map((o) => o.spread as Decimal);

  const hits = spreads.filter((s) => s.greaterThan(0)).length;
  const monotonicMonths = withSpread.filter((o) => o.monotonic).length;

  const pairsInOrder = outcomes.reduce((a, o) => a + o.adjacentPairsInOrder, 0);
  const pairsComparable = outcomes.reduce((a, o) => a + o.adjacentPairsComparable, 0);

  const q1dd = outcomes
    .map((o) => o.quintiles[0]?.meanForwardMaxDrawdown ?? null)
    .filter((d): d is Decimal => d !== null);
  const q5dd = outcomes
    .map((o) => o.quintiles[QUINTILE_COUNT - 1]?.meanForwardMaxDrawdown ?? null)
    .filter((d): d is Decimal => d !== null);

  const q1MeanForwardDrawdown = mean(q1dd);
  const q5MeanForwardDrawdown = mean(q5dd);

  return {
    months: withSpread.length,
    hitRate:
      withSpread.length === 0
        ? null
        : toDecimal(hits).dividedBy(toDecimal(withSpread.length)),
    meanSpread: mean(spreads),
    medianSpread: median(spreads),
    monotonicMonthRate:
      withSpread.length === 0
        ? null
        : toDecimal(monotonicMonths).dividedBy(toDecimal(withSpread.length)),
    adjacentPairOrderRate:
      pairsComparable === 0
        ? null
        : toDecimal(pairsInOrder).dividedBy(toDecimal(pairsComparable)),
    q1MeanForwardDrawdown,
    q5MeanForwardDrawdown,
    drawdownAcceptable:
      q1MeanForwardDrawdown === null || q5MeanForwardDrawdown === null
        ? null
        : q1MeanForwardDrawdown.greaterThanOrEqualTo(q5MeanForwardDrawdown),
  };
}

// ---------------------------------------------------------------------------
// 6. The regression that produces `replacementExpectedEdge` (`05 §5`)
// ---------------------------------------------------------------------------

export interface RegressionPoint {
  /** Composite gap: this fund's composite minus its universe-month median. */
  x: Decimal;
  /** Forward excess return: forward CAGR minus its universe-month median. */
  y: Decimal;
}

export interface RegressionResult {
  n: number;
  /** Δ forward annual return per 1 composite point. Null when undetermined. */
  slope: Decimal | null;
  intercept: Decimal | null;
  /** Coefficient of determination. A slope with r² ≈ 0 explains nothing. */
  r2: Decimal | null;
  /** Σ(x − x̄)² . Zero means every fund had the same composite: no slope exists. */
  xVariance: Decimal | null;
}

/**
 * Ordinary least squares of forward excess return on composite gap.
 *
 * Both axes are taken **relative to the universe-month median**, which is what
 * makes pooling twelve years and forty categories into one regression legal:
 * the raw level of returns is a property of the calendar (2020 was not 2018)
 * and of the category (small cap is not liquid), and regressing on raw levels
 * would fit the market cycle, not the model. Differencing against the same
 * month's same-universe median removes both.
 *
 * The slope is the coefficient `05 §5` calls for. Its units are "annual return
 * fraction per composite point", so a replacement scoring 20 points higher
 * implies `20 × slope` of expected annual edge — which `05 §5` then halves
 * before using, on the view that half the historical relationship is as much
 * as anyone should promise forward.
 */
export function olsSlope(points: readonly RegressionPoint[]): RegressionResult {
  const n = points.length;
  if (n < 2) {
    return { n, slope: null, intercept: null, r2: null, xVariance: null };
  }

  const nd = toDecimal(n);
  const xBar = points.reduce((a, p) => a.plus(p.x), new Decimal(0)).dividedBy(nd);
  const yBar = points.reduce((a, p) => a.plus(p.y), new Decimal(0)).dividedBy(nd);

  let sxx = new Decimal(0);
  let sxy = new Decimal(0);
  let syy = new Decimal(0);
  for (const p of points) {
    const dx = p.x.minus(xBar);
    const dy = p.y.minus(yBar);
    sxx = sxx.plus(dx.times(dx));
    sxy = sxy.plus(dx.times(dy));
    syy = syy.plus(dy.times(dy));
  }

  if (sxx.isZero()) {
    // Every observation shares one composite. There is no gap to regress on,
    // and returning 0 would read as "the score does not predict returns" when
    // the truth is "this run never varied the score".
    return { n, slope: null, intercept: null, r2: null, xVariance: sxx };
  }

  const slope = sxy.dividedBy(sxx);
  const intercept = yBar.minus(slope.times(xBar));
  const r2 = syy.isZero() ? null : sxy.times(sxy).dividedBy(sxx.times(syy));

  return { n, slope, intercept, r2, xVariance: sxx };
}

/**
 * Build regression points for one universe-month.
 *
 * Returns an empty array for a universe with fewer than two members: a "gap
 * from the median" needs a median that means something.
 */
export function regressionPointsFor(month: UniverseMonth): RegressionPoint[] {
  if (month.members.length < 2) return [];
  const medComposite = median(month.members.map((m) => m.composite));
  const medForward = median(month.members.map((m) => m.forwardCagr));
  if (medComposite === null || medForward === null) return [];
  return month.members.map((m) => ({
    x: m.composite.minus(medComposite),
    y: m.forwardCagr.minus(medForward),
  }));
}

// ---------------------------------------------------------------------------
// 7. Refusal gate — minimum data preconditions
// ---------------------------------------------------------------------------

/**
 * The acceptance thresholds `06 §3` states, restated as data so the report
 * renders from the same constants the script checks against.
 */
export const ACCEPTANCE = Object.freeze({
  /** "Q1 − Q5 spread > 0 in ≥ 65% of months for ACTIVE_EQUITY". */
  minHitRate: new Decimal('0.65'),
  gateModelKey: 'ACTIVE_EQUITY',
  /** "Q1 forward drawdown not worse than Q5". */
  requireDrawdownNotWorse: true,
  forwardYears: 3,
  firstMonthEnd: '2016-01-31',
});

/**
 * Minimum data required before a coefficient may be emitted at all.
 *
 * These are not statistical folklore; each one exists because without it a
 * specific lie becomes tellable:
 *
 *  - `minScoredMonths` — the gate is "spread > 0 in ≥65% of months". With 12
 *    months, 65% is 8 coin flips; the binomial standard error on a 65% rate is
 *    ~14pp, so a model with no skill clears the gate roughly one run in four.
 *    At 60 months the standard error is ~6pp and 65% starts to mean something.
 *    60 months is also five years, which spans at least one drawdown and one
 *    recovery in Indian equity — a model tested only across a bull run has
 *    been tested on one regime.
 *  - `minGateModelMonths` — the same, for `ACTIVE_EQUITY` specifically,
 *    because that is the universe the `06 §3` acceptance threshold is written
 *    for. A run that clears 60 months only by pooling debt and hybrid
 *    universes has not tested the thing being accepted.
 *  - `minUniverseSizeForQuintiles` — 20, so every quintile holds ≥ 4 funds.
 *    `MIN_UNIVERSE_SIZE` (10) is the floor for publishing a *rating*; for a
 *    quintile spread it would put 2 funds in each end, and one fund's
 *    idiosyncratic three years would decide the month.
 *  - `minDistinctSchemes` / `minGateModelDistinctSchemes` — 120 months of the
 *    same 15 funds is not 120 independent observations. A cross-section that
 *    narrow measures those funds, not the model.
 *  - `minRegressionObservations` — the coefficient is the output that moves
 *    money. 1,000 pooled (month, fund) points is the point at which the slope's
 *    standard error is small relative to the effect sizes `05 §5` cares about.
 *  - `requireSurvivorshipEvidence` — the structural check. If the metadata
 *    knows about funds that merged or wound up inside the backtest window and
 *    *none of them ever appeared in a monthly ranking universe*, the run scored
 *    only today's survivors. `02 §6` names this; here it would inflate the
 *    backtest's own result, because the funds that were dropped are exactly the
 *    ones whose forward outcome was worst.
 */
export const PRECONDITIONS = Object.freeze({
  minScoredMonths: 60,
  minGateModelMonths: 60,
  minUniverseSizeForQuintiles: 20,
  minDistinctSchemes: 120,
  minGateModelDistinctSchemes: 50,
  minRegressionObservations: 1000,
  requireSurvivorshipEvidence: true,
});

export type PreconditionThresholds = typeof PRECONDITIONS;

export interface BacktestCoverage {
  /** Distinct month-ends contributing at least one quintile-eligible universe. */
  scoredMonths: number;
  /** Distinct month-ends contributing a quintile-eligible `ACTIVE_EQUITY` universe. */
  gateModelMonths: number;
  /** Universe-months that cleared `minUniverseSizeForQuintiles`. */
  quintileEligibleUniverseMonths: number;
  /** Universe-months rejected for being too small to quintile. */
  tooSmallUniverseMonths: number;
  distinctSchemes: number;
  gateModelDistinctSchemes: number;
  regressionObservations: number;
  /** Null when the regression could not be formed at all. */
  regressionXVariance: Decimal | null;
  /** Schemes whose status left ACTIVE inside the backtest window, per metadata. */
  deadSchemesInWindow: number;
  /** How many of those actually appeared in some month's ranking universe. */
  deadSchemesRanked: number;
}

export interface PreconditionFailure {
  code: string;
  requirement: string;
  observed: string;
  remedy: string;
}

export interface PreconditionReport {
  ok: boolean;
  failures: PreconditionFailure[];
}

/**
 * Decide whether this run is allowed to emit a coefficient.
 *
 * Returns every failure, not the first: an operator staring at an empty
 * database needs the whole list of what to backfill, not one item at a time
 * across six runs.
 */
export function checkPreconditions(
  coverage: BacktestCoverage,
  thresholds: PreconditionThresholds = PRECONDITIONS,
): PreconditionReport {
  const failures: PreconditionFailure[] = [];

  if (coverage.scoredMonths < thresholds.minScoredMonths) {
    failures.push({
      code: 'INSUFFICIENT_MONTHS',
      requirement: `≥ ${thresholds.minScoredMonths} month-ends with at least one quintile-eligible universe and a complete ${ACCEPTANCE.forwardYears}-year forward window`,
      observed: `${coverage.scoredMonths}`,
      remedy:
        'Backfill daily adjusted NAV and MfSchemeMetrics rows so that month-ends from ' +
        `${ACCEPTANCE.firstMonthEnd} onward each have scoreable schemes, and so that NAV ` +
        `extends ${ACCEPTANCE.forwardYears} years past the last scored month.`,
    });
  }

  if (coverage.gateModelMonths < thresholds.minGateModelMonths) {
    failures.push({
      code: 'INSUFFICIENT_GATE_MODEL_MONTHS',
      requirement: `≥ ${thresholds.minGateModelMonths} month-ends with a quintile-eligible ${ACCEPTANCE.gateModelKey} universe`,
      observed: `${coverage.gateModelMonths}`,
      remedy: `The ${ACCEPTANCE.gateModelKey} model is the one the 06 §3 acceptance threshold is written for; its universes must be populated even if others are not.`,
    });
  }

  if (coverage.quintileEligibleUniverseMonths === 0) {
    failures.push({
      code: 'NO_QUINTILE_ELIGIBLE_UNIVERSE',
      requirement: `at least one universe-month with ≥ ${thresholds.minUniverseSizeForQuintiles} scoreable schemes`,
      observed: `0 eligible (${coverage.tooSmallUniverseMonths} universe-months were below the floor)`,
      remedy:
        'A quintile needs ≥ 4 funds per bucket. Backfill metadata and metrics for whole ' +
        'sub-categories rather than sampling schemes across many of them.',
    });
  }

  if (coverage.distinctSchemes < thresholds.minDistinctSchemes) {
    failures.push({
      code: 'INSUFFICIENT_DISTINCT_SCHEMES',
      requirement: `≥ ${thresholds.minDistinctSchemes} distinct schemes scored at least once`,
      observed: `${coverage.distinctSchemes}`,
      remedy:
        'Backfill MfSchemeMeta + MFNav.adjustedNav + MfSchemeMetrics for a broad cross-section, ' +
        'not a handful of funds repeated across many months.',
    });
  }

  if (coverage.gateModelDistinctSchemes < thresholds.minGateModelDistinctSchemes) {
    failures.push({
      code: 'INSUFFICIENT_GATE_MODEL_SCHEMES',
      requirement: `≥ ${thresholds.minGateModelDistinctSchemes} distinct ${ACCEPTANCE.gateModelKey} schemes`,
      observed: `${coverage.gateModelDistinctSchemes}`,
      remedy: `Backfill the equity sub-categories (Large/Mid/Small/Flexi/Multi/Focused/ELSS/…) so ${ACCEPTANCE.gateModelKey} universes are realistic.`,
    });
  }

  if (coverage.regressionObservations < thresholds.minRegressionObservations) {
    failures.push({
      code: 'INSUFFICIENT_REGRESSION_OBSERVATIONS',
      requirement: `≥ ${thresholds.minRegressionObservations} pooled (month, scheme) observations`,
      observed: `${coverage.regressionObservations}`,
      remedy:
        'The regression slope becomes REPLACEMENT_EXPECTED_EDGE and decides whether a real ' +
        'person is told to sell a real fund. It needs a real sample.',
    });
  }

  if (coverage.regressionXVariance !== null && coverage.regressionXVariance.isZero()) {
    failures.push({
      code: 'DEGENERATE_REGRESSION',
      requirement: 'non-zero variance in composite gap',
      observed: 'Σ(x − x̄)² = 0 — every scored fund had the identical composite',
      remedy:
        'Composites are not discriminating. Check that metric rows carry real per-scheme ' +
        'values rather than a single repeated fixture value.',
    });
  }

  if (
    thresholds.requireSurvivorshipEvidence &&
    coverage.deadSchemesInWindow > 0 &&
    coverage.deadSchemesRanked === 0
  ) {
    failures.push({
      code: 'SURVIVORSHIP_BIAS',
      requirement:
        'schemes that merged or wound up inside the window must appear in the months when they were still ACTIVE',
      observed: `${coverage.deadSchemesInWindow} such schemes exist in MfSchemeMeta; ${coverage.deadSchemesRanked} were ever ranked`,
      remedy:
        'MfSchemeMetrics rows are written for ACTIVE schemes only, so a fund that has since ' +
        'died has no historical metric rows and silently drops out of every past universe. ' +
        'Backfill metrics for dead schemes over the months they were alive (02 §6), or the ' +
        'backtest measures survivors only and its result is biased upward.',
    });
  }

  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// 8. As-of-`t` scoring (`06 §3` step 1, `03 §1-§8`)
// ---------------------------------------------------------------------------

/** `03 §3` blends over these; 1y and 7y are reported, never scored. */
const SCORING_HORIZONS: readonly ScoringHorizon[] = [3, 5, 10];

/**
 * One scheme's inputs at a single month-end. Everything here was loaded with
 * `asOf <= t`; the shell is what guarantees that, and this function has no way
 * to reach for anything else.
 */
export interface SchemeAsOfInputs {
  schemeCode: string;
  /** Horizon years (3 | 5 | 10) -> that horizon's metrics row, `status: OK` only. */
  horizonMetrics: ReadonlyMap<number, MfHorizonMetrics>;
  /** The horizon-0 structural row as it stood at `t`, or null. */
  structural: MfCurrentProfile | null;
  /** Months of usable NAV history at `t`. Gates the rating (`03 §4`). */
  historyMonths: number;
}

export interface ScoredScheme {
  schemeCode: string;
  composite: Decimal | null;
  pillars: Record<string, Decimal | null>;
  ratingStatus: MfRatingStatus;
}

export interface UniverseScoreResult {
  universeKey: string;
  modelKey: MfModelKey;
  methodologyVersion: string;
  universeSize: number;
  scores: ScoredScheme[];
  /** Model inputs no scheme in this universe could supply. Reported, not hidden. */
  missingInputs: string[];
}

/** Read a numeric leaf out of a metrics row, honouring its `fieldStatus`. */
function readNumeric(
  bag: Record<string, unknown> | null,
  path: readonly string[],
  fieldStatus: Record<string, MfMetricStatus> | undefined,
  statusKey: string,
): Decimal | null {
  if (bag === null) return null;
  const status = fieldStatus?.[statusKey];
  if (status !== undefined && status !== 'OK') return null;

  let cursor: unknown = bag;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (cursor === null || cursor === undefined) return null;
  if (typeof cursor !== 'string' && typeof cursor !== 'number') return null;

  let d: Decimal;
  try {
    d = toDecimal(cursor as Decimal.Value);
  } catch (err) {
    // Not swallowed: a non-numeric where a number belongs is a data defect the
    // operator has to see, and treating it as "absent" without saying so would
    // let a corrupt row quietly shrink a pillar.
    throw new Error(
      `mf-backtest: non-numeric value at ${statusKey}: ${JSON.stringify(cursor)} (${String(err)})`,
    );
  }
  return d.isFinite() ? d : null;
}

/** The raw value of one model input for one scheme, or null when unavailable. */
function rawInputValue(member: SchemeAsOfInputs, metric: string, horizon: number): Decimal | null {
  const horizonSource = HORIZON_METRIC_SOURCES[metric];
  if (horizonSource !== undefined) {
    const row = member.horizonMetrics.get(horizon);
    if (row === undefined) return null;
    const value = readNumeric(
      row as unknown as Record<string, unknown>,
      [horizonSource.block, horizonSource.field],
      row.fieldStatus,
      `${horizonSource.block}.${horizonSource.field}`,
    );
    if (value === null) return null;
    return horizonSource.magnitude === true ? value.abs() : value;
  }

  const structuralField = STRUCTURAL_METRIC_SOURCES[metric];
  if (structuralField !== undefined) {
    const profile = member.structural;
    if (profile === null) return null;
    return readNumeric(
      profile as unknown as Record<string, unknown>,
      [structuralField],
      profile.fieldStatus,
      structuralField,
    );
  }

  return null;
}

/** The horizons a metric is blended over; `[0]` for a structural input. */
function horizonsFor(metric: string): readonly number[] {
  return STRUCTURAL_METRIC_SOURCES[metric] !== undefined ? [0] : SCORING_HORIZONS;
}

/**
 * Score every member of one universe against one model, using only the
 * as-of-`t` inputs handed in.
 *
 * The percentile for each `(metric, horizon)` is computed **against this
 * universe as it stood at `t`** - including funds that have since merged or
 * wound up, provided the shell put them in `members`. That is the whole
 * survivorship argument in one sentence: a fund's 2018 rank has to be its rank
 * among the funds a 2018 investor could actually have chosen between, not
 * among the subset that happened to survive to 2026.
 *
 * A scheme whose `ratingStatusFor` is not `RATED` gets `composite: null`,
 * matching what `MfSchemeScore` stores on the live path. The backtest then
 * drops it, because the verdict layer never acts on an unrated fund and a
 * backtest that scored funds production would refuse to score is measuring a
 * model that does not exist.
 */
export function scoreUniverseAsOf(input: {
  universeKey: string;
  modelKey: MfModelKey;
  model: ScoringModel;
  members: readonly SchemeAsOfInputs[];
}): UniverseScoreResult {
  const { universeKey, modelKey, model, members } = input;
  const universeSize = members.length;

  // Pass 1 - collect every raw value per (metric, horizon) across the universe.
  // Percentiles are relative, so the whole cross-section has to exist before
  // any single fund can be ranked.
  const raw = new Map<string, Map<string, Decimal>>(); // "metric@horizon" -> scheme -> value
  const missingInputs = new Set<string>();

  for (const pillar of model.pillars) {
    for (const spec of pillar.inputs) {
      if (UNSOURCEABLE_METRICS[spec.metric] !== undefined) {
        missingInputs.add(spec.metric);
        continue;
      }
      let anyValue = false;
      for (const h of horizonsFor(spec.metric)) {
        const key = `${spec.metric}@${h}`;
        const byScheme = new Map<string, Decimal>();
        for (const member of members) {
          const v = rawInputValue(member, spec.metric, h);
          if (v !== null) byScheme.set(member.schemeCode, v);
        }
        if (byScheme.size > 0) anyValue = true;
        raw.set(key, byScheme);
      }
      if (!anyValue) missingInputs.add(spec.metric);
    }
  }

  // Pass 2 - rank, blend, score.
  const scores: ScoredScheme[] = [];
  for (const member of members) {
    const pillarResults: Record<string, { score: Decimal | null }> = {};
    const forComposite: PillarForComposite[] = [];

    for (const pillar of model.pillars) {
      const inputs: PillarInputValue[] = [];

      for (const spec of pillar.inputs) {
        const perHorizon: Partial<Record<ScoringHorizon, Decimal | null>> = {};
        let structuralPercentile: Decimal | null = null;

        for (const h of horizonsFor(spec.metric)) {
          const byScheme = raw.get(`${spec.metric}@${h}`);
          const own = byScheme?.get(member.schemeCode) ?? null;
          if (byScheme === undefined || own === null) continue;
          const pct = percentileRankForMetric(spec.metric, [...byScheme.values()], own, modelKey);
          if (h === 0) structuralPercentile = pct;
          else perHorizon[h as ScoringHorizon] = pct;
        }

        const percentile =
          STRUCTURAL_METRIC_SOURCES[spec.metric] !== undefined
            ? structuralPercentile
            : blendHorizons(perHorizon).value;

        inputs.push({
          metric: spec.metric,
          weight: spec.weight,
          percentile,
          // `03 §4` re-normalises across inputs whose status is OK. A null
          // percentile here means the universe could not produce the number,
          // which is exactly the "drop it and re-weight" case - never a zero.
          status: percentile === null ? 'INSUFFICIENT_DATA' : 'OK',
        });
      }

      const result = pillarScore(inputs);
      pillarResults[pillar.key] = { score: result.score };
      forComposite.push({ key: pillar.key, weight: pillar.weight, score: result.score });
    }

    const ratingStatus = ratingStatusFor({
      historyMonths: member.historyMonths,
      universeSize,
      pillars: pillarResults,
    });

    const compositeValue = ratingStatus === 'RATED' ? composite(forComposite).composite : null;

    scores.push({
      schemeCode: member.schemeCode,
      composite: compositeValue,
      pillars: Object.fromEntries(Object.entries(pillarResults).map(([k, v]) => [k, v.score])),
      ratingStatus,
    });
  }

  return {
    universeKey,
    modelKey,
    methodologyVersion: model.methodologyVersion,
    universeSize,
    scores,
    missingInputs: [...missingInputs].sort(),
  };
}

// ---------------------------------------------------------------------------
// 9. Report rendering (`06 §3` step 5)
// ---------------------------------------------------------------------------

/**
 * Rendering lives on the pure side because the report *is* the deliverable.
 * `06 §3` step 5 persists it to `docs/mf-analytics/backtests/<version>.md` and
 * `03 §9` makes it the artefact that authorises a methodology version to
 * become the default; a document with that standing should not be the one part
 * of the pipeline that only ever runs against a live database. Keeping it here
 * means a test can assert that a refusal report says
 * `INSUFFICIENT DATA — NOT ELIGIBLE TO SHIP` and carries no number, which is a
 * claim about the deliverable rather than about a formatter.
 */

export interface ReportContext {
  runDate: Date;
  firstMonth: Date;
  /** Null when there is no NAV history at all to bound the window with. */
  lastMonth: Date | null;
  monthsAttempted: number;
  forwardYears: number;
  metricStalenessDays: number;
  /** Methodology version the refusal report is filed under. */
  gateVersionLabel: string;
}

export interface ModelReportInput {
  modelKey: string;
  methodologyVersion: string;
  universeMonths: number;
  compositeOutcomes: readonly MonthOutcome[];
  pillarOutcomes: ReadonlyMap<string, readonly MonthOutcome[]>;
  regression: RegressionResult;
  missingInputs: readonly string[];
  coverage: BacktestCoverage;
  /** Whether the run cleared `checkPreconditions`. Gates the constants.ts edit. */
  preconditionsOk: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(value: Decimal | null, dp = 2): string {
  return value === null ? '—' : `${value.times(100).toFixed(dp)}%`;
}

function num(value: Decimal | null, dp = 6): string {
  return value === null ? '—' : value.toFixed(dp);
}

function aggregateRow(label: string, agg: BacktestAggregate): string {
  return (
    `| ${label} | ${agg.months} | ${pct(agg.hitRate)} | ${pct(agg.meanSpread)} | ` +
    `${pct(agg.medianSpread)} | ${pct(agg.monotonicMonthRate)} | ` +
    `${pct(agg.adjacentPairOrderRate)} | ${pct(agg.q1MeanForwardDrawdown)} | ` +
    `${pct(agg.q5MeanForwardDrawdown)} |`
  );
}

function coverageTable(coverage: BacktestCoverage): string[] {
  const lines = ['| Measure | Value |', '|---|---|'];
  for (const [k, v] of Object.entries(coverage)) {
    lines.push(`| \`${k}\` | ${v instanceof Decimal ? v.toFixed(6) : String(v)} |`);
  }
  return lines;
}

/** The banner every refusal report opens with. Asserted by the tests verbatim. */
export const REFUSAL_BANNER = 'INSUFFICIENT DATA — NOT ELIGIBLE TO SHIP';

/**
 * The report for a run that may not emit a coefficient.
 *
 * It contains no spread, no hit rate and no slope — not "a number with the
 * caveat underneath", which is the shape a reader skims past. The only
 * quantities in it are the ones describing what is missing.
 */
export function renderRefusalReport(
  ctx: ReportContext,
  coverage: BacktestCoverage,
  gate: PreconditionReport,
): string {
  const lines: string[] = [];
  lines.push(`# MF score backtest — ${ctx.gateVersionLabel}`);
  lines.push('');
  lines.push(`## ${REFUSAL_BANNER}`);
  lines.push('');
  lines.push(
    'This run produced **no regression coefficient**. `REPLACEMENT_EXPECTED_EDGE` in',
    '`services/mfAnalytics/constants.ts` must stay `null`, and with it `05 §5` row 3 cannot',
    'match, so no `SWITCH_CANDIDATE` verdict naming a replacement can be justified. Funds that',
    'would otherwise be switch candidates fall through to `REVIEW`, which is the correct and',
    'honest outcome while the evidence does not exist.',
    '',
    `Run date: ${isoDate(ctx.runDate)}`,
    `Window attempted: ${isoDate(ctx.firstMonth)} → ${ctx.lastMonth === null ? '(no NAV history)' : isoDate(ctx.lastMonth)}`,
    `Month-ends attempted: ${ctx.monthsAttempted}`,
    '',
    '## What is missing',
    '',
    '| # | Check | Required | Observed | What would satisfy it |',
    '|---|---|---|---|---|',
  );
  gate.failures.forEach((f, i) => {
    lines.push(`| ${i + 1} | \`${f.code}\` | ${f.requirement} | ${f.observed} | ${f.remedy} |`);
  });
  lines.push('');
  lines.push('## Coverage observed');
  lines.push('');
  lines.push(...coverageTable(coverage));
  lines.push('');
  lines.push('## Acceptance thresholds (not evaluated)');
  lines.push('');
  lines.push(
    `- Q1 − Q5 forward-return spread > 0 in ≥ ${pct(ACCEPTANCE.minHitRate, 0)} of months for \`${ACCEPTANCE.gateModelKey}\`.`,
    '- Q1 forward max drawdown no worse than Q5.',
    '',
    'Neither was evaluated: a threshold applied to a sample this thin would report a verdict on',
    'noise. The gate is the data precondition, not the acceptance criterion.',
    '',
  );
  return lines.join('\n');
}

/** The report for one model in a run that cleared every precondition. */
export function renderModelReport(ctx: ReportContext, input: ModelReportInput): string {
  const agg = aggregate(input.compositeOutcomes);
  const isGate = input.modelKey === ACCEPTANCE.gateModelKey;
  const hitRateMet = agg.hitRate !== null && agg.hitRate.greaterThanOrEqualTo(ACCEPTANCE.minHitRate);
  const drawdownMet = agg.drawdownAcceptable === true;

  const lines: string[] = [];
  lines.push(`# MF score backtest — ${input.methodologyVersion}`);
  lines.push('');
  lines.push(`Run date: ${isoDate(ctx.runDate)}`);
  lines.push(`Model: \`${input.modelKey}\``);
  lines.push(
    `Window: ${isoDate(ctx.firstMonth)} → ${ctx.lastMonth === null ? '—' : isoDate(ctx.lastMonth)} ` +
      `(${ctx.forwardYears}-year forward measurement)`,
  );
  lines.push(`Universe-months: ${input.universeMonths}`);
  lines.push('');

  lines.push('## Acceptance (`06 §3`)');
  lines.push('');
  lines.push('| Criterion | Threshold | Observed | Met |');
  lines.push('|---|---|---|---|');
  lines.push(
    `| Q1 − Q5 spread > 0 | ≥ ${pct(ACCEPTANCE.minHitRate, 0)} of months | ${pct(agg.hitRate)} | ${hitRateMet ? 'YES' : 'NO'} |`,
  );
  lines.push(
    `| Q1 forward drawdown not worse than Q5 | Q1 ≥ Q5 | Q1 ${pct(agg.q1MeanForwardDrawdown)} vs Q5 ${pct(agg.q5MeanForwardDrawdown)} | ${drawdownMet ? 'YES' : 'NO'} |`,
  );
  lines.push('');
  if (isGate) {
    lines.push(
      hitRateMet && drawdownMet
        ? '**Acceptance met.** `06 §3` permits this methodology version to become the default.'
        : '**Acceptance NOT met.** `06 §3`: adjust weights and re-run; do not ship a score that ' +
            'does not discriminate.',
    );
  } else {
    lines.push(
      `The \`06 §3\` acceptance threshold is stated for \`${ACCEPTANCE.gateModelKey}\`. The rows ` +
        'above are reported for this model for information, not as a shipping gate.',
    );
  }
  lines.push('');

  lines.push('## Quintile discrimination');
  lines.push('');
  lines.push(
    '| Ranked by | Months | Hit rate | Mean spread | Median spread | Monotonic months | Adjacent pairs ordered | Q1 fwd DD | Q5 fwd DD |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');
  lines.push(aggregateRow('composite', agg));
  for (const [pillar, outcomes] of input.pillarOutcomes) {
    lines.push(aggregateRow(`pillar \`${pillar}\``, aggregate(outcomes)));
  }
  lines.push('');
  lines.push(
    'The per-pillar rows answer "which pillar is carrying the model": a pillar whose own hit',
    'rate beats the composite is doing the work, and one at ~50% is contributing noise at its',
    'declared weight.',
    '',
  );

  lines.push('## Regression — `replacementExpectedEdge` (`05 §5`)');
  lines.push('');
  lines.push('Forward excess return regressed on composite gap, both measured against the same');
  lines.push('universe-month median.');
  lines.push('');
  lines.push('| Measure | Value |');
  lines.push('|---|---|');
  lines.push(`| Observations | ${input.regression.n} |`);
  lines.push(`| Slope (annual return per composite point) | ${num(input.regression.slope)} |`);
  lines.push(`| Intercept | ${num(input.regression.intercept)} |`);
  lines.push(`| r² | ${num(input.regression.r2, 4)} |`);
  lines.push('');

  if (input.preconditionsOk && input.regression.slope !== null) {
    lines.push('### The edit this authorises (NOT applied by the script)');
    lines.push('');
    lines.push('```ts');
    lines.push('// packages/api/src/services/mfAnalytics/constants.ts');
    lines.push(`// Backtest ${input.methodologyVersion}, run ${isoDate(ctx.runDate)}.`);
    lines.push(
      `export const REPLACEMENT_EXPECTED_EDGE: Decimal | null = new Decimal('${input.regression.slope.toFixed(8)}');`,
    );
    lines.push('```');
    lines.push('');
    lines.push(
      'Applying it switches on `SWITCH_CANDIDATE` verdicts that name a replacement — regulated',
      'advice under `06 §4`. A human makes that call after reading this report.',
      '',
    );
  }

  if (input.missingInputs.length > 0) {
    lines.push('## Model inputs the backtest could not source');
    lines.push('');
    lines.push('`03 §4` re-normalises a pillar across the inputs that are present, so these cost');
    lines.push('coverage rather than correctness — but the pillar weights that actually applied');
    lines.push('are not the declared ones.');
    lines.push('');
    lines.push('| Input | Why |');
    lines.push('|---|---|');
    for (const m of [...input.missingInputs].sort()) {
      lines.push(
        `| \`${m}\` | ${UNSOURCEABLE_METRICS[m] ?? 'no scheme in any universe supplied a value'} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Coverage');
  lines.push('');
  lines.push(...coverageTable(input.coverage));
  lines.push('');

  lines.push('## Method');
  lines.push('');
  lines.push(
    '- Every score at month-end `t` uses `MfSchemeMetrics` rows with `asOf <= t` (and no older',
    `  than ${ctx.metricStalenessDays} days). Percentiles are recomputed against the as-of-\`t\``,
    '  cross-section; stored `MfPeerRank` / `terPercentile` values are not read, because they',
    '  carry whatever universe the job last saw.',
    '- Universe membership is evaluated as of `t`: a fund that has since merged or wound up is',
    '  included in the months when it was still ACTIVE (`02 §6`). Of',
    `  ${input.coverage.deadSchemesInWindow} schemes that left ACTIVE inside the window,`,
    `  ${input.coverage.deadSchemesRanked} were ranked in at least one month.`,
    `- Forward outcome: point-to-point CAGR and daily max drawdown over \`[t, t + ${ctx.forwardYears}y]\`,`,
    `  requiring a NAV within ±${FORWARD_EDGE_TOLERANCE_DAYS} days of both edges. A truncated`,
    '  window is discarded, never annualised.',
    '- Quintiles: sorted descending by the ranked value, cut at `floor(i × n / 5)`, ties broken',
    '  by scheme code and counted.',
    '',
  );

  return lines.join('\n');
}
