/**
 * STOPPED_SIP — an SIP that missed instalments while the market fell. Buying
 * through a fall is when a SIP buys the most units; stopping then is the
 * costliest time to stop.
 */
import { CATEGORY_BASE_PRIORITY, SIP_DIP_PCT } from '../constants.js';
import { addDays, inr, money2, promise } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const stoppedSipRule: AdvisorRule = {
  id: 'STOPPED_SIP',
  version: 1,
  description: 'Restarts an SIP that stopped while the market was down.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x || x.indexMonthly.length < 3) return [];
    const recent = x.indexMonthly.slice(-4);
    const high = Math.max(...recent.slice(0, -1).map((m) => m.close));
    const low = Math.min(...recent.slice(1).map((m) => m.close));
    const fallPct = ((high - low) / high) * 100;
    if (!(fallPct >= SIP_DIP_PCT)) return [];
    const out: RecommendationDraft[] = [];
    for (const s of x.sips) {
      if (s.missedMonths.length === 0) continue;
      const missedTotal = s.monthlyAmount.times(s.missedMonths.length);
      const rationale =
        `Your ${inr(s.monthlyAmount)} monthly SIP in ${s.name} missed ${s.missedMonths.length} instalment${s.missedMonths.length > 1 ? 's' : ''} ` +
        `(${s.missedMonths.join(', ')}) while the Nifty 50 fell about ${fallPct.toFixed(1)}% from its recent high. ` +
        `Those ${inr(missedTotal)} would have bought units at lower prices; restarting now keeps buying while prices are still down.`;
      out.push({
        ruleId: stoppedSipRule.id,
        ruleVersion: stoppedSipRule.version,
        category: 'STOPPED_SIP',
        priority: CATEGORY_BASE_PRIORITY.STOPPED_SIP,
        action: [],
        rationale,
        inputsUsed: { asOf: facts.asOf.toISOString(), sipId: s.sipId, missedMonths: s.missedMonths, fallPct: Math.round(fallPct * 100) / 100, index: recent },
        provenance: { kind: 'NONE' },
        dedupeKey: `STOPPED_SIP:${s.sipId}`,
        headline: `Restart your ${inr(s.monthlyAmount)} SIP while prices are down`,
        promise: promise({ riskBand: 'MEDIUM' }),
        measurement: {
          method: 'SIP_UNITS',
          horizonDays: 365,
          baseline: { sipId: s.sipId, fundId: s.fundId, monthlyAmountInr: money2(s.monthlyAmount), missedMonths: s.missedMonths, missedTotalInr: money2(missedTotal) },
        },
        expiresAt: addDays(facts.asOf, 45),
        urgentUntil: null,
      });
    }
    return out;
  },
};

export default stoppedSipRule;
