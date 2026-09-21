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
 *      A human's explicit judgement always beats an algorithm — the list is an
 *      OVERRIDE, and an empty list means "no override", not "no opinion".
 *   2. The ranked universe: the signed-off methodology's picks, narrowed to
 *      this client by selectFund (held funds, overlap, AMC cap, hysteresis).
 *      This is where named funds normally come from.
 *   3. The legacy NAV-derived fallback — past performance only (see
 *      fallbackRankingMath.ts), for buckets the methodology cannot rank.
 *   4. Nothing. Rules must handle null by emitting an amount-only instruction
 *      rather than inventing an instrument.
 *
 * Pure: no DB, no clock.
 */

import { selectFund } from './fundRanking/selection.js';
import type { SelectionConfig } from './fundRanking/types.js';
import type {
  AdvisorAssetBucketValue,
  AdvisorFacts,
  AdvisorProductFact,
  DraftProvenance,
} from './types.js';

type ResolutionFacts = Pick<
  AdvisorFacts,
  'approvedProducts' | 'fallbackRankings' | 'fundRanking' | 'valueByAmc' | 'totalPortfolioValue' | 'holdings'
>;

export function resolveProduct(
  bucket: AdvisorAssetBucketValue,
  facts: ResolutionFacts,
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

  const ranked = resolveFromRankedUniverse(bucket, facts);
  if (ranked) return ranked;

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

/**
 * The methodology's pick for this bucket, narrowed to this client.
 *
 * Returns null when any gate is shut (flag, signature, snapshot freshness,
 * risk profile) — `facts.fundRanking.available` carries that decision, made
 * once in the facts builder, so every rule sees the same answer.
 */
function resolveFromRankedUniverse(
  bucket: AdvisorAssetBucketValue,
  facts: ResolutionFacts,
): { product: AdvisorProductFact; provenance: DraftProvenance } | null {
  const ranking = facts?.fundRanking;
  if (!ranking?.available) return null;

  const candidates = ranking.candidates?.[bucket] ?? [];
  if (candidates.length === 0) return null;

  const heldSchemeCodes = (facts.holdings ?? [])
    .filter((h) => h.bucket === bucket && h.fundId)
    .map((h) => candidates.find((c) => c.fundId === h.fundId)?.schemeCode)
    .filter((code): code is string => code != null);

  const incumbent = ranking.incumbents?.[bucket] ?? { schemeCode: null, challengerStreak: 0 };

  const result = selectFund(
    candidates,
    {
      heldSchemeCodes,
      valueByAmc: facts.valueByAmc ?? {},
      totalPortfolioValue: facts.totalPortfolioValue,
      incumbentSchemeCode: incumbent.schemeCode,
      challengerStreak: incumbent.challengerStreak,
    },
    ranking.selectionConfig ?? SELECTION_DEFAULTS,
  );

  if (!result.chosen) return null;
  const chosen = result.chosen;
  const chosenFact = candidates.find((c) => c.schemeCode === chosen.schemeCode);

  const provenance: DraftProvenance = {
    kind: 'RANKED_UNIVERSE',
    candidateLabel: chosen.schemeName,
    score: chosen.score,
    namedSchemeCode: chosen.schemeCode,
    selectionEvidence: {
      score: chosen.score,
      rankInBucket: chosen.rankInBucket,
      metrics: chosenFact?.metrics ?? {},
      dataGaps: chosenFact?.dataGaps ?? [],
      runnerUp: result.runnerUp
        ? {
            schemeCode: result.runnerUp.schemeCode,
            schemeName: result.runnerUp.schemeName,
            score: result.runnerUp.score,
            rankInBucket: result.runnerUp.rankInBucket,
            whyItLost: result.runnerUpReason,
          }
        : null,
      adjustments: result.adjustments,
      hysteresisHeldIncumbent: result.adjustments.some((a) => a.kind === 'HYSTERESIS_HOLD'),
      methodologyVersion: ranking.methodologyVersion,
      asOfDate: ranking.asOfDate ? ranking.asOfDate.toISOString().slice(0, 10) : null,
    },
  };
  if (ranking.methodologyVersionId) provenance.methodologyVersionId = ranking.methodologyVersionId;

  return {
    product: {
      approvedProductId: null,
      fundId: chosen.fundId,
      stockId: null,
      label: chosen.schemeName,
      score: chosen.score,
    },
    provenance,
  };
}

/**
 * Selection parameters used when the facts do not carry the methodology's own.
 *
 * These mirror the v1 config seeded in the migration. They exist so that a
 * rule can still select if a caller hands it facts assembled without the
 * config blob — and they are deliberately the same numbers, so a divergence
 * would be a bug rather than a second opinion.
 */
const SELECTION_DEFAULTS: SelectionConfig = {
  incumbentRankBand: 5,
  hysteresisMarginPct: 5,
  hysteresisSnapshots: 3,
  maxAmcSharePct: 40,
  overlapPenaltyPerPct: 0.5,
  maxOverlapPct: 40,
};

/** Rank-ordered lists are taken in order; blank rows are skipped rather than
 *  returned, since a product with no label cannot be shown to anyone. */
function firstUsable(list: AdvisorProductFact[] | undefined): AdvisorProductFact | null {
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (entry && typeof entry.label === 'string' && entry.label.trim() !== '') return entry;
  }
  return null;
}
