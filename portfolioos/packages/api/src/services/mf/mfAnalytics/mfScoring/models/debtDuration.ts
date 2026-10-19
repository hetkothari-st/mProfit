/**
 * `DEBT_DURATION` scoring model — `03-SCORING.md §6`.
 *
 * Pillar weights 25 / 25 / 15 / 15 / 15 / 5 are transcribed from the doc. The
 * input splits inside each pillar are not given there; the choices and the
 * reasoning for each are commented at the pillar.
 */

import type { ScoringModel } from '../mfScoreMath.js';

export const DEBT_DURATION_MODEL: ScoringModel = Object.freeze({
  modelKey: 'DEBT_DURATION',
  methodologyVersion: 'score-debt-duration-v1',
  pillars: Object.freeze([
    Object.freeze({
      key: 'PERFORMANCE',
      weight: 25,
      // Two inputs, no split in `03 §6`. 50/50.
      inputs: Object.freeze([
        Object.freeze({ metric: 'sharpe', weight: 50 }),
        // Higher-is-better here, unlike the INDEX model's tracking difference —
        // a debt fund IS trying to beat its benchmark.
        Object.freeze({ metric: 'outperformanceAnn', weight: 50 }),
      ]),
    }),
    Object.freeze({
      key: 'CREDIT_QUALITY',
      weight: 25,
      // `03 §6` lists three inputs and no split. 40/30/30 mirrors the shape the
      // doc uses for every other three-input pillar (`§4` PORTFOLIO and
      // PEOPLE_PARENT), with the largest share on the headline credit metric:
      // sub-AA exposure is what actually defaults, and the 2018 IL&FS and 2020
      // Franklin episodes were both visible in it first.
      inputs: Object.freeze([
        Object.freeze({ metric: 'belowAAPct', weight: 40 }),
        Object.freeze({ metric: 'topIssuerPct', weight: 30 }),
        // `03 §6`'s `creditQualitySplit.sov + aaa`, summed upstream.
        Object.freeze({ metric: 'sovAaaPct', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'CONSISTENCY',
      weight: 15,
      // `03 §6` pins `rollingBeatBenchPct` to the 1y window for debt.
      inputs: Object.freeze([
        Object.freeze({ metric: 'rollingBeatBenchPct', weight: 50 }),
        Object.freeze({ metric: 'pctNegativeMonths', weight: 50 }),
      ]),
    }),
    Object.freeze({
      key: 'DOWNSIDE',
      weight: 15,
      inputs: Object.freeze([
        Object.freeze({ metric: 'maxDrawdown', weight: 50 }),
        Object.freeze({ metric: 'worstMonth', weight: 50 }),
      ]),
    }),
    Object.freeze({
      key: 'COST',
      weight: 15,
      inputs: Object.freeze([Object.freeze({ metric: 'terPercentile', weight: 100 })]),
    }),
    Object.freeze({
      key: 'MANDATE_FIT',
      weight: 5,
      // Binary 1/0 raw score: is modified duration inside the SEBI band for
      // this sub-category? A percentile would rank compliant funds against one
      // another, and compliance is not a spectrum.
      inputs: Object.freeze([Object.freeze({ metric: 'modifiedDurationInBand', weight: 100 })]),
    }),
  ]),
});
