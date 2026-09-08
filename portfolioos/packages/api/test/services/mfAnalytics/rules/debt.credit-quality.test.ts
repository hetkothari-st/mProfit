/**
 * `mf.debt.credit-quality` — sub-AA paper above the category norm.
 *
 * The Credit Risk case below is the reason this rule has the shape it does. A
 * Credit Risk Fund holding 40% below-AA paper is a Credit Risk Fund doing its
 * job; firing there would put a permanent WARNING on every scheme in a whole
 * SEBI category and discredit every other finding on the page.
 */

import { describe, it, expect } from 'vitest';
import { serializePct } from '@portfolioos/shared';
import type { Pct, SebiSubCategory } from '@portfolioos/shared';
import { debtCreditQualityRule } from '../../../../src/services/mfAnalytics/rules/debt.credit-quality.js';
import { DEBT_PROFILE_BASE, factsForFund } from './_facts.fixture.js';

function evaluate(sub: SebiSubCategory | 'UNMAPPED', belowAAPct: Pct | null) {
  const { facts, schemeCode } = factsForFund({
    meta: { sebiCategory: 'DEBT', sebiSubCategory: sub },
    profile: { ...DEBT_PROFILE_BASE, belowAAPct },
  });
  return debtCreditQualityRule.evaluate(facts, schemeCode);
}

describe('mf.debt.credit-quality', () => {
  it('fires when a non-credit-risk debt fund is above the below-AA threshold', () => {
    const found = evaluate('Corporate Bond Fund', serializePct(22));

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('LOW_CREDIT_QUALITY');
    expect(found[0]!.severity).toBe('WARNING');
    expect(found[0]!.category).toBe('DEBT');
  });

  it('stays silent one notch below the threshold', () => {
    // The trigger is `> 15`, so exactly 15 is inside the norm.
    expect(evaluate('Corporate Bond Fund', serializePct('15.1'))).toHaveLength(1);
    expect(evaluate('Corporate Bond Fund', serializePct(15))).toEqual([]);
  });

  it('does NOT fire for a Credit Risk Fund holding 40% below-AA paper', () => {
    // SEBI *defines* the category as >= 65% below AA+. This is the mandate, not
    // a defect, and the suppression is keyed on `creditBand.minPctBelow` so a
    // second such category would inherit it automatically.
    expect(evaluate('Credit Risk Fund', serializePct(40))).toEqual([]);
    // Even at an extreme value — which is what makes this a suppression rather
    // than a raised threshold.
    expect(evaluate('Credit Risk Fund', serializePct(90))).toEqual([]);
  });

  it('names the threshold in the counterfactual', () => {
    const counterfactual = evaluate('Corporate Bond Fund', serializePct(22))[0]!
      .whatWouldChangeThis;
    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('15%');
  });

  it('is silent when the input is missing rather than reading null as 0%', () => {
    // Null means the disclosure did not let us compute it. Not a pass mark, and
    // not a finding either.
    expect(evaluate('Corporate Bond Fund', null)).toEqual([]);

    const { facts, schemeCode } = factsForFund({
      meta: { sebiCategory: 'DEBT', sebiSubCategory: 'Corporate Bond Fund' },
      profile: null,
    });
    expect(debtCreditQualityRule.evaluate(facts, schemeCode)).toEqual([]);
  });

  it('is silent for an UNMAPPED sub-category, whose mandate we cannot name', () => {
    expect(evaluate('UNMAPPED', serializePct(40))).toEqual([]);
  });
});
