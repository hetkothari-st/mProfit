/**
 * REGULAR_TO_DIRECT — the same fund's direct plan charges less every year.
 * One recommendation per regular-plan holding whose direct plan is cheaper by
 * at least ₹500 a year on today's value. Only the sell leg is an instruction:
 * the destination is the same scheme's direct plan, named in the reasons.
 */
import { CATEGORY_BASE_PRIORITY, DIRECT_SWITCH_MIN_GAIN_INR } from '../constants.js';
import { addDays, dec, inr, money2, promise, inrWhole } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const regularToDirectRule: AdvisorRule = {
  id: 'REGULAR_TO_DIRECT',
  version: 1,
  needs: ['regularPlans'],
  description: "Switches a regular-plan fund to the same fund's cheaper direct plan.",

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x) return [];
    const out: RecommendationDraft[] = [];
    for (const p of x.regularPlans) {
      const gapPct = p.regularTerPct - p.directTerPct;
      const gain = p.valueInr.times(gapPct).dividedBy(100);
      if (gapPct <= 0 || gain.lessThan(DIRECT_SWITCH_MIN_GAIN_INR)) continue;
      const rationale =
        `${p.schemeName} (${inr(p.valueInr)}) is on the regular plan, which charges ${p.regularTerPct.toFixed(2)}% a year. ` +
        `${p.directName} is the same fund at ${p.directTerPct.toFixed(2)}%: about ${inr(gain)} a year that stays in your fund. ` +
        'Switching is a sale and a purchase, so check the exit load and the capital gains tax on units held under a year before you switch.';
      out.push({
        ruleId: regularToDirectRule.id,
        ruleVersion: regularToDirectRule.version,
        category: 'REGULAR_TO_DIRECT',
        priority: CATEGORY_BASE_PRIORITY.REGULAR_TO_DIRECT,
        action: [{
          direction: 'SELL', bucket: p.bucket, portfolioId: p.portfolioId, instrumentName: p.schemeName, fundId: p.fundId,
          stockId: null, isin: null, holdingKey: p.holdingKey, units: null, amountInr: money2(p.valueInr),
        }],
        rationale,
        inputsUsed: {
          asOf: facts.asOf.toISOString(), holdingKey: p.holdingKey, valueInr: dec(p.valueInr),
          regularTerPct: p.regularTerPct, directTerPct: p.directTerPct, directSchemeCode: p.directSchemeCode,
        },
        provenance: { kind: 'NONE' },
        dedupeKey: `REGULAR_TO_DIRECT:${p.holdingKey}`,
        headline: `Switch ${p.schemeName} to its direct plan and keep ${inrWhole(gain)} a year`,
        promise: promise({ gainInr: money2(gain), riskBand: 'LOW', costInr: null, liquidity: null }),
        measurement: {
          method: 'DIRECT_VS_REGULAR',
          horizonDays: 365,
          baseline: { valueInr: money2(p.valueInr), regularFundId: p.fundId, directFundId: p.directFundId, regularTerPct: p.regularTerPct, directTerPct: p.directTerPct, holdingKey: p.holdingKey },
        },
        expiresAt: addDays(facts.asOf, 60),
        urgentUntil: null,
      });
    }
    return out;
  },
};

export default regularToDirectRule;
