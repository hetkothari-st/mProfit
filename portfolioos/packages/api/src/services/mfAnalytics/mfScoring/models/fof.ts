/**
 * `FOF` scoring model — `03-SCORING.md §2`.
 *
 * The doc gives one sentence: "ACTIVE_EQUITY model with cost pillar doubled —
 * FoFs have layered TERs." It does not say what happens to the other five
 * pillars, and the arithmetic has to be pinned down somewhere, so it is pinned
 * down here rather than left to the service:
 *
 *   COST: 15 → 30 (doubled, as stated).
 *   The remaining five pillars declared 85 points between them in
 *   `ACTIVE_EQUITY` and must now share 70, so each is scaled by 70/85 = 14/17
 *   and rounded to one decimal place. Proportional rescaling, not an equal
 *   haircut, for the same reason `composite()` redistributes proportionally:
 *   the doc's stated view that performance matters six times as much as the
 *   parent AMC survives the change, and only the cost/everything-else balance
 *   moves — which is the change the doc actually asked for.
 *
 *   | Pillar          | ACTIVE_EQUITY | × 14/17      | declared here |
 *   |-----------------|---------------|--------------|---------------|
 *   | PERFORMANCE     | 30            | 24.705882…   | 24.7          |
 *   | CONSISTENCY     | 20            | 16.470588…   | 16.5          |
 *   | DOWNSIDE        | 20            | 16.470588…   | 16.5          |
 *   | COST            | 15            | (doubled)    | 30            |
 *   | PORTFOLIO       | 10            |  8.235294…   |  8.2          |
 *   | PEOPLE_PARENT   |  5            |  4.117647…   |  4.1          |
 *   | **total**       | **100**       |              | **100.0**     |
 *
 * The rounding to one decimal happens to land on exactly 100.0 rather than
 * needing a plug figure, and the pillar-weight-sum test asserts that it stays
 * that way if anyone edits a row.
 *
 * Doubling the cost weight is not a stylistic preference. A fund-of-funds
 * charges its own TER on top of the TERs of everything it holds, and the
 * combined drag is routinely 2–3× a directly-held equivalent while being
 * invisible in the headline expense ratio. Weighting cost at 30 is the model
 * saying that for this structure, fees are the dominant, and most predictable,
 * determinant of what the holder actually keeps.
 */

import type { ScoringModel } from '../mfScoreMath.js';

export const FOF_MODEL: ScoringModel = Object.freeze({
  modelKey: 'FOF',
  // Distinct weights mean a distinct methodology version (`03 §9`); this is
  // not `score-active-equity-v1` with a footnote.
  methodologyVersion: 'score-fof-v1',
  pillars: Object.freeze([
    Object.freeze({
      key: 'PERFORMANCE',
      weight: 24.7,
      inputs: Object.freeze([
        Object.freeze({ metric: 'sortino', weight: 40 }),
        Object.freeze({ metric: 'informationRatio', weight: 30 }),
        Object.freeze({ metric: 'jensenAlphaAnn', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'CONSISTENCY',
      weight: 16.5,
      inputs: Object.freeze([
        Object.freeze({ metric: 'rollingBeatBenchPct', weight: 40 }),
        Object.freeze({ metric: 'rollingBeatCategoryPct', weight: 40 }),
        Object.freeze({ metric: 'quartileConsistency', weight: 20 }),
      ]),
    }),
    Object.freeze({
      key: 'DOWNSIDE',
      weight: 16.5,
      inputs: Object.freeze([
        Object.freeze({ metric: 'downCapture', weight: 40 }),
        Object.freeze({ metric: 'maxDrawdown', weight: 40 }),
        Object.freeze({ metric: 'worstCalendarYear', weight: 20 }),
      ]),
    }),
    Object.freeze({
      key: 'COST',
      weight: 30, // `03 §2`: doubled from ACTIVE_EQUITY's 15.
      inputs: Object.freeze([Object.freeze({ metric: 'terPercentile', weight: 100 })]),
    }),
    Object.freeze({
      key: 'PORTFOLIO',
      weight: 8.2,
      // Inputs are unchanged from ACTIVE_EQUITY on purpose. A FoF holds funds,
      // not securities, so `activeShare` and `styleDrift` are usually
      // unavailable and arrive with a non-OK status; `pillarScore` then
      // re-normalises onto whatever look-through data does exist. Dropping the
      // inputs from the model instead would make an overseas FoF that DOES
      // publish look-through holdings unscoreable on them.
      inputs: Object.freeze([
        Object.freeze({ metric: 'activeShare', weight: 40 }),
        Object.freeze({ metric: 'hhi', weight: 30 }),
        Object.freeze({ metric: 'styleDrift', weight: 30 }),
      ]),
    }),
    Object.freeze({
      key: 'PEOPLE_PARENT',
      weight: 4.1,
      inputs: Object.freeze([
        Object.freeze({ metric: 'managerTenureYears', weight: 40 }),
        Object.freeze({ metric: 'managerChangesLast3y', weight: 30 }),
        Object.freeze({ metric: 'amcQualitativeScore', weight: 30 }),
      ]),
    }),
  ]),
});
