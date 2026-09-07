/**
 * `HYBRID` scoring model — `03-SCORING.md §7`.
 *
 * `ACTIVE_EQUITY` pillars with `DOWNSIDE` raised to 25 and `PERFORMANCE`
 * lowered to 25. The rest are unchanged, and the six still sum to 100
 * (25 + 20 + 25 + 15 + 10 + 5). The shift is the point of the category: a
 * conservative hybrid or an equity-savings fund is bought to lose less, not to
 * win more, so drawdown behaviour is weighted as heavily as return.
 *
 * `03 §2` also routes `SOLUTION` (Retirement, Children's) through this model.
 * See `registry.ts`.
 */

import type { ScoringModel } from '../mfScoreMath.js';

export const HYBRID_MODEL: ScoringModel = Object.freeze({
  modelKey: 'HYBRID',
  methodologyVersion: 'score-hybrid-v1',
  pillars: Object.freeze([
    Object.freeze({
      key: 'PERFORMANCE',
      weight: 25, // §7: lowered from ACTIVE_EQUITY's 30.
      inputs: Object.freeze([
        Object.freeze({ metric: 'sortino', weight: 40 }),
        Object.freeze({ metric: 'informationRatio', weight: 30 }),
        Object.freeze({ metric: 'jensenAlphaAnn', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'CONSISTENCY',
      weight: 20,
      inputs: Object.freeze([
        Object.freeze({ metric: 'rollingBeatBenchPct', weight: 40 }),
        Object.freeze({ metric: 'rollingBeatCategoryPct', weight: 40 }),
        Object.freeze({ metric: 'quartileConsistency', weight: 20 }),
      ]),
    }),
    Object.freeze({
      key: 'DOWNSIDE',
      weight: 25, // §7: raised from ACTIVE_EQUITY's 20.
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
      // §7 adds `equityAllocationDrift` (inverse) to this pillar but gives no
      // new split. `equityAllocationDrift` takes 25 — for a hybrid, whether the
      // equity share actually sits inside the sub-category band is the single
      // most consequential portfolio fact, since it is what the investor picked
      // the category for — and the doc's original 40/30/30 is rescaled by 75%
      // onto the remaining 75 points, which preserves the stated ratios between
      // the three exactly (30 : 22.5 : 22.5 is 40 : 30 : 30).
      inputs: Object.freeze([
        Object.freeze({ metric: 'activeShare', weight: 30 }),
        Object.freeze({ metric: 'hhi', weight: 22.5 }),
        Object.freeze({ metric: 'styleDrift', weight: 22.5 }),
        Object.freeze({ metric: 'equityAllocationDrift', weight: 25 }),
      ]),
    }),
    Object.freeze({
      key: 'PEOPLE_PARENT',
      weight: 5,
      inputs: Object.freeze([
        Object.freeze({ metric: 'managerTenureYears', weight: 40 }),
        Object.freeze({ metric: 'managerChangesLast3y', weight: 30 }),
        Object.freeze({ metric: 'amcQualitativeScore', weight: 30 }),
      ]),
    }),
  ]),
});
