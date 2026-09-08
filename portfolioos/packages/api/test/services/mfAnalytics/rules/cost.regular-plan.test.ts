/**
 * `mf.cost.regular-plan` (`05 §4` row 8, `05 §8.1`).
 *
 * There is no numeric threshold in this rule — `mfAnalytics.constants.ts` lists
 * it among the deliberate omissions because the trigger is a pure predicate.
 * The "one notch below" case is therefore the predicate's other side: the same
 * fund with no known direct sibling, which must stay silent rather than
 * asserting a saving it cannot name.
 */

import { describe, expect, it } from 'vitest';
import { serializeMoney, serializePct } from '@portfolioos/shared';
import { costRegularPlanRule as rule } from '../../../../src/services/mfAnalytics/rules/cost.regular-plan.js';
import { SCHEME, makeFacts, makeFundFacts } from './_facts.fixture.js';

function facts(options: {
  planType?: 'DIRECT' | 'REGULAR';
  directSiblingSchemeCode?: string | null;
  annualSavingsInr?: string | null;
  terPct?: string | null;
  directSiblingTerPct?: string | null;
}) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        meta: { planType: options.planType ?? 'REGULAR' },
      }),
    },
    cost: {
      byFund: [
        {
          schemeCode: SCHEME,
          terPct: options.terPct === undefined ? serializePct('1.780000') : options.terPct === null ? null : serializePct(options.terPct),
          directSiblingSchemeCode:
            options.directSiblingSchemeCode === undefined
              ? 'FIXTURE_SCHEME_1_DIRECT'
              : options.directSiblingSchemeCode,
          directSiblingTerPct:
            options.directSiblingTerPct === undefined
              ? serializePct('0.720000')
              : options.directSiblingTerPct === null
                ? null
                : serializePct(options.directSiblingTerPct),
          annualSavingsInr:
            options.annualSavingsInr === undefined
              ? serializeMoney('4200')
              : options.annualSavingsInr === null
                ? null
                : serializeMoney(options.annualSavingsInr),
        },
      ],
    },
  });
}

describe('mf.cost.regular-plan', () => {
  it('fires for a regular-plan holding with a direct sibling', () => {
    const found = rule.evaluate(facts({}), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('REGULAR_PLAN_COST');
    // WARNING, not NOTICE: the fix is free and changes nothing about the
    // investment itself.
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('COST');
    expect(finding.headline).toContain('4,200');
  });

  it('does not fire for a direct-plan holding', () => {
    expect(rule.evaluate(facts({ planType: 'DIRECT' }), SCHEME)).toEqual([]);
  });

  it('does not fire when no direct sibling is known', () => {
    // The other side of `05 §4`'s predicate. Silence, not a saving we cannot
    // point at a scheme code.
    expect(rule.evaluate(facts({ directSiblingSchemeCode: null }), SCHEME)).toEqual([]);
  });

  it('names the saving in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts({}), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('4,200');
    expect(finding.whatWouldChangeThis).toContain('FIXTURE_SCHEME_1_DIRECT');
  });

  it('falls back to the TER gap when the rupee saving could not be computed', () => {
    const finding = rule.evaluate(facts({ annualSavingsInr: null }), SCHEME)[0]!;
    // 1.78% - 0.72% = 1.06% of commission.
    expect(finding.whatWouldChangeThis).toContain('1.06%');
  });

  it('is silent when neither a saving nor both TERs are known', () => {
    // `makeFinding` refuses an unevidenced finding, and a finding with no
    // number is exactly what a null-tolerant implementation would produce.
    const nothing = facts({ annualSavingsInr: null, terPct: null, directSiblingTerPct: null });
    expect(rule.evaluate(nothing, SCHEME)).toEqual([]);
  });

  it('is silent when the fund has no row in the cost breakdown', () => {
    const noRow = makeFacts({
      funds: { [SCHEME]: makeFundFacts({ meta: { planType: 'REGULAR' } }) },
      cost: { byFund: [] },
    });
    expect(rule.evaluate(noRow, SCHEME)).toEqual([]);
  });
});
