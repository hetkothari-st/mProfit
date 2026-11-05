/**
 * FD_MATURITY — a fixed deposit maturing within 14 days. Banks auto-renew at
 * whatever rate is on offer that day; deciding before maturity is the only
 * time the choice is free. Urgent in the last 7 days.
 */
import { CATEGORY_BASE_PRIORITY, FD_MATURITY_WINDOW_DAYS, LIQUID_FUND_YIELD_PCT } from '../constants.js';
import { daysUntil, dec, inr, money2, promise, urgentIfWithin, inrWhole } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const fdMaturityRule: AdvisorRule = {
  id: 'FD_MATURITY',
  version: 1,
  description: 'Asks for a decision on a fixed deposit before it auto-renews.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x) return [];
    const out: RecommendationDraft[] = [];
    for (const fd of x.fds) {
      const left = daysUntil(fd.maturityDate, facts.asOf);
      if (fd.maturityDate < facts.asOf || left > FD_MATURITY_WINDOW_DAYS) continue;
      const date = fd.maturityDate.toISOString().slice(0, 10);
      const rateClause = fd.ratePct != null ? ` at ${fd.ratePct}%` : '';
      const rationale =
        `Your ${inr(fd.amount)} fixed deposit with ${fd.issuer}${rateClause} matures on ${date}, in ${left} day${left === 1 ? '' : 's'}. ` +
        "If you do nothing the bank renews it at that day's rate for the same term. Compare it with other banks' rates, " +
        `or a liquid fund at about ${LIQUID_FUND_YIELD_PCT}% if you may need the money within the year, and decide before ${date}.`;
      out.push({
        ruleId: fdMaturityRule.id,
        ruleVersion: fdMaturityRule.version,
        category: 'FD_MATURITY',
        priority: CATEGORY_BASE_PRIORITY.FD_MATURITY,
        action: [],
        rationale,
        inputsUsed: { asOf: facts.asOf.toISOString(), fdKey: fd.key, amountInr: dec(fd.amount), ratePct: fd.ratePct, maturityDate: date },
        provenance: { kind: 'NONE' },
        dedupeKey: `FD_MATURITY:${fd.key}:${date}`,
        headline: `Your ${inrWhole(fd.amount)} FD matures on ${date}. Decide before it renews.`,
        promise: promise({ riskBand: 'LOW' }),
        measurement: { method: 'RATE_DIFF', horizonDays: 365, baseline: { kind: 'FD', fdKey: fd.key, amountInr: money2(fd.amount), ratePct: fd.ratePct, maturityDate: date } },
        expiresAt: fd.maturityDate,
        urgentUntil: urgentIfWithin(fd.maturityDate, facts.asOf),
      });
    }
    return out;
  },
};

export default fdMaturityRule;
