/**
 * EMERGENCY_FUND — liquid money under 3 months of spending. Not measured:
 * the value of a buffer is the bad month it covers, which has no price.
 */
import { CATEGORY_BASE_PRIORITY, IDLE_BUFFER_MONTHS } from '../constants.js';
import { addDays, dec, inr, notMeasured, promise, inrWhole } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

export const emergencyFundRule: AdvisorRule = {
  id: 'EMERGENCY_FUND',
  version: 1,
  description: 'Builds a buffer when liquid money is under 3 months of spending.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const spend = facts?.extra?.monthlySpending;
    if (!spend || spend.lessThanOrEqualTo(0) || !facts.liquidity) return [];
    const need = spend.times(IDLE_BUFFER_MONTHS);
    const have = facts.liquidity.liquidAssets;
    if (have.greaterThanOrEqualTo(need)) return [];
    const gap = need.minus(have);
    const rationale =
      `You spend about ${inr(spend)} a month, so 3 months is ${inr(need)}. Your bank balances and liquid funds come to ${inr(have)}, ` +
      `${inr(gap)} short. Build that up first: without it, one bad month means selling investments at whatever price they fetch that day.`;
    return [{
      ruleId: emergencyFundRule.id,
      ruleVersion: emergencyFundRule.version,
      category: 'EMERGENCY_FUND',
      priority: CATEGORY_BASE_PRIORITY.EMERGENCY_FUND,
      action: [],
      rationale,
      inputsUsed: { asOf: facts.asOf.toISOString(), monthlySpending: dec(spend), liquidAssets: dec(have), needInr: dec(need) },
      provenance: { kind: 'NONE' },
      dedupeKey: 'EMERGENCY_FUND:3m',
      headline: `Build your safety net: ${inrWhole(gap)} to go`,
      promise: promise({ riskBand: 'LOW' }),
      measurement: notMeasured(),
      expiresAt: addDays(facts.asOf, 30),
      urgentUntil: null,
    }];
  },
};

export default emergencyFundRule;
