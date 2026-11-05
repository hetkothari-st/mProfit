/**
 * ADVANCE_TAX — an instalment within 15 days with a shortfall. Paying by the
 * due date avoids the 234C interest; urgent in the last 7 days. Built from the
 * Tax page's own advance-tax report (gains this app can see).
 */
import { ADVANCE_TAX_WINDOW_DAYS, CATEGORY_BASE_PRIORITY } from '../constants.js';
import { daysUntil, dec, inr, money2, promise, urgentIfWithin, inrWhole } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const advanceTaxRule: AdvisorRule = {
  id: 'ADVANCE_TAX',
  version: 1,
  description: 'Pays an advance-tax instalment before its due date to avoid interest.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const at = facts?.extra?.advanceTax;
    if (!at || at.dueDate < facts.asOf) return [];
    const left = daysUntil(at.dueDate, facts.asOf);
    if (left > ADVANCE_TAX_WINDOW_DAYS || !at.shortfall.greaterThan(0)) return [];
    const date = at.dueDate.toISOString().slice(0, 10);
    const rationale =
      `Your ${at.label} advance-tax instalment is due on ${date}, in ${left} day${left === 1 ? '' : 's'}. ` +
      `On the gains booked so far you are ${inr(at.shortfall)} short. Paying it by the due date avoids about ${inr(at.interest)} of interest under section 234C. ` +
      'This counts only income the app can see; salary TDS and other income may change the figure.';
    return [{
      ruleId: advanceTaxRule.id,
      ruleVersion: advanceTaxRule.version,
      category: 'ADVANCE_TAX',
      priority: CATEGORY_BASE_PRIORITY.ADVANCE_TAX,
      action: [],
      rationale,
      inputsUsed: { asOf: facts.asOf.toISOString(), label: at.label, dueDate: date, shortfall: dec(at.shortfall), interest: dec(at.interest) },
      provenance: { kind: 'NONE' },
      dedupeKey: `ADVANCE_TAX:${date}`,
      headline: `Pay ${inrWhole(at.shortfall)} of advance tax by ${date}`,
      promise: promise({ gainInr: money2(at.interest), riskBand: 'LOW', costInr: '0.00', liquidity: null, confidence: 'MEDIUM' }),
      measurement: { method: 'TAX_SAVED', horizonDays: left + 1, baseline: { kind: 'ADVANCE_TAX', dueDate: date, shortfallInr: money2(at.shortfall), interestInr: money2(at.interest) } },
      expiresAt: at.dueDate,
      urgentUntil: urgentIfWithin(at.dueDate, facts.asOf),
    }];
  },
};

export default advanceTaxRule;
