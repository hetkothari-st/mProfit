/**
 * `ACTIVE_EQUITY` scoring model — `03-SCORING.md §4`.
 *
 * Data only. Every model file in this directory is a transcription of a weight
 * table from the doc and contains no arithmetic, because `03 §9` requires a
 * methodology change to be diffable: a reviewer comparing `score-active-equity-v1`
 * with `-v2` should see a changed number, never a changed algorithm hidden
 * inside a model.
 *
 * Any edit to a weight, an input, or the pillar set **bumps
 * `methodologyVersion`** and adds an entry to
 * `docs/mf-analytics/METHODOLOGY-CHANGELOG.md`. Editing in place would silently
 * re-score every historical row that claims to have been produced by v1.
 */

import type { ScoringModel } from '../mfScoreMath.js';

export const ACTIVE_EQUITY_MODEL: ScoringModel = Object.freeze({
  modelKey: 'ACTIVE_EQUITY',
  methodologyVersion: 'score-active-equity-v1',
  pillars: Object.freeze([
    Object.freeze({
      key: 'PERFORMANCE',
      weight: 30,
      inputs: Object.freeze([
        // Sortino leads because an equity fund's downside deviation is what the
        // holder actually experiences; Sharpe would penalise upside volatility
        // equally, which is not a risk anyone is asking to be protected from.
        Object.freeze({ metric: 'sortino', weight: 40 }),
        Object.freeze({ metric: 'informationRatio', weight: 30 }),
        Object.freeze({ metric: 'jensenAlphaAnn', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'CONSISTENCY',
      weight: 20,
      inputs: Object.freeze([
        // `03 §4` pins these two to the 3y rolling window specifically.
        Object.freeze({ metric: 'rollingBeatBenchPct', weight: 40 }),
        Object.freeze({ metric: 'rollingBeatCategoryPct', weight: 40 }),
        Object.freeze({ metric: 'quartileConsistency', weight: 20 }),
      ]),
    }),
    Object.freeze({
      key: 'DOWNSIDE',
      weight: 20,
      inputs: Object.freeze([
        Object.freeze({ metric: 'downCapture', weight: 40 }),
        Object.freeze({ metric: 'maxDrawdown', weight: 40 }),
        Object.freeze({ metric: 'worstCalendarYear', weight: 20 }),
      ]),
    }),
    Object.freeze({
      key: 'COST',
      weight: 15,
      inputs: Object.freeze([Object.freeze({ metric: 'terPercentile', weight: 100 })]),
    }),
    Object.freeze({
      key: 'PORTFOLIO',
      weight: 10,
      // `hhi` and `styleDrift` are marked "(inverse)" in the doc; that is
      // expressed once, in `METRIC_DIRECTION`, rather than as a flag here — a
      // model file that could invert a metric locally would let two models
      // disagree about which way a number points.
      inputs: Object.freeze([
        Object.freeze({ metric: 'activeShare', weight: 40 }),
        Object.freeze({ metric: 'hhi', weight: 30 }),
        Object.freeze({ metric: 'styleDrift', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'PEOPLE_PARENT',
      weight: 5,
      inputs: Object.freeze([
        Object.freeze({ metric: 'managerTenureYears', weight: 40 }),
        Object.freeze({ metric: 'managerChangesLast3y', weight: 30 }),
        // Raw 0-1 score, not a percentile (`03 §4`). See `amcQualitativeScore`.
        Object.freeze({ metric: 'amcQualitativeScore', weight: 30 }),
      ]),
    }),
  ]),
});
