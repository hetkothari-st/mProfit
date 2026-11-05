/**
 * LTCG_BOOKING — long-term equity gains up to the yearly tax-free limit
 * (₹1.25 lakh) cost nothing to book now and reset the cost price, so that
 * slice is never taxed later. Only in February and March, when the year's
 * other gains are known; urgent in the last week.
 */
import { Decimal } from 'decimal.js';
import { CATEGORY_BASE_PRIORITY, LTCG_BOOKING_MIN_INR } from '../constants.js';
import { dec, fyEnd, inr, money2, promise, urgentIfWithin } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const ltcgBookingRule: AdvisorRule = {
  id: 'LTCG_BOOKING',
  version: 1,
  description: 'Books long-term equity gains up to the yearly tax-free limit before 31 March.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x) return [];
    const month = facts.asOf.getUTCMonth(); // 1 = February, 2 = March
    if (month !== 1 && month !== 2) return [];
    let headroom = Decimal.max(0, x.ltcg.exemption.minus(x.ltcg.realised));
    if (headroom.lessThan(LTCG_BOOKING_MIN_INR)) return [];
    const deadline = fyEnd(facts.asOf);
    const out: RecommendationDraft[] = [];
    const ratePct = facts.capitalGainsRates.ltcgEquityPct;
    for (const c of [...x.ltcg.candidates].sort((a, b) => b.gain.comparedTo(a.gain))) {
      if (headroom.lessThan(LTCG_BOOKING_MIN_INR)) break;
      const book = Decimal.min(headroom, c.gain);
      if (book.lessThan(LTCG_BOOKING_MIN_INR) || c.gain.lessThanOrEqualTo(0)) continue;
      const sell = c.value.times(book).dividedBy(c.gain).toDecimalPlaces(2);
      const taxSaved = book.times(ratePct).dividedBy(100);
      headroom = headroom.minus(book);
      const rationale =
        `You have booked ${inr(x.ltcg.realised)} of long-term gains this year, and the first ${inr(x.ltcg.exemption)} is tax-free. ` +
        `Sell ${inr(sell)} of ${c.assetName} to book ${inr(book)} of gain at no tax, then buy it back the same day: ` +
        `your cost price resets, so that ${inr(book)} is never taxed later — about ${inr(taxSaved)} at ${ratePct}%. ` +
        'The limit resets on 1 April and unused room does not carry over.';
      out.push({
        ruleId: ltcgBookingRule.id,
        ruleVersion: ltcgBookingRule.version,
        category: 'LTCG_BOOKING',
        priority: CATEGORY_BASE_PRIORITY.LTCG_BOOKING,
        action: [{
          direction: 'SELL', bucket: 'EQUITY_DOMESTIC', portfolioId: c.portfolioId, instrumentName: c.assetName, fundId: null,
          stockId: null, isin: c.isin, holdingKey: null, units: null, amountInr: money2(sell),
        }],
        rationale,
        inputsUsed: {
          asOf: facts.asOf.toISOString(), fy: x.ltcg.fy, realised: dec(x.ltcg.realised), exemption: dec(x.ltcg.exemption),
          gainInr: dec(c.gain), valueInr: dec(c.value), bookInr: dec(book), ltcgEquityPct: ratePct,
        },
        provenance: { kind: 'NONE' },
        dedupeKey: `LTCG_BOOKING:${x.ltcg.fy}:${c.portfolioId}:${c.isin ?? c.assetName}`,
        headline: `Book ${inr(book)} of gains tax-free before 31 March`,
        promise: promise({ gainInr: money2(taxSaved), riskBand: 'LOW', costInr: null, liquidity: null }),
        measurement: {
          method: 'TAX_SAVED',
          horizonDays: Math.max(1, Math.ceil((deadline.getTime() - facts.asOf.getTime()) / 86_400_000)),
          baseline: { kind: 'LTCG_BOOKING', bookInr: money2(book), ratePct, realisedAtAdvice: x.ltcg.realised.toFixed(2), fy: x.ltcg.fy },
        },
        expiresAt: deadline,
        urgentUntil: urgentIfWithin(deadline, facts.asOf),
      });
    }
    return out;
  },
};

export default ltcgBookingRule;
