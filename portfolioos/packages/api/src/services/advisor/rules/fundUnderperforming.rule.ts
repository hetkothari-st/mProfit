/**
 * FUND_UNDERPERFORMING — a fund the fund analysis flagged critically with
 * high confidence. The sell is the instruction; the replacement is named only
 * when the product resolution (signed methodology / approved list) gives one.
 */
import { CATEGORY_BASE_PRIORITY } from '../constants.js';
import { resolveProduct } from '../productResolution.js';
import { addDays, dec, inr, money2, promise } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft, TradeAction } from '../types.js';

export const fundUnderperformingRule: AdvisorRule = {
  id: 'FUND_UNDERPERFORMING',
  version: 1,
  needs: ['weakFunds'],
  description: 'Moves out of a fund the fund analysis flags critically with high confidence.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x) return [];
    const out: RecommendationDraft[] = [];
    for (const w of x.weakFunds) {
      const resolved = resolveProduct(w.bucket, facts);
      const action: TradeAction[] = [{
        direction: 'SELL', bucket: w.bucket, portfolioId: null, instrumentName: w.schemeName, fundId: null,
        stockId: null, isin: null, holdingKey: w.holdingKey, units: null, amountInr: money2(w.valueInr),
      }];
      if (resolved) {
        action.push({
          direction: 'BUY', bucket: w.bucket, portfolioId: facts.defaultPortfolioId, instrumentName: resolved.product.label,
          fundId: resolved.product.fundId, stockId: resolved.product.stockId, isin: null, holdingKey: null, units: null, amountInr: money2(w.valueInr),
        });
      }
      const destination = resolved ? `Move the ${inr(w.valueInr)} into ${resolved.product.label}.` : 'Move it to a better fund in the same category; see the fund analysis for alternatives.';
      const rationale =
        `${w.schemeName} (${inr(w.valueInr)}): ${w.headline}. Our fund analysis rates this with ${Math.round(w.confidence * 100)}% confidence. ` +
        `${destination} Check the exit load and the capital gains tax before you switch.`;
      out.push({
        ruleId: fundUnderperformingRule.id,
        ruleVersion: fundUnderperformingRule.version,
        category: 'FUND_UNDERPERFORMING',
        priority: CATEGORY_BASE_PRIORITY.FUND_UNDERPERFORMING,
        action,
        rationale,
        inputsUsed: { asOf: facts.asOf.toISOString(), holdingKey: w.holdingKey, schemeCode: w.schemeCode, valueInr: dec(w.valueInr), findingCode: w.findingCode, confidence: w.confidence },
        provenance: resolved ? resolved.provenance : { kind: 'NONE' },
        dedupeKey: `FUND_UNDERPERFORMING:${w.holdingKey}`,
        headline: `${w.schemeName} keeps lagging. Time to move on.`,
        promise: promise({ riskBand: 'MEDIUM', confidence: w.confidence >= 0.9 ? 'HIGH' : 'MEDIUM' }),
        measurement: {
          method: 'FUND_VS_ALT',
          horizonDays: 365,
          baseline: { heldSchemeCode: w.schemeCode, altFundId: resolved?.product.fundId ?? null, valueInr: money2(w.valueInr), holdingKey: w.holdingKey },
        },
        expiresAt: addDays(facts.asOf, 60),
        urgentUntil: null,
      });
    }
    return out;
  },
};

export default fundUnderperformingRule;
