/**
 * `DEBT_ULTRA_SHORT` scoring model — `03-SCORING.md §6`, final paragraph.
 *
 * "Same pillars, weights 15 / 35 / 15 / 15 / 15 / 5 — credit matters more,
 * return dispersion is tiny." An overnight or liquid fund's 1-year returns sit
 * inside a ~40bp band across the whole category, so ranking on them is ranking
 * on noise; what actually distinguishes these funds is what they lent to. The
 * doubled CREDIT_QUALITY weight and the halved PERFORMANCE weight say exactly
 * that.
 *
 * The pillar *set* and the input splits are identical to `debtDuration.ts` by
 * design. They are restated here in full rather than spread-imported from it,
 * because a model file is the auditable artefact behind a published score:
 * a reviewer reading `score-debt-ultra-short-v1` should see every weight that
 * produced the number, not a diff against another file that may itself have
 * moved since.
 */

import type { ScoringModel } from '../mfScoreMath.js';

export const DEBT_ULTRA_SHORT_MODEL: ScoringModel = Object.freeze({
  modelKey: 'DEBT_ULTRA_SHORT',
  methodologyVersion: 'score-debt-ultra-short-v1',
  pillars: Object.freeze([
    Object.freeze({
      key: 'PERFORMANCE',
      weight: 15,
      inputs: Object.freeze([
        Object.freeze({ metric: 'sharpe', weight: 50 }),
        Object.freeze({ metric: 'outperformanceAnn', weight: 50 }),
      ]),
    }),
    Object.freeze({
      key: 'CREDIT_QUALITY',
      weight: 35,
      inputs: Object.freeze([
        Object.freeze({ metric: 'belowAAPct', weight: 40 }),
        Object.freeze({ metric: 'topIssuerPct', weight: 30 }),
        Object.freeze({ metric: 'sovAaaPct', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'CONSISTENCY',
      weight: 15,
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
      inputs: Object.freeze([Object.freeze({ metric: 'modifiedDurationInBand', weight: 100 })]),
    }),
  ]),
});
