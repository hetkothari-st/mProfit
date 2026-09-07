/**
 * `REGULAR_PLAN_COST` (`05 §4`, fund scope, row 8).
 *
 * Fires when the held plan is REGULAR and the same scheme has a DIRECT
 * sibling. There is no threshold to tune and none in `MfRuleConstants` —
 * `mfAnalytics.constants.ts` lists this rule among the deliberate omissions,
 * because the trigger is a pure predicate: either the fund has a direct plan
 * or it does not.
 *
 * This is usually the single largest actionable number in a retail portfolio,
 * and it is the only finding in this batch where the fix is free: the direct
 * plan is the *same portfolio, same manager, same NAV series*, minus the
 * distributor commission. Nothing about the investment changes. That is why it
 * is WARNING while `HIGH_TER` — a real but smaller and unfixable-without-
 * switching-funds cost — is only NOTICE.
 *
 * `05 §5` is explicit that this finding must never drive a `SWITCH_CANDIDATE`
 * verdict on its own: it is a plan switch inside one fund, not a change of
 * fund, and it carries its own action type. This rule emits the finding; it
 * expresses no verdict.
 *
 * WHERE THE MONEY COMES FROM. `facts.portfolio.cost.byFund[]` — computed once
 * by `04`'s cost analysis as (regular TER - direct TER) x current value, so
 * the number in the finding is the number on the cost page. Note that
 * `MfCostSummary.weightedTerPct` and `annualCostInr` are `| null` and a null
 * there means "no held fund disclosed a TER", never zero; this rule does not
 * read them, and reads the per-fund row instead precisely so a portfolio-level
 * null cannot silently become a ₹0 saving.
 */

import {
  formatINR,
  serializeRatio,
  toDecimal,
  type MfEvidence,
  type MfFinding,
  type Money,
  type Pct,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.cost.regular-plan';
const RULE_VERSION = '1.0.0';
const CODE = 'REGULAR_PLAN_COST';

/** Rebrand a percent- or rupee-valued string for an evidence row. See high-ter. */
function asEvidenceValue(value: Pct | Money) {
  return serializeRatio(toDecimal(value));
}

export const costRegularPlanRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'COST',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    if (fund.meta.planType !== 'REGULAR') return [];

    const row = facts.portfolio.cost.byFund.find((entry) => entry.schemeCode === schemeCode);
    if (row === undefined) return [];

    // No known direct sibling is not "there is no direct plan" — it is "we
    // could not find one". Either way there is nothing to switch to that we
    // can name, so the rule is silent (`05 §4`: "and direct sibling exists").
    const sibling = row.directSiblingSchemeCode;
    if (sibling === null) return [];

    const savings = row.annualSavingsInr;
    const regularTer = row.terPct;
    const directTer = row.directSiblingTerPct;

    // The finding has to cite a number. Without either the saving or both
    // TERs there is nothing to put on an evidence row, and `makeFinding` would
    // rightly refuse to build an unevidenced finding.
    if (savings === null && (regularTer === null || directTer === null)) return [];

    const evidence: MfEvidence[] = [];
    if (savings !== null) {
      evidence.push({
        metric: 'cost.byFund.annualSavingsInr',
        label: 'Annual saving from the direct plan at current value',
        value: asEvidenceValue(savings),
        unit: 'inr',
      });
    }
    if (regularTer !== null) {
      evidence.push({
        metric: 'terPct',
        label: 'Regular-plan expense ratio',
        value: asEvidenceValue(regularTer),
        unit: 'pct',
      });
    }
    if (directTer !== null) {
      evidence.push({
        metric: 'cost.byFund.directSiblingTerPct',
        label: 'Direct-plan expense ratio',
        value: asEvidenceValue(directTer),
        unit: 'pct',
      });
    }

    const savingsLabel = savings === null ? null : formatINR(savings, { fractionDigits: 0 });

    const headline =
      savingsLabel === null
        ? `Held in the regular plan; the direct plan of the same fund charges ` +
          `${toDecimal(directTer ?? '0').toFixed(2)}% against ${toDecimal(regularTer ?? '0').toFixed(2)}%`
        : `Regular plan: the direct plan of the same fund saves about ${savingsLabel}/yr`;

    const counterfactual =
      savingsLabel === null
        ? `Switching to the direct plan (${sibling}) removes the ` +
          `${toDecimal(regularTer ?? '0').minus(toDecimal(directTer ?? '0')).toFixed(2)}% ` +
          `distributor commission; this clears once the units are held in the direct plan.`
        : `Switching to the direct plan (${sibling}) saves about ${savingsLabel}/yr at current ` +
          `value; this clears once the units are held in the direct plan.`;

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'COST',
        severity: 'WARNING',
        // Structural, no return series behind it: `CONFIDENCE_NO_HORIZON`.
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
