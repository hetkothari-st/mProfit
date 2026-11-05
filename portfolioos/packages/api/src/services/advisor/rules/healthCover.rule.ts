/**
 * HEALTH_COVER — recorded health cover under ₹10 lakh. Only when a health
 * policy is recorded: without one we cannot tell "no cover" from "employer
 * cover not entered". Not measured: cover has no price series.
 */
import { CATEGORY_BASE_PRIORITY, HEALTH_COVER_FLOOR_INR } from '../constants.js';
import { addDays, dec, inr, notMeasured, promise, inrWhole } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const healthCoverRule: AdvisorRule = {
  id: 'HEALTH_COVER',
  version: 1,
  description: 'Raises health cover that is under ₹10 lakh.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const h = facts?.extra?.healthCover;
    if (!h || h.policies === 0 || h.sumInsured.greaterThanOrEqualTo(HEALTH_COVER_FLOOR_INR)) return [];
    const rationale =
      `Your recorded health cover adds up to ${inr(h.sumInsured)}. A single hospital stay in a big Indian city often costs more than that, ` +
      `so ${inr(HEALTH_COVER_FLOOR_INR)} is a sensible floor. A super top-up on your existing policy is usually the cheapest way to get there.`;
    return [{
      ruleId: healthCoverRule.id,
      ruleVersion: healthCoverRule.version,
      category: 'HEALTH_COVER',
      priority: CATEGORY_BASE_PRIORITY.HEALTH_COVER,
      action: [],
      rationale,
      inputsUsed: { asOf: facts.asOf.toISOString(), sumInsured: dec(h.sumInsured), policies: h.policies, floorInr: dec(HEALTH_COVER_FLOOR_INR) },
      provenance: { kind: 'NONE' },
      dedupeKey: 'HEALTH_COVER:floor',
      headline: `Your health cover of ${inrWhole(h.sumInsured)} may not be enough`,
      promise: promise({ riskBand: 'LOW' }),
      measurement: notMeasured(),
      expiresAt: addDays(facts.asOf, 90),
      urgentUntil: null,
    }];
  },
};

export default healthCoverRule;
