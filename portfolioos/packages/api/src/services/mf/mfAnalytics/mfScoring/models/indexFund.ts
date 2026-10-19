/**
 * `INDEX` scoring model — `03-SCORING.md §5`.
 *
 * ⚠ **Filename.** `03 §2` names this model `INDEX`, and the sibling files are
 * named after their model key. A file called `models/index.ts` would be read
 * by every bundler and by Node's own resolver as this directory's barrel, so
 * `import { INDEX_MODEL } from './models'` would resolve to the passive-fund
 * model instead of the registry, and adding a real barrel later would silently
 * shadow it. The model is therefore in `indexFund.ts` and the barrel is the
 * explicitly-named `registry.ts`.
 *
 * Alpha is meaningless for a tracker; the fund's job is to track cheaply, so
 * TRACKING and COST carry 80 of the 100 points between them.
 */

import type { ScoringModel } from '../mfScoreMath.js';

export const INDEX_MODEL: ScoringModel = Object.freeze({
  modelKey: 'INDEX',
  methodologyVersion: 'score-index-v1',
  pillars: Object.freeze([
    Object.freeze({
      key: 'TRACKING',
      weight: 45,
      // `03 §5` names two inputs but gives no split between them. 50/50 is the
      // least-assumption reading: tracking error (how noisily it tracks) and
      // tracking difference (how far it lands from index-minus-fee) are two
      // independent failures of the same mandate, and the doc singles out
      // neither. Revisit with a backtest before assuming one dominates.
      inputs: Object.freeze([
        // Blended 1y/3y 50/50 upstream, per `03 §5`; the blend happens in the
        // service, which is why only the metric name appears here.
        Object.freeze({ metric: 'trackingErrorAnn', weight: 50 }),
        // `03 §5`: |outperformanceAnn + TER|, i.e. distance from "index minus
        // own fee". Named distinctly from `outperformanceAnn` so the direction
        // table can be honest — see METRIC_DIRECTION.
        Object.freeze({ metric: 'trackingDifferenceAbs', weight: 50 }),
      ]),
    }),
    Object.freeze({
      key: 'COST',
      weight: 35,
      inputs: Object.freeze([Object.freeze({ metric: 'terPercentile', weight: 100 })]),
    }),
    Object.freeze({
      key: 'SCALE',
      weight: 15,
      // Liquidity proxy. No split given in `03 §5`; 50/50 for the same reason
      // as TRACKING.
      inputs: Object.freeze([
        Object.freeze({ metric: 'aumCategoryPercentile', weight: 50 }),
        Object.freeze({ metric: 'aumGrowth12mPct', weight: 50 }),
      ]),
    }),
    Object.freeze({
      key: 'STRUCTURE',
      weight: 5,
      // `03 §5` gives two alternatives depending on the vehicle: iNAV/bid-ask
      // deviation for an ETF, cash drag for an index fund. Both are listed
      // because exactly one of them will ever carry `status: OK` for a given
      // scheme, and the pillar's weight re-normalisation then does the
      // selection — no branching in the model file, and an ETF that happens to
      // disclose both is scored on both.
      inputs: Object.freeze([
        Object.freeze({ metric: 'inavDeviationAbs', weight: 50 }),
        Object.freeze({ metric: 'cashPct', weight: 50 }),
      ]),
    }),
  ]),
});
