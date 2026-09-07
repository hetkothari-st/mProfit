/**
 * `mf.pf.no-emergency-liquidity` — `NO_LIQUID_BUFFER` (`05 §4`, portfolio
 * scope).
 *
 * Two conditions, and both are required:
 *
 *  1. The mutual fund book holds **no liquid or overnight fund** — the two
 *     SEBI sub-categories whose mandate is same-day-ish access. Everything
 *     else, including ultra-short and low-duration funds, carries either a
 *     redemption lag or mark-to-market risk that an emergency does not wait
 *     for.
 *  2. The emergency buffer covers **fewer than
 *     `noLiquidBufferMonthsCoveredFloor` months of expenses** (default 3, half
 *     of `EMERGENCY_FUND_MONTHS`).
 *
 * Condition 1 alone is a preference, not a gap: a household with a year of
 * expenses in a sweep-in savings account is *right* to hold no liquid fund,
 * and telling them otherwise is the kind of finding that teaches people to
 * dismiss findings.
 *
 * ── Why the threshold is months and not a health sub-score ────────────────
 *
 * `05 §4` phrases the trigger as "health-score emergency-fund component <
 * threshold". That was changed deliberately (see the comment on
 * `LIQUID_BUFFER_ALARM_MONTHS` in `finance/planningBands.ts`): the sub-score
 * is `monthsCovered / 6 × 100`, capped, so "score below 50" is an unverifiable
 * encoding of "under three months" that would silently change meaning if the
 * formula were ever rescaled. Months of expenses covered is the decision
 * actually being made, so months is what is written down and compared.
 *
 * ── ⚠ THIS RULE IS SILENT TODAY, AND THE GAP IS REAL ─────────────────────
 *
 * `MfAnalysisFacts` carries no months-covered figure. It has `userProfile
 * .incomeKnown`, a risk profile and goals; it has no monthly expense figure
 * and no cash/savings balance, both of which live outside the MF analytics
 * layer (`healthScoreMath.emergencyFundScore` computes the equivalent from
 * `CashFlow` and account balances, which a rule may not reach — `05 §3`).
 *
 * So `monthsCoveredFrom` returns `null` and the rule emits nothing. That is
 * the intended behaviour, not an oversight to be worked around:
 *
 *   - `lookThrough.assetClass.cash` is a **share of the MF book**, not months
 *     of expenses. A book that is 30% cash says nothing about how long that
 *     cash would last, because the expenses are not in the facts.
 *   - `incomeKnown === false` is a licence to say "we cannot size this for
 *     you", never a licence to treat income — or expenses — as zero
 *     (`CONTEXT.md §6`).
 *
 * Inventing either proxy would produce a NOTICE telling a real person their
 * emergency fund is short on the strength of a number nobody computed. Closing
 * the gap properly means adding a months-covered fact to
 * `mfFacts.builder.ts`; the comparison below is then already correct and
 * already threshold-driven.
 */

import { serializeRatio, type MfEvidence, type MfFinding } from '@portfolioos/shared';
import type { Decimal } from 'decimal.js';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.no-emergency-liquidity';
const RULE_VERSION = '1.0.0';

/**
 * The sub-categories that count as an emergency buffer inside the MF book.
 *
 * Canonical `SebiSubCategory` keys from `sebiCategories.ts`. Ultra Short and
 * Low Duration are deliberately excluded: both can be down on the day they are
 * needed, which is the one day the buffer exists for.
 */
const LIQUID_SUBCATEGORIES: readonly string[] = ['Liquid Fund', 'Overnight Fund'];

/**
 * Months of expenses the household's liquid assets cover, or `null` when the
 * facts do not carry it.
 *
 * **Returns `null` for every input today** — see the header. This is the one
 * seam that needs filling when a months-covered figure reaches
 * `MfAnalysisFacts`; nothing else in the rule changes.
 */
function monthsCoveredFrom(_facts: MfAnalysisFacts): Decimal | null {
  return null;
}

export const pfNoEmergencyLiquidityRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'ALLOCATION',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const funds = facts.portfolio.funds;
    // An empty book is not a book without a liquid fund; it is no book.
    if (funds.length === 0) return [];

    const holdsLiquid = funds.some((fund) =>
      LIQUID_SUBCATEGORIES.includes(fund.meta.sebiSubCategory),
    );
    if (holdsLiquid) return [];

    const monthsCovered = monthsCoveredFrom(facts);
    // A missing input means no finding — never a proxy, never a default.
    if (monthsCovered === null) return [];

    const floor = facts.constants.noLiquidBufferMonthsCoveredFloor;
    if (!monthsCovered.lessThan(floor)) return [];

    const partial = facts.portfolio.scope.partial;

    const headline =
      `No liquid or overnight fund, and only ${monthsCovered.toFixed(1)} months of ` +
      `expenses covered (target ${floor})`;

    const evidence: MfEvidence[] = [
      {
        metric: 'userProfile.monthsOfExpensesCovered',
        label: partial
          ? 'Months of expenses covered by liquid assets (floor — shared holdings only)'
          : 'Months of expenses covered by liquid assets',
        value: serializeRatio(monthsCovered),
        unit: 'count',
      },
      {
        metric: 'constants.noLiquidBufferMonthsCoveredFloor',
        label: 'Months below which holding no liquid fund is a gap rather than a preference',
        value: serializeRatio(floor),
        unit: 'count',
      },
      {
        metric: 'portfolio.funds.liquidCount',
        label: 'Liquid or overnight funds held',
        value: serializeRatio(0),
        unit: 'count',
      },
    ];

    const counterfactual =
      `Would clear once liquid assets cover ${floor} months of expenses — they cover ` +
      `${monthsCovered.toFixed(1)} today — or once the portfolio holds a liquid or overnight ` +
      'fund that can be redeemed the same day. Ultra-short and low-duration funds do not ' +
      'count: both can be down on the day the money is needed.' +
      (partial
        ? ' Only the holdings shared with you were checked for a liquid fund, so the ' +
          'household may hold one you cannot see.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'NO_LIQUID_BUFFER',
        category: 'ALLOCATION',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
