/**
 * Turning metrics into a rank.
 *
 * Two models, because the two kinds of fund are bought for opposite reasons.
 *
 * PASSIVE (index funds, ETFs) — cost and fidelity only. An index fund's job is
 * to deliver its index minus as little as possible, so the only questions are
 * what it charges, how far it drifts, how erratically it drifts, and whether
 * it is large enough to keep doing so. PAST RETURNS ARE NOT A FACTOR: a
 * tracker that beat its index failed at its job in a way that will reverse.
 *
 * ACTIVE — consistency of rolling outperformance, downside protection,
 * risk-adjusted return, cost, and manager tenure. Weighted towards *how often*
 * it beat its peers rather than *by how much*, because the size of a win is
 * mostly luck and its frequency is mostly process.
 *
 * TRAILING ONE-YEAR RETURN IS NEVER A FACTOR IN EITHER MODEL. It is the number
 * every fund advertisement leads with and the one with the least predictive
 * power; ranking on it would recommend whatever was hottest last year, to
 * people who then buy at the top.
 *
 * Scores are percentiles WITHIN the bucket, not raw values. A 0.4% tracking
 * difference means nothing in isolation; being the third-best tracker of
 * fourteen means something. Percentiles also make the components commensurable
 * without inventing exchange rates between basis points and Sortino units.
 *
 * Pure: no DB, no clock.
 */

import type {
  DataGap,
  FundMetrics,
  FundScore,
  MethodologyConfig,
  ScoreComponent,
} from './types.js';
import type { AdvisorAssetBucketValue } from '../types.js';

/** One fund's inputs to the bucket-wide scoring pass. */
export interface ScoringInput {
  schemeCode: string;
  metrics: FundMetrics;
  passive: boolean;
  terPct: number | null;
  aumInr: number | null;
  managerTenureYears: number | null;
  /**
   * How the last TER refresh resolved this scheme. Carried into the gap
   * reason so "no TER" can say WHY: AMFI's file has no scheme code and no
   * ISIN, so a fund can be missing a TER because the file omitted it, or
   * because its name turned out not to identify one scheme. Those are
   * different problems and a single `ter_unavailable` hides the difference.
   */
  terJoinStatus?: string | null;
}

/** Which way is "good" for each metric. */
const HIGHER_IS_BETTER: Record<string, boolean> = {
  rollingOutperformanceConsistency: true,
  downsideCapture: false, // capturing less of the fall is better
  sortino: true,
  ter: false, // cheaper is better
  managerTenure: true,
  trackingDifference: false, // |difference| nearer zero is better; see below
  trackingError: false,
  aum: true,
};

function rawValue(input: ScoringInput, metric: string): number | null {
  const m = input.metrics;
  switch (metric) {
    case 'rollingOutperformanceConsistency':
      return m.outperformanceConsistencyPct;
    case 'downsideCapture':
      return m.downsideCapturePct;
    case 'sortino':
      return m.sortino;
    case 'ter':
      return input.terPct;
    case 'managerTenure':
      return input.managerTenureYears;
    // Drift in either direction is a tracking failure, so the magnitude is
    // what gets ranked. A fund "beating" its index by 2% is not a bargain.
    case 'trackingDifference':
      return m.trackingDifferencePct == null ? null : Math.abs(m.trackingDifferencePct);
    case 'trackingError':
      return m.trackingErrorPct;
    case 'aum':
      return input.aumInr;
    default:
      return null;
  }
}

function gapReason(metric: string, input?: ScoringInput): string {
  switch (metric) {
    case 'ter':
      // The join refused to guess, and says so rather than reporting the same
      // gap it would report for a blank cell.
      if (input?.terJoinStatus === 'UNMATCHED') return 'ter_unmatched';
      // Our mapping gap rather than AMFI's omission: the AMC is not in the
      // committed brand map, so no TER row could be attributed to it.
      if (input?.terJoinStatus === 'UNMAPPED_AMC') return 'ter_unmapped_amc';
      if (input?.terJoinStatus === 'AMBIGUOUS') return 'ter_unmatched_ambiguous_name';
      return 'ter_unavailable';
    case 'aum':
      return 'aum_unavailable';
    case 'managerTenure':
      return 'manager_tenure_unavailable';
    case 'trackingDifference':
    case 'trackingError':
      return 'insufficient_history_for_tracking';
    case 'downsideCapture':
      return 'insufficient_overlapping_history';
    default:
      return 'metric_unavailable';
  }
}

/**
 * Percentile of `value` within `population`, 0–100, oriented so higher is
 * always better. Ties share the same percentile, so two identical trackers
 * cannot be separated by an accident of sort order.
 */
export function percentileOf(value: number, population: number[], higherIsBetter: boolean): number {
  const clean = population.filter((v) => Number.isFinite(v));
  if (clean.length <= 1) return 50;
  const better = clean.filter((v) => (higherIsBetter ? v < value : v > value)).length;
  const equal = clean.filter((v) => v === value).length;
  // Mid-rank for ties: the average of the range they jointly occupy.
  return ((better + (equal - 1) / 2) / (clean.length - 1)) * 100;
}

/**
 * Score every fund in one bucket together.
 *
 * Bucket-wide rather than per-fund because a percentile needs a population —
 * this function IS the population.
 */
export function scoreBucket(
  inputs: ScoringInput[],
  bucket: AdvisorAssetBucketValue,
  config: MethodologyConfig,
): FundScore[] {
  // Passive and active funds are ranked against their own kind: a tracker's
  // 0.2% tracking error is not comparable to an active fund's Sortino, and
  // percentile-ing them together would rank apples against oranges.
  const passivePopulation = inputs.filter((i) => i.passive);
  const activePopulation = inputs.filter((i) => !i.passive);

  return inputs.map((input) => {
    const weights = input.passive ? config.scoringPassive : config.scoringActive;
    const population = input.passive ? passivePopulation : activePopulation;

    const components: ScoreComponent[] = [];
    const dataGaps: DataGap[] = [];

    for (const [metric, weight] of Object.entries(weights)) {
      const value = rawValue(input, metric);
      if (value == null || !Number.isFinite(value)) {
        dataGaps.push({ metric, reason: gapReason(metric, input), weightReleased: weight });
        continue;
      }
      const values = population
        .map((p) => rawValue(p, metric))
        .filter((v): v is number => v != null && Number.isFinite(v));
      components.push({
        metric,
        raw: round4(value),
        percentile: round4(percentileOf(value, values, HIGHER_IS_BETTER[metric] ?? true)),
        weight,
      });
    }

    // Redistribute the released weight across what survived, in proportion to
    // the weights they already carried. A missing TER must not become a zero
    // score — that would rank an unknown fund below a known-expensive one.
    const survivingWeight = components.reduce((sum, c) => sum + c.weight, 0);
    const score =
      survivingWeight > 0
        ? round4(
            components.reduce((sum, c) => sum + c.percentile * (c.weight / survivingWeight), 0),
          )
        : null;

    return {
      schemeCode: input.schemeCode,
      bucket,
      score,
      components,
      dataGaps,
      model: input.passive ? 'PASSIVE' : 'ACTIVE',
    };
  });
}

/** Rank within the bucket, best first. Unscoreable funds rank last and keep a
 *  null rank rather than being silently dropped — "why was this not ranked?"
 *  is a question the snapshot has to answer. */
export function rankBucket(scores: FundScore[]): Array<FundScore & { rankInBucket: number | null }> {
  const scored = scores
    .filter((s) => s.score != null)
    .sort((a, b) => {
      const diff = (b.score ?? 0) - (a.score ?? 0);
      // Deterministic tie-break, so two runs on identical data rank identically.
      return diff !== 0 ? diff : a.schemeCode.localeCompare(b.schemeCode);
    });

  const rankByScheme = new Map<string, number>();
  scored.forEach((s, i) => rankByScheme.set(s.schemeCode, i + 1));

  return scores.map((s) => ({ ...s, rankInBucket: rankByScheme.get(s.schemeCode) ?? null }));
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
