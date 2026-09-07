/**
 * Pure scoring mathematics for the mutual fund analytics layer
 * (`docs/mf-analytics/03-SCORING.md`).
 *
 * **This module is sterile, like `mfMetricsMath.ts` beside it.** No I/O, no
 * Prisma, no clock, no randomness, no sibling-service imports. It imports
 * `@portfolioos/shared` and `decimal.js` and nothing else. The reason is the
 * one `03 §9` states obliquely: a score row is append-only and is compared
 * against a backtest months later. If reproducing "this fund scored 71.4 on
 * 2026-03-31 under `score-active-equity-v1`" requires standing up a database,
 * the claim is not checkable and the methodology cannot be audited.
 *
 * Four conventions run through the file, and each of them looks wrong without
 * the reason:
 *
 *  1. **Percentiles, not raw metrics, are what get blended and averaged.** A
 *     Sortino of 1.12 and a TER of 0.45% cannot be averaged; their percentiles
 *     within the same universe can. Everything downstream of `percentileRank`
 *     is on a single 0-1 "better is higher" scale by construction.
 *
 *  2. **A value that cannot be computed is `null`, never `0`.** Zero is a real
 *     percentile (dead last). Using it to mean "unknown" is how a fund with no
 *     benchmark ends up scored as a fund that lost to its benchmark. Null
 *     propagates: a null input drops out of its pillar, a pillar with no
 *     surviving inputs drops out of the composite, and the weights of what is
 *     left are re-normalised rather than the gap being filled with a guess.
 *
 *  3. **Decimal in, Decimal out.** Weights in the model files are plain
 *     `number` because they are exact short decimals authored by hand, but
 *     they are converted with `toDecimal()` before any arithmetic
 *     (CONTEXT.md §3.1). Counts (`universeSize`, `historyMonths`) are genuine
 *     integers and stay `number`.
 *
 *  4. **Direction is applied at ranking time, once.** After `percentileRank`
 *     every number in this file means the same thing: higher is better. That
 *     single normalisation is what makes it legitimate for a pillar to average
 *     a TER percentile (lower TER is better) with a Sortino percentile (higher
 *     Sortino is better).
 */

import {
  Decimal,
  toDecimal,
  MIN_RATING_HISTORY_MONTHS,
  MIN_UNIVERSE_SIZE,
} from '@portfolioos/shared';
import type {
  MfMetricStatus,
  MfRatingStatus,
  MfModelKey,
} from '@portfolioos/shared';

// Match `mfMetricsMath.ts`. decimal.js precision is global, not per-call, so
// setting it here keeps this module reproducible when it is loaded first (a
// unit test importing only the scoring math) as well as when the metrics
// module has already run.
Decimal.set({ precision: 28 });

/**
 * Bumped whenever anything in *this file* changes the arithmetic. Distinct
 * from a model's `methodologyVersion`, which is bumped when its weights change
 * (`03 §9`). A change here invalidates every model at once.
 */
export const MF_SCORE_MATH_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Model specification shape (the model files are pure data against this)
// ---------------------------------------------------------------------------

/** One scored input inside a pillar. `weight` is out of 100 within the pillar. */
export interface ScoringInputSpec {
  /** Metric name. Must have an entry in `METRIC_DIRECTION`. */
  readonly metric: string;
  /** 0-100, summing to 100 across the pillar's inputs. */
  readonly weight: number;
}

/** One pillar of a scoring model. `weight` is out of 100 within the model. */
export interface ScoringPillarSpec {
  readonly key: string;
  /** 0-100, summing to 100 across the model's pillars. */
  readonly weight: number;
  readonly inputs: readonly ScoringInputSpec[];
}

/**
 * A scoring model is data, not code. Everything a model can express is a set
 * of named inputs and two levels of weights; there is deliberately no hook for
 * per-model arithmetic, because a model that could run its own code could not
 * be diffed in a methodology changelog (`03 §9`).
 */
export interface ScoringModel {
  readonly modelKey: MfModelKey;
  readonly methodologyVersion: string;
  readonly pillars: readonly ScoringPillarSpec[];
}

// ---------------------------------------------------------------------------
// 1. Direction table (`03 §1`)
// ---------------------------------------------------------------------------

/**
 * How a raw metric maps onto the "higher percentile = better fund" scale.
 *
 * `HIGHER_IS_BETTER_TO_CAP` and `RAW_SCORE` are not in the doc's prose but are
 * forced by it:
 *
 *  - `03 §1` says AUM is "higher-is-better **up to a cap**". Plain
 *    higher-is-better would rank a ₹60,000cr small-cap fund above an ₹8,000cr
 *    one, which inverts the actual risk — past a point new money is an
 *    impact-cost liability, not a quality signal. See `AUM_PLATEAU_CAP_INR`.
 *  - `03 §4` says `amcQualitativeScore` is "treated as a raw score, not a
 *    percentile". Ranking a value that is already on a 0-1 better-is-higher
 *    scale against its peers would turn "every AMC in this category is clean"
 *    into "half of these AMCs are below average", which is a different and
 *    false statement.
 */
export type MetricDirection =
  | 'HIGHER_IS_BETTER'
  | 'LOWER_IS_BETTER'
  | 'HIGHER_IS_BETTER_TO_CAP'
  | 'RAW_SCORE';

/**
 * The plateau above which more AUM stops being evidence of anything good.
 *
 * ₹10,000 crore. Source and reasoning: this is the scale at which SEBI's own
 * March 2024 stress-testing and liquidity-disclosure framework for mid- and
 * small-cap schemes starts to bite — the regulator asks a fund of this size to
 * demonstrate how long it would take to liquidate a quarter of its portfolio,
 * precisely because size past this point is a redemption risk rather than a
 * franchise strength. Below it, AUM is a genuine liquidity/viability signal (a
 * ₹40cr fund can be merged away under you). Above it, the marginal rupee is
 * neutral at best and, in a small-cap mandate, actively harmful.
 *
 * This is a calibration decision, not a derived constant. It lives here rather
 * than in `packages/shared/mfAnalytics.constants.ts` because it is an input to
 * the scoring arithmetic itself, so changing it bumps every model's
 * `methodologyVersion` (`03 §9`).
 */
export const AUM_PLATEAU_CAP_INR = new Decimal('100000000000'); // ₹10,000 crore

/**
 * Cap value per `HIGHER_IS_BETTER_TO_CAP` metric. The test asserts that every
 * capped metric in `METRIC_DIRECTION` has an entry here — a capped direction
 * without a cap would silently fall back to plain ranking.
 */
export const METRIC_PLATEAU_CAP: Readonly<Record<string, Decimal>> = Object.freeze({
  aum: AUM_PLATEAU_CAP_INR,
});

/**
 * Metric name → direction, transcribed from the `03 §1` prose list.
 *
 * Names match `MfHorizonMetrics` / `MfCurrentProfile` field names wherever one
 * exists, so an explainability payload (`03 §10`) can be traced back to the
 * metric that produced it without a translation table.
 */
export const METRIC_DIRECTION: Readonly<Record<string, MetricDirection>> = Object.freeze({
  // ── higher is better ────────────────────────────────────────────────────
  cagr: 'HIGHER_IS_BETTER',
  absolute: 'HIGHER_IS_BETTER',
  sipXirr: 'HIGHER_IS_BETTER',
  outperformanceAnn: 'HIGHER_IS_BETTER',
  sharpe: 'HIGHER_IS_BETTER',
  sortino: 'HIGHER_IS_BETTER',
  calmar: 'HIGHER_IS_BETTER',
  omega: 'HIGHER_IS_BETTER',
  m2: 'HIGHER_IS_BETTER',
  treynor: 'HIGHER_IS_BETTER',
  jensenAlphaAnn: 'HIGHER_IS_BETTER',
  informationRatio: 'HIGHER_IS_BETTER',
  upCapture: 'HIGHER_IS_BETTER',
  battingAverage: 'HIGHER_IS_BETTER',
  rollingBeatBenchPct: 'HIGHER_IS_BETTER',
  rollingBeatCategoryPct: 'HIGHER_IS_BETTER',
  quartileConsistency: 'HIGHER_IS_BETTER',
  activeShare: 'HIGHER_IS_BETTER',
  effectiveHoldings: 'HIGHER_IS_BETTER',
  managerTenureYears: 'HIGHER_IS_BETTER',
  aumGrowth12mPct: 'HIGHER_IS_BETTER',
  /**
   * Already a percentile of AUM within the category, supplied pre-ranked by
   * the metrics layer, so it is monotone by construction here. The plateau
   * caveat on `aum` belongs upstream of this field, where the percentile is
   * built, not to the re-ranking of an already-ranked number.
   */
  aumCategoryPercentile: 'HIGHER_IS_BETTER',
  /** Sovereign + AAA share of a debt portfolio (`03 §6` CREDIT_QUALITY). */
  sovAaaPct: 'HIGHER_IS_BETTER',

  // ── higher is better, but only up to a cap ──────────────────────────────
  aum: 'HIGHER_IS_BETTER_TO_CAP',

  // ── lower is better ─────────────────────────────────────────────────────
  stdDevAnn: 'LOWER_IS_BETTER',
  downsideDevAnn: 'LOWER_IS_BETTER',
  /**
   * `03 §1` says "drawdown **magnitude**". `MfRiskMetrics.maxDrawdown` is
   * stored negative (-0.30 is a 30% fall), so callers pass the absolute value
   * and the direction is LOWER_IS_BETTER. Ranking the signed value with
   * HIGHER_IS_BETTER would give the same ordering but would silently break the
   * day someone changes the sign convention upstream; naming the intent here
   * makes that a test failure instead.
   */
  maxDrawdown: 'LOWER_IS_BETTER',
  worstMonth: 'LOWER_IS_BETTER',
  worstCalendarYear: 'LOWER_IS_BETTER',
  pctNegativeMonths: 'LOWER_IS_BETTER',
  var95Monthly: 'LOWER_IS_BETTER',
  cvar95Monthly: 'LOWER_IS_BETTER',
  downCapture: 'LOWER_IS_BETTER',
  /**
   * `MfCurrentProfile.terPercentile` already arrives ranked, but the entry has
   * to exist so the coverage test passes, and it documents that a caller
   * ranking raw TER instead gets the same ordering.
   */
  terPercentile: 'LOWER_IS_BETTER',
  terPct: 'LOWER_IS_BETTER',
  hhi: 'LOWER_IS_BETTER',
  top10WeightPct: 'LOWER_IS_BETTER',
  styleDrift: 'LOWER_IS_BETTER',
  equityAllocationDrift: 'LOWER_IS_BETTER',
  managerChangesLast3y: 'LOWER_IS_BETTER',
  belowAAPct: 'LOWER_IS_BETTER',
  topIssuerPct: 'LOWER_IS_BETTER',
  cashPct: 'LOWER_IS_BETTER',
  /**
   * `03 §5`: |outperformance + TER|, i.e. how far the tracker's return sits
   * from "index minus its own fee". Named separately from `outperformanceAnn`
   * on purpose — the same field name cannot be higher-is-better in the debt
   * model (`03 §6` PERFORMANCE) and lower-is-better in the index model without
   * the direction table becoming a lie for one of them.
   */
  trackingDifferenceAbs: 'LOWER_IS_BETTER',
  /** ETF bid-ask spread / iNAV deviation (`03 §5` STRUCTURE). */
  inavDeviationAbs: 'LOWER_IS_BETTER',

  // ── lower is better, INDEX model only (see MODEL_SCOPED_METRICS) ────────
  trackingErrorAnn: 'LOWER_IS_BETTER',

  // ── raw 0-1 scores, never ranked ────────────────────────────────────────
  /** `03 §4`. Computed by `amcQualitativeScore` below. */
  amcQualitativeScore: 'RAW_SCORE',
  /**
   * `03 §6` MANDATE_FIT: binary 1/0 for "modified duration inside the SEBI
   * band for this sub-category". A percentile of a 1/0 series would rank the
   * compliant funds against one another, which is meaningless — compliance is
   * not a spectrum.
   */
  modifiedDurationInBand: 'RAW_SCORE',
});

/**
 * Metrics whose direction is only meaningful inside particular models.
 *
 * Tracking error is the whole point of an index fund and is **not** a scored
 * input for an active one: an active manager with low tracking error is a
 * closet indexer, which is a *finding* (`05`), not a better score. Asking for
 * its direction from an active model is therefore a bug in the model file, and
 * `directionFor` throws rather than quietly scoring a fund on a metric its
 * category should not be judged by.
 */
export const MODEL_SCOPED_METRICS: Readonly<Record<string, readonly MfModelKey[]>> =
  Object.freeze({
    trackingErrorAnn: Object.freeze(['INDEX'] as const),
    trackingDifferenceAbs: Object.freeze(['INDEX'] as const),
    inavDeviationAbs: Object.freeze(['INDEX'] as const),
  });

/**
 * Direction lookup, model-aware.
 *
 * @throws RangeError when the metric has no direction entry, or when a
 * model-scoped metric is requested from a model it does not belong to.
 */
export function directionFor(metric: string, modelKey?: MfModelKey): MetricDirection {
  const direction = METRIC_DIRECTION[metric];
  if (direction === undefined) {
    throw new RangeError(
      `directionFor: no direction entry for metric "${metric}". ` +
        'Every input named in a model must be in METRIC_DIRECTION (`03 §11.2`).',
    );
  }
  const scope = MODEL_SCOPED_METRICS[metric];
  if (scope !== undefined && modelKey !== undefined && !scope.includes(modelKey)) {
    throw new RangeError(
      `directionFor: metric "${metric}" is only scored in [${scope.join(', ')}] ` +
        `models, not "${modelKey}".`,
    );
  }
  return direction;
}

// ---------------------------------------------------------------------------
// 1b. Percentile rank (`03 §1`)
// ---------------------------------------------------------------------------

/**
 * `pct = (count(worse) + 0.5 × count(equal)) / n`, with "worse" decided by the
 * metric's direction so the result always means "higher is better".
 *
 * **Why the 0.5-for-ties term is not optional.** Without it a tie group
 * collapses to one extreme: either every tied fund gets `count(worse)/n` (all
 * pushed to the bottom of their own tie group) or `count(worse or equal)/n`
 * (all pushed to the top). Real categories are full of exact ties — thirty
 * index funds charging exactly 0.20% TER, a dozen funds with a manager tenure
 * of exactly 3.0 years — and either collapse would move all thirty of them
 * ~30 percentile points in unison on a metric where they are genuinely
 * identical. Splitting the tie group puts every member at its midpoint, which
 * is the only answer that does not assert an ordering the data does not
 * contain.
 *
 * @param values the full universe INCLUDING the subject's own value.
 * @returns a Decimal in [0,1], or `null` when the universe is empty — there is
 * nothing to be relative to, and `null` is the honest answer, not `0.5`.
 */
export function percentileRank(
  values: readonly Decimal[],
  target: Decimal,
  direction: MetricDirection = 'HIGHER_IS_BETTER',
): Decimal | null {
  if (direction === 'RAW_SCORE') {
    throw new RangeError(
      'percentileRank: RAW_SCORE metrics are consumed as-is and must not be ranked (`03 §4`).',
    );
  }
  const n = values.length;
  if (n === 0) return null;

  // The cap is applied to BOTH the universe and the target before comparison,
  // which is what turns "higher is better" into a plateau: everything at or
  // above the cap becomes one tie group and shares the same top percentile.
  // `percentileRank` called directly with the capped direction uses the AUM
  // plateau (the only capped metric today); `percentileRankForMetric` resolves
  // the cap by name and is what callers should use.
  const cap = direction === 'HIGHER_IS_BETTER_TO_CAP' ? AUM_PLATEAU_CAP_INR : null;
  const clamp = (v: Decimal): Decimal => (cap === null ? v : Decimal.min(v, cap));

  const t = clamp(target);
  let worse = 0;
  let equal = 0;
  for (const raw of values) {
    const v = clamp(raw);
    if (v.equals(t)) {
      equal += 1;
    } else if (direction === 'LOWER_IS_BETTER' ? v.greaterThan(t) : v.lessThan(t)) {
      worse += 1;
    }
  }

  return toDecimal(worse).plus(toDecimal(equal).times('0.5')).dividedBy(toDecimal(n));
}

/**
 * Rank by metric name: resolves direction (model-aware) and any plateau cap.
 *
 * A `RAW_SCORE` metric is returned unchanged — it is already on the 0-1
 * better-is-higher scale that ranking would otherwise produce, and passing it
 * through here rather than special-casing it at every call site is what keeps
 * `03 §4`'s "treated as a raw score" from being forgotten in one of them.
 */
export function percentileRankForMetric(
  metric: string,
  values: readonly Decimal[],
  target: Decimal,
  modelKey?: MfModelKey,
): Decimal | null {
  const direction = directionFor(metric, modelKey);
  if (direction === 'RAW_SCORE') return target;

  if (direction === 'HIGHER_IS_BETTER_TO_CAP') {
    const cap = METRIC_PLATEAU_CAP[metric];
    if (cap === undefined) {
      throw new RangeError(
        `percentileRankForMetric: "${metric}" is HIGHER_IS_BETTER_TO_CAP but has no ` +
          'entry in METRIC_PLATEAU_CAP.',
      );
    }
    return percentileRank(
      values.map((v) => Decimal.min(v, cap)),
      Decimal.min(target, cap),
      'HIGHER_IS_BETTER',
    );
  }

  return percentileRank(values, target, direction);
}

// ---------------------------------------------------------------------------
// 3. Horizon blending (`03 §3`)
// ---------------------------------------------------------------------------

/** The horizons the scoring layer blends over. 1y and 7y are reported, not scored. */
export type ScoringHorizon = 3 | 5 | 10;

/**
 * `03 §3` table, as declared weights. Everything else is renormalisation.
 *
 * The documented rows are exactly this vector renormalised over the available
 * subset: {3,5} → 20/30 → 40/60, and {3} → 20 → 100. Implementing it as
 * renormalisation rather than as a three-row lookup means the case the doc did
 * not enumerate — a fund with 3y and 10y percentiles but a 5y gap, which
 * happens whenever a benchmark series has a hole in the middle — gets the only
 * answer consistent with the rest of the table (20/50 → 28.57/71.43) instead
 * of silently discarding a ten-year record.
 */
export const HORIZON_BASE_WEIGHTS: Readonly<Record<ScoringHorizon, number>> = Object.freeze({
  3: 20,
  5: 30,
  10: 50,
});

export type HorizonBlendReason = 'ok' | 'no_3y_history' | 'no_horizons';

export interface HorizonBlendResult {
  /** Blended percentile in [0,1], or null when there is no rateable history. */
  value: Decimal | null;
  /** Applied weight per horizon, fractions summing to 1. Empty when `value` is null. */
  weights: Partial<Record<ScoringHorizon, Decimal>>;
  reason: HorizonBlendReason;
}

/**
 * Blend per-horizon percentiles into one.
 *
 * **The blend is on the percentile, not on the raw metric**, and that is the
 * entire point of it (`03 §3`, the Morningstar approach). Blending raw returns
 * would let one spectacular year dominate a ten-year record, because a 90%
 * year is arithmetically enormous next to a run of 12% ones. Blending
 * percentiles asks a different question at each horizon — "how did this fund
 * rank against the same peers over this period?" — and so rewards a fund that
 * sat in the top third across a whole market cycle over one that was 99th
 * percentile in a single hot streak and mid-table either side of it. The
 * 20/30/50 tilt toward the longest horizon says the same thing again in the
 * weights.
 *
 * A missing 3-year percentile means no rating at all, not a blend of what is
 * left: a fund whose 3-year metric could not be computed has no assessable
 * recent risk, and rating it off a 10-year number would describe a fund that
 * no longer exists in the form being scored.
 */
export function blendHorizons(
  percentilesByHorizon: Partial<Record<ScoringHorizon, Decimal | null | undefined>>,
): HorizonBlendResult {
  const available: ScoringHorizon[] = ([3, 5, 10] as const).filter((h) => {
    const v = percentilesByHorizon[h];
    return v !== null && v !== undefined;
  });

  if (available.length === 0) {
    return { value: null, weights: {}, reason: 'no_horizons' };
  }
  if (!available.includes(3)) {
    // `03 §3`: "< 3 ⇒ no rating (INSUFFICIENT_HISTORY)".
    return { value: null, weights: {}, reason: 'no_3y_history' };
  }

  const totalDeclared = available.reduce(
    (acc, h) => acc.plus(toDecimal(HORIZON_BASE_WEIGHTS[h])),
    new Decimal(0),
  );

  const weights: Partial<Record<ScoringHorizon, Decimal>> = {};
  let blended = new Decimal(0);
  for (const h of available) {
    const w = toDecimal(HORIZON_BASE_WEIGHTS[h]).dividedBy(totalDeclared);
    weights[h] = w;
    // Non-null by construction of `available`.
    blended = blended.plus(w.times(percentilesByHorizon[h] as Decimal));
  }

  return { value: blended, weights, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// 4. Pillar score (`03 §4`)
// ---------------------------------------------------------------------------

export interface PillarInputValue {
  metric: string;
  /** Declared weight from the model spec, out of 100 within the pillar. */
  weight: number;
  /** Blended percentile, or the raw 0-1 score for a `RAW_SCORE` metric. */
  percentile: Decimal | null;
  status: MfMetricStatus;
}

export interface PillarScoreResult {
  /** Weighted mean of the usable input percentiles, in [0,1]. Null when none were usable. */
  score: Decimal | null;
  /**
   * Applied weight per metric: fractions summing to 1 across the usable
   * inputs, and exactly 0 for the inputs that dropped out. This is what goes
   * into `MfPillarInput.weight` — the weight that *actually applied*, not the
   * one the model declared, because those differ the moment an input is
   * missing and publishing the declared one would misexplain the score.
   */
  appliedWeights: Record<string, Decimal>;
  usedMetrics: string[];
}

/**
 * Weighted mean of the input percentiles whose `status` is `OK`, with the
 * declared weights re-normalised across only those inputs.
 *
 * **Why re-normalise rather than treat a missing input as zero.** A fund whose
 * active share we could not compute is not a fund with zero active share;
 * scoring it as if it were would mark down every fund whose AMC discloses
 * holdings late, which is a data-pipeline fact masquerading as a quality
 * judgement. Re-normalisation says "we scored this pillar on what we could
 * see", and the applied weights returned here let the UI say exactly that.
 */
export function pillarScore(inputs: readonly PillarInputValue[]): PillarScoreResult {
  const appliedWeights: Record<string, Decimal> = {};
  for (const i of inputs) appliedWeights[i.metric] = new Decimal(0);

  const usable = inputs.filter((i) => i.status === 'OK' && i.percentile !== null);
  if (usable.length === 0) {
    return { score: null, appliedWeights, usedMetrics: [] };
  }

  const totalDeclared = usable.reduce((acc, i) => acc.plus(toDecimal(i.weight)), new Decimal(0));
  if (totalDeclared.isZero()) {
    // A pillar whose usable inputs all carry weight 0 conveys nothing. That is
    // the same situation as having no usable inputs, not a division by zero to
    // be papered over with a default.
    return { score: null, appliedWeights, usedMetrics: [] };
  }

  let score = new Decimal(0);
  for (const i of usable) {
    const w = toDecimal(i.weight).dividedBy(totalDeclared);
    appliedWeights[i.metric] = w;
    score = score.plus(w.times(i.percentile as Decimal));
  }

  return { score, appliedWeights, usedMetrics: usable.map((i) => i.metric) };
}

// ---------------------------------------------------------------------------
// 5. Composite (`03 §4`)
// ---------------------------------------------------------------------------

export interface PillarForComposite {
  key: string;
  /** Pillar score in [0,1], or null when the pillar had no usable input. */
  score: Decimal | null;
  /** Declared weight from the model spec, out of 100 within the model. */
  weight: number;
}

export interface CompositeResult {
  /** 0-100. Null when no pillar was scoreable. */
  composite: Decimal | null;
  /**
   * Post-redistribution weight per pillar: fractions summing to 1, and exactly
   * 0 for a null-score pillar. Feeds `MfPillarScore.weight`.
   */
  weights: Record<string, Decimal>;
}

/**
 * `Σ pillar.score × pillar.weight`, scaled to 0-100, with the weight of any
 * null-score pillar redistributed **proportionally** across the pillars that
 * survived (`03 §4`).
 *
 * Proportionally, not equally: if PORTFOLIO (weight 10) drops out of the
 * active-equity model, its 10 points go 30:20:20:15:5 to the pillars that
 * remain, preserving the model's stated view that performance matters six
 * times as much as the parent AMC. Splitting the orphaned weight equally would
 * quietly promote the 5-point PEOPLE_PARENT pillar to near-parity with
 * PERFORMANCE — a different methodology, arrived at by accident, on the funds
 * with the *worst* data coverage.
 */
export function composite(pillars: readonly PillarForComposite[]): CompositeResult {
  const weights: Record<string, Decimal> = {};
  for (const p of pillars) weights[p.key] = new Decimal(0);

  const usable = pillars.filter((p) => p.score !== null);
  if (usable.length === 0) {
    return { composite: null, weights };
  }

  const totalDeclared = usable.reduce((acc, p) => acc.plus(toDecimal(p.weight)), new Decimal(0));
  if (totalDeclared.isZero()) {
    return { composite: null, weights };
  }

  let onUnitScale = new Decimal(0);
  for (const p of usable) {
    const w = toDecimal(p.weight).dividedBy(totalDeclared);
    weights[p.key] = w;
    onUnitScale = onUnitScale.plus(w.times(p.score as Decimal));
  }

  const value = onUnitScale.times(100);

  // Invariant, asserted rather than trusted. Redistribution scales the weights
  // up, so a caller that passed a percentile outside [0,1] — a raw metric that
  // skipped `percentileRank`, say — would produce a composite outside 0-100
  // that the UI would render as a plausible-looking number rather than as an
  // error. Failing loudly here is the difference between a bug and a lie.
  if (value.lessThan(0) || value.greaterThan(100)) {
    throw new RangeError(
      `composite: produced ${value.toString()}, outside [0,100]. Pillar scores must be ` +
        'percentiles in [0,1]; a raw metric reached the composite unranked.',
    );
  }

  return { composite: value, weights };
}

// ---------------------------------------------------------------------------
// 8. Rating buckets (`03 §8`)
// ---------------------------------------------------------------------------

export type MfRating = 1 | 2 | 3 | 4 | 5;

/**
 * Cumulative cut-offs measured from the top of the universe, giving the
 * 10% / 22.5% / 35% / 22.5% / 10% Morningstar bell of `03 §8`.
 */
export const RATING_CUMULATIVE_CUTOFFS: readonly [number, number, number, number] = [
  0.1, 0.325, 0.675, 0.9,
];

/**
 * Rating by fixed distribution within the universe.
 *
 * **Ties go to the higher rating**, and the implementation gets that for free
 * by measuring "how many funds are *strictly* better than this one" rather
 * than this fund's ordinal position in a sorted list. A tie group therefore
 * inherits the position of its best member: if four funds tie exactly across
 * the 5/4 boundary, all four are 5s. The alternative — breaking the tie on
 * scheme code, or on whatever order the database happened to return — would
 * hand one fund an extra star over another on numbers identical to six decimal
 * places, which is not a judgement we could defend to the fund that lost.
 *
 * @param universeComposites every composite in the universe, INCLUDING the
 * subject's own. Returns null for an empty universe.
 */
export function ratingFromComposite(
  compositeValue: Decimal,
  universeComposites: readonly Decimal[],
): MfRating | null {
  const n = universeComposites.length;
  if (n === 0) return null;

  const strictlyBetter = universeComposites.filter((c) => c.greaterThan(compositeValue)).length;
  const fromTop = toDecimal(strictlyBetter).dividedBy(toDecimal(n));

  const [c5, c4, c3, c2] = RATING_CUMULATIVE_CUTOFFS;
  if (fromTop.lessThan(c5)) return 5;
  if (fromTop.lessThan(c4)) return 4;
  if (fromTop.lessThan(c3)) return 3;
  if (fromTop.lessThan(c2)) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Rating status gate (`00-README` invariant 2, `03 §1`, `03 §4`)
// ---------------------------------------------------------------------------

/** `03 §4`: "A rating requires PERFORMANCE and CONSISTENCY to be non-null". */
export const RATING_REQUIRED_PILLARS: readonly string[] = ['PERFORMANCE', 'CONSISTENCY'];

export interface RatingStatusInput {
  /** Months of usable NAV history. A genuine count, so a number. */
  historyMonths: number;
  /** Size of the peer universe the percentiles were computed against. */
  universeSize: number;
  /** Pillar scores keyed by pillar key. Only nullity is inspected. */
  pillars: Readonly<Record<string, { score: Decimal | null }>>;
}

/**
 * Decide whether a composite may be turned into a rating at all.
 *
 * Three independent gates, checked in the order the docs introduce them:
 *
 *  1. `historyMonths < MIN_RATING_HISTORY_MONTHS` — `00-README` invariant 2.
 *     Never interpolate a rating: a fund with 30 months of a rising market has
 *     a momentum reading, not a quality reading.
 *  2. `universeSize < MIN_UNIVERSE_SIZE` — `03 §1`. Metrics and percentiles
 *     are still published; only the peer-relative claim is withheld.
 *  3. `PERFORMANCE` or `CONSISTENCY` is null — `03 §4`. A composite assembled
 *     from cost and portfolio structure alone describes a fund's plumbing; the
 *     stars would be read as a judgement of its investing.
 *
 * Gate 3 applies only to models that *declare* those pillars. The `INDEX`
 * model has neither — a tracker's job is not to perform — and its TRACKING and
 * COST pillars carry the equivalent burden. That scoping is a reading of
 * `03 §4` (the paragraph sits under the ACTIVE_EQUITY heading) rather than
 * something the doc states outright.
 */
export function ratingStatusFor(input: RatingStatusInput): MfRatingStatus {
  const { historyMonths, universeSize, pillars } = input;

  if (historyMonths < MIN_RATING_HISTORY_MONTHS) return 'INSUFFICIENT_HISTORY';

  /**
   * The scheme's OWN gates are checked before the peer-group gate, and the
   * order is load-bearing rather than stylistic.
   *
   * `CATEGORY_TOO_SMALL` renders as "Unrated - only {n} peers in category"
   * (`06 §6`). That sentence is only true when this fund was otherwise
   * rateable and the peer group was the thing that failed. If its own
   * PERFORMANCE or CONSISTENCY pillar could not be scored, the fund is
   * unrateable on its own terms -- and because the rating pool is exactly the
   * set of schemes that cleared these same gates, a category where every fund
   * fails the pillar check collapses to a pool of zero and every one of them
   * would be told it has "only 0 peers".
   *
   * That is not a hypothetical: on the first real-data run 123 of 138 scores
   * came back CATEGORY_TOO_SMALL in categories holding six scored funds each,
   * because a 3-year window ending mid-month yields 35 monthly returns against
   * `MIN_RISK_ADJUSTED_OBSERVATIONS = 36`, nulling Sharpe and alpha and with
   * them the PERFORMANCE pillar. The peer count was a symptom; the message
   * pointed at the wrong cause and sent the reader looking for peers that were
   * already there.
   */
  for (const key of RATING_REQUIRED_PILLARS) {
    const pillar = pillars[key];
    if (pillar !== undefined && pillar.score === null) return 'INSUFFICIENT_HISTORY';
  }

  if (universeSize < MIN_UNIVERSE_SIZE) return 'CATEGORY_TOO_SMALL';

  return 'RATED';
}

// ---------------------------------------------------------------------------
// AMC qualitative score (`03 §4`)
// ---------------------------------------------------------------------------

/** Penalty per qualitative fact type, and the window inside which it applies. */
const AMC_QUALITATIVE_PENALTIES: Readonly<
  Record<string, { penalty: string; withinYears: number | null }>
> = Object.freeze({
  /**
   * `03 §4`: "−0.5 if within 3 years". A settled 2015 order says very little
   * about the AMC running the fund today, so the penalty ages out.
   */
  AMC_REGULATORY_ACTION: { penalty: '0.5', withinYears: 3 },
  /**
   * `03 §4` states no window for front-running. Read literally, the penalty
   * applies for as long as the fact itself is valid — which is what the fact
   * row's own `validTo` expresses. Flagged here because it is the one place
   * the two fact types are deliberately treated differently.
   */
  AMC_FRONT_RUNNING: { penalty: '0.5', withinYears: null },
});

export interface AmcQualitativeFact {
  factType: string;
  /** ISO date the fact became true. */
  validFrom: string;
  /** ISO date it stopped being true, or null/undefined if still in force. */
  validTo?: string | null;
}

/**
 * `amcQualitativeScore ∈ [0,1]`, a **raw** score rather than a percentile
 * (`03 §4`). Default 1.0; each applicable fact deducts 0.5.
 *
 * It is deliberately not ranked against peers. Percentiling it would mean that
 * in a category where every AMC is clean, half of them score below average on
 * governance — the ranking would manufacture a distinction out of a set of
 * identical, and identically good, facts.
 *
 * Penalties are applied **per fact, then clamped**, not deduped by type: an
 * AMC with three separate regulatory actions inside three years is worse than
 * one with a single order. The clamp is what keeps the arithmetic from going
 * negative and dragging the whole PEOPLE_PARENT pillar below the floor every
 * other input in it is bounded by.
 *
 * @param asOf the date the score is computed against. Required, never
 * defaulted to `new Date()`, because this module has no clock (`03 §9`: a
 * score must be reproducible from its inputs alone, forever).
 */
export function amcQualitativeScore(
  facts: readonly AmcQualitativeFact[],
  asOf: Date,
): Decimal {
  let score = new Decimal(1);

  for (const fact of facts) {
    const rule = AMC_QUALITATIVE_PENALTIES[fact.factType];
    if (rule === undefined) continue; // an unrelated fact type, not an error

    const from = new Date(fact.validFrom);
    if (Number.isNaN(from.getTime())) {
      throw new RangeError(
        `amcQualitativeScore: unparseable validFrom "${fact.validFrom}" on ${fact.factType}`,
      );
    }
    if (from.getTime() > asOf.getTime()) continue; // not yet in force at asOf

    if (fact.validTo !== null && fact.validTo !== undefined) {
      const to = new Date(fact.validTo);
      if (Number.isNaN(to.getTime())) {
        throw new RangeError(
          `amcQualitativeScore: unparseable validTo "${fact.validTo}" on ${fact.factType}`,
        );
      }
      if (to.getTime() < asOf.getTime()) continue; // already expired at asOf
    }

    if (rule.withinYears !== null) {
      const cutoff = new Date(asOf.getTime());
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - rule.withinYears);
      if (from.getTime() < cutoff.getTime()) continue; // older than the window
    }

    score = score.minus(new Decimal(rule.penalty));
  }

  // Clamp to [0,1]. Two penalties land exactly on 0; a third would go negative.
  if (score.lessThan(0)) return new Decimal(0);
  if (score.greaterThan(1)) return new Decimal(1);
  return score;
}
