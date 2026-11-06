/**
 * LOAN_REFINANCE — a lender advertises a rate low enough that moving the loan
 * saves money after the switching costs (the loan checks' own comparison).
 * Only for loans of ₹5 lakh or more with at least 2 years left.
 */
import { CATEGORY_BASE_PRIORITY, LOAN_REFI_MIN_MONTHS_LEFT, LOAN_REFI_MIN_OUTSTANDING_INR } from '../constants.js';
import { addDays, dec, inr, money2, promise, inrWhole } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const loanRefinanceRule: AdvisorRule = {
  id: 'LOAN_REFINANCE',
  version: 1,
  needs: ['loans'],
  description: 'Moves a loan to a lender with a materially lower rate when it saves money after costs.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x) return [];
    const out: RecommendationDraft[] = [];
    for (const l of x.loans) {
      if (l.outstanding.lessThan(LOAN_REFI_MIN_OUTSTANDING_INR) || l.remainingMonths < LOAN_REFI_MIN_MONTHS_LEFT || !l.netSaving.greaterThan(0)) continue;
      const firstYear = l.outstanding.times(l.currentRatePct - l.marketRatePct).dividedBy(100);
      const breakEven = l.breakEvenMonth != null ? ` The switching costs are paid back in about ${l.breakEvenMonth} months.` : '';
      const rationale =
        `Your ${l.loanType.toLowerCase()} loan with ${l.lender} charges ${l.currentRatePct.toFixed(2)}% on ${inr(l.outstanding)} outstanding, ` +
        `with ${l.remainingMonths} months to go. ${l.marketLender} advertises ${l.marketRatePct.toFixed(2)}%. ` +
        `That is about ${inr(firstYear)} less interest in the first year, and about ${inr(l.netSaving)} over the remaining term after typical processing and legal costs.${breakEven} ` +
        'Ask your lender to match the rate first: many will, and that saves the switching costs too.';
      out.push({
        ruleId: loanRefinanceRule.id,
        ruleVersion: loanRefinanceRule.version,
        category: 'LOAN_REFINANCE',
        priority: CATEGORY_BASE_PRIORITY.LOAN_REFINANCE,
        action: [],
        rationale,
        inputsUsed: {
          asOf: facts.asOf.toISOString(), loanId: l.loanId, currentRatePct: l.currentRatePct, marketRatePct: l.marketRatePct,
          marketLender: l.marketLender, outstanding: dec(l.outstanding), remainingMonths: l.remainingMonths, netSaving: dec(l.netSaving),
        },
        provenance: { kind: 'NONE' },
        dedupeKey: `LOAN_REFINANCE:${l.loanId}`,
        headline: `Save about ${inrWhole(l.netSaving)} on your ${l.loanType.toLowerCase()} loan`,
        promise: promise({ gainInr: money2(firstYear), riskBand: 'LOW', costInr: null, liquidity: null }),
        measurement: {
          method: 'RATE_DIFF',
          horizonDays: 365,
          baseline: { kind: 'LOAN', loanId: l.loanId, ratePct: l.currentRatePct, marketRatePct: l.marketRatePct, outstandingInr: money2(l.outstanding), lender: l.lender },
        },
        expiresAt: addDays(facts.asOf, 60),
        urgentUntil: null,
      });
    }
    return out;
  },
};

export default loanRefinanceRule;
