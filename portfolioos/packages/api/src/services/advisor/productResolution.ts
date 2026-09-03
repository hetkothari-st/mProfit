/**
 * The single place a rule is allowed to name a product.
 *
 * Every rule that says "buy X" routes through resolveProduct, and resolveProduct
 * cannot return a product without also returning its provenance. That is the
 * whole point: provenance is not a field a rule author has to remember to fill
 * in, it is impossible to obtain the product without it. A recommendation whose
 * source cannot be shown is a recommendation that cannot be defended to the
 * person who acted on it, or to a regulator asking why.
 *
 * Precedence:
 *   1. The adviser-approved list for that bucket, whenever it is non-empty.
 *      A human's judgement always beats a NAV series.
 *   2. The top NAV-derived fallback candidate — past performance only (see
 *      fallbackRankingMath.ts), so callers must present it as lower-confidence.
 *   3. Nothing. Rules must handle null by emitting an amount-only instruction
 *      rather than inventing an instrument.
 *
 * Pure: no DB, no clock.
 */

import type {
  AdvisorAssetBucketValue,
  AdvisorFacts,
  AdvisorProductFact,
  DraftProvenance,
} from './types.js';

export function resolveProduct(
  bucket: AdvisorAssetBucketValue,
  facts: Pick<AdvisorFacts, 'approvedProducts' | 'fallbackRankings'>,
): { product: AdvisorProductFact; provenance: DraftProvenance } | null {
  const approved = firstUsable(facts?.approvedProducts?.[bucket]);
  if (approved) {
    const provenance: DraftProvenance = { kind: 'APPROVED_LIST' };
    // Only stamped when the adviser's row actually carries an id; an approved
    // entry without one is still adviser-chosen, and claiming an id we do not
    // have would be worse than omitting it.
    if (approved.approvedProductId) provenance.approvedProductId = approved.approvedProductId;
    return { product: approved, provenance };
  }

  const fallback = firstUsable(facts?.fallbackRankings?.[bucket]);
  if (fallback) {
    const provenance: DraftProvenance = {
      kind: 'FALLBACK_RANKING',
      candidateLabel: fallback.label,
    };
    if (fallback.score != null && Number.isFinite(fallback.score)) {
      provenance.score = fallback.score;
    }
    return { product: fallback, provenance };
  }

  return null;
}

/** Rank-ordered lists are taken in order; blank rows are skipped rather than
 *  returned, since a product with no label cannot be shown to anyone. */
function firstUsable(list: AdvisorProductFact[] | undefined): AdvisorProductFact | null {
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (entry && typeof entry.label === 'string' && entry.label.trim() !== '') return entry;
  }
  return null;
}
