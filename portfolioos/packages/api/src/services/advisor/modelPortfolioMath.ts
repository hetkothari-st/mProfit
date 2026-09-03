/**
 * Model-portfolio math: turning a risk category into target weights, and
 * checking that any set of weights is one the engine can safely reason with.
 *
 * Pure — no DB, no clock. The seeding path and the "adviser edited the model"
 * path both funnel through validateTargetWeights, so a saved
 * ModelPortfolioVersion can never contain a set of weights that would make
 * computeDrift produce nonsense.
 */

import { DEFAULT_TARGET_WEIGHTS } from './constants.js';
import {
  ADVISOR_ASSET_BUCKETS,
  type AdvisorAssetBucketValue,
  type AdvisorTargetFact,
} from './types.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';

/** Float tolerance on the 100% sum. Weights arrive as JSON numbers, so an
 *  adviser splitting a bucket into thirds must not be rejected for the last
 *  bit of binary representation error. */
const SUM_TOLERANCE_PP = 0.01;

const VALID_BUCKETS = new Set<string>(ADVISOR_ASSET_BUCKETS);

/**
 * The default target weights for a risk category, in canonical bucket order,
 * including the buckets targeted at zero. Zero-target buckets are emitted
 * deliberately: computeDrift needs them to report that a portfolio is 12%
 * crypto against a 0% target, which is a drift worth naming.
 */
export function targetsForCategory(category: RiskCategoryValue): AdvisorTargetFact[] {
  const weights = DEFAULT_TARGET_WEIGHTS[category];
  return ADVISOR_ASSET_BUCKETS.map((bucket) => ({
    bucket,
    targetPct: weights[bucket],
  }));
}

/**
 * Gate for any set of target weights before it is stored or used.
 *
 * Rejects: a sum that is not 100 (±0.01), negative or non-finite weights,
 * duplicate buckets, and unknown bucket names. Returns a reason rather than
 * throwing so callers can surface it to the adviser who typed it.
 */
export function validateTargetWeights(
  weights: AdvisorTargetFact[],
): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(weights) || weights.length === 0) {
    return { ok: false, reason: 'Target weights are empty.' };
  }

  const seen = new Set<AdvisorAssetBucketValue>();
  let sum = 0;

  for (const row of weights) {
    if (!row || typeof row.bucket !== 'string') {
      return { ok: false, reason: 'Target weight row is missing a bucket.' };
    }
    if (!VALID_BUCKETS.has(row.bucket)) {
      return { ok: false, reason: `Unknown asset bucket "${row.bucket}".` };
    }
    if (seen.has(row.bucket)) {
      return { ok: false, reason: `Duplicate asset bucket "${row.bucket}".` };
    }
    seen.add(row.bucket);

    if (typeof row.targetPct !== 'number' || !Number.isFinite(row.targetPct)) {
      return { ok: false, reason: `Target weight for "${row.bucket}" is not a finite number.` };
    }
    if (row.targetPct < 0) {
      return { ok: false, reason: `Target weight for "${row.bucket}" is negative.` };
    }
    sum += row.targetPct;
  }

  if (Math.abs(sum - 100) > SUM_TOLERANCE_PP) {
    return { ok: false, reason: `Target weights sum to ${sum}, not 100.` };
  }

  return { ok: true };
}
