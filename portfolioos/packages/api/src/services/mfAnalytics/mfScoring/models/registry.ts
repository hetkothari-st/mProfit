/**
 * `MfModelKey` → scoring model, and the barrel for `models/`.
 *
 * ⚠ **This file is the barrel on purpose.** `03 §2` names the passive model
 * `INDEX`, and every other model file here is named after its key — but a file
 * called `models/index.ts` is what Node and every bundler resolve
 * `from './models'` to. The passive model would then shadow the barrel, and
 * `import { MF_SCORING_MODELS } from './models'` would resolve to a model
 * object with no such export. The passive model therefore lives in
 * `indexFund.ts` and the barrel is named explicitly, so a reader of an import
 * line can tell which of the two they are getting.
 *
 * `packages/shared`'s `SEBI_SUBCATEGORY_MAP` already maps every sub-category to
 * one of these keys; this file closes the loop from the key to the weights.
 */

import type { MfModelKey } from '@portfolioos/shared';
import type { ScoringModel } from '../mfScoreMath.js';

import { ACTIVE_EQUITY_MODEL } from './activeEquity.js';
import { INDEX_MODEL } from './indexFund.js';
import { DEBT_DURATION_MODEL } from './debtDuration.js';
import { DEBT_ULTRA_SHORT_MODEL } from './debtUltraShort.js';
import { HYBRID_MODEL } from './hybrid.js';
import { FOF_MODEL } from './fof.js';

export {
  ACTIVE_EQUITY_MODEL,
  INDEX_MODEL,
  DEBT_DURATION_MODEL,
  DEBT_ULTRA_SHORT_MODEL,
  HYBRID_MODEL,
  FOF_MODEL,
};

/**
 * Every `MfModelKey` resolves to exactly one model. `Record` rather than
 * `Partial<Record>` so that adding a key to the union in `packages/shared`
 * without adding a model here is a compile error, not a runtime `undefined`
 * that would leave a whole category unscored.
 *
 * `SOLUTION` (Retirement and Children's funds) maps to the **same object** as
 * `HYBRID`, per `03 §2`: "SOLUTION (uses HYBRID model)". Those funds are
 * hybrids with a lock-in bolted on, and the lock-in changes the tax and exit
 * treatment, not what makes the portfolio good or bad. Sharing the object
 * rather than cloning it means a score row for a retirement fund correctly
 * records `methodologyVersion: 'score-hybrid-v1'` — the row's `modelKey` still
 * comes from the scheme's own category, so the two remain distinguishable in
 * the data without the methodology forking.
 */
export const MF_SCORING_MODELS: Readonly<Record<MfModelKey, ScoringModel>> = Object.freeze({
  ACTIVE_EQUITY: ACTIVE_EQUITY_MODEL,
  INDEX: INDEX_MODEL,
  DEBT_ULTRA_SHORT: DEBT_ULTRA_SHORT_MODEL,
  DEBT_DURATION: DEBT_DURATION_MODEL,
  HYBRID: HYBRID_MODEL,
  SOLUTION: HYBRID_MODEL,
  FOF: FOF_MODEL,
});

/** Lookup helper, so callers never index the record with a possibly-stale key. */
export function modelForKey(modelKey: MfModelKey): ScoringModel {
  const model = MF_SCORING_MODELS[modelKey];
  if (model === undefined) {
    throw new RangeError(`modelForKey: no scoring model registered for "${modelKey}"`);
  }
  return model;
}
