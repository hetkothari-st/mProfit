/**
 * `mf.pf.direct-savings` — `DIRECT_PLAN_SAVINGS` (`05 §4`, portfolio scope).
 *
 * The single largest actionable number in most retail portfolios (`04 §4`):
 * the TER difference between each REGULAR plan held and its DIRECT sibling,
 * times current value. Nothing about the fund changes — same manager, same
 * portfolio, same NAV series — only the distributor trail comes out.
 *
 * ── Money is a Decimal string, and two neighbours are `| null` ────────────
 *
 * `directPlanSavingsInr` is `Money`, compared against
 * `constants.directPlanSavingsInr` (also a rupee decimal string) as `Decimal`.
 * Neither is ever a JS number (`CONTEXT.md §3.1`).
 *
 * `MfCostSummary.weightedTerPct` and `annualCostInr` are `| null`, and null
 * means **no held fund disclosed a TER** — not that the portfolio is free.
 * They are cited only when present, and never used to derive the saving.
 *
 * ── The saving is itself a floor ──────────────────────────────────────────
 *
 * `cost.byFund` carries `terPct: null` for funds whose expense ratio we do not
 * have, and a regular plan with an unknown TER contributes nothing to the sum.
 * When any such fund exists the figure is a lower bound, and the finding says
 * so — the same reasoning that makes `weightedTerPct` null rather than zero.
 */

import { serializeRatio, toDecimal, type MfEvidence, type MfFinding } from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.direct-savings';
const RULE_VERSION = '1.0.0';

/** ₹12,34,567 → "12,34,568" (Indian grouping), rounded to whole rupees. */
function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

export const pfDirectSavingsRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'COST',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const { cost } = facts.portfolio;

    // No funds means no plans to compare. `directPlanSavingsInr` would be a
    // well-formed "0" here, and firing on the absence of a portfolio is the
    // one thing a portfolio-scope rule must not do.
    if (facts.portfolio.funds.length === 0) return [];

    const savings = toDecimal(cost.directPlanSavingsInr);
    const threshold = toDecimal(facts.constants.directPlanSavingsInr);
    if (!savings.greaterThan(threshold)) return [];

    // A regular plan whose TER we do not know contributes ₹0 to the sum, so
    // the total understates. Counted, not assumed away.
    const fundsWithUnknownTer = cost.byFund.filter((f) => f.terPct === null).length;
    const switchable = cost.byFund.filter(
      (f) => f.directSiblingSchemeCode !== null && f.annualSavingsInr !== null,
    ).length;

    const partial = facts.portfolio.scope.partial;
    const isFloor = fundsWithUnknownTer > 0 || partial;
    const atLeast = isFloor ? 'at least ' : '';

    const headline =
      `Switching to direct plans saves ${atLeast}₹${groupIndian(savings.toFixed(0))} a year ` +
      `across ${switchable} fund${switchable === 1 ? '' : 's'}`;

    const evidence: MfEvidence[] = [
      {
        metric: 'cost.directPlanSavingsInr',
        label: isFloor
          ? 'Annual saving from moving regular plans to direct (floor)'
          : 'Annual saving from moving regular plans to direct',
        value: serializeRatio(savings),
        unit: 'inr',
      },
      {
        metric: 'constants.directPlanSavingsInr',
        label: 'Annual saving above which the switch is worth surfacing',
        value: serializeRatio(threshold),
        unit: 'inr',
      },
      {
        metric: 'cost.byFund.withDirectSibling.count',
        label: 'Held regular plans with a priced direct sibling',
        value: serializeRatio(switchable),
        unit: 'count',
      },
    ];

    // Cited only where known: null is "not disclosed", never zero.
    if (cost.annualCostInr !== null) {
      evidence.push({
        metric: 'cost.annualCostInr',
        label: 'Total annual cost today, over the funds that disclose a TER',
        value: serializeRatio(toDecimal(cost.annualCostInr)),
        unit: 'inr',
      });
    }
    if (cost.weightedTerPct !== null) {
      evidence.push({
        metric: 'cost.weightedTerPct',
        label: 'Weighted expense ratio across funds that disclose one',
        value: serializeRatio(toDecimal(cost.weightedTerPct)),
        unit: 'pct',
      });
    }
    if (fundsWithUnknownTer > 0) {
      evidence.push({
        metric: 'cost.byFund.withoutTer.count',
        label: 'Held funds with no disclosed TER (their saving is not in the total)',
        value: serializeRatio(fundsWithUnknownTer),
        unit: 'count',
      });
    }

    const counterfactual =
      `Would clear if the annual saving fell below ₹${groupIndian(threshold.toFixed(0))} — ` +
      `it is ${atLeast}₹${groupIndian(savings.toFixed(0))} today. Moving each regular plan to ` +
      'its direct equivalent in the same scheme clears it entirely; the fund, manager and ' +
      'portfolio are unchanged, only the distributor commission comes out.' +
      (fundsWithUnknownTer > 0
        ? ` ${fundsWithUnknownTer} held fund${fundsWithUnknownTer === 1 ? '' : 's'} ` +
          'disclose no expense ratio, so the saving above is a floor.'
        : '') +
      (partial
        ? ' It is summed over the holdings shared with you only, which is a second reason ' +
          'to read it as a floor rather than the household total.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'DIRECT_PLAN_SAVINGS',
        category: 'COST',
        severity: 'WARNING',
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
