/**
 * `mf.debt.issuer-concentration` — one issuer above the 10% single-issuer norm.
 *
 * The gilt case is the counterpart of the Credit Risk suppression in
 * `debt.credit-quality.test.ts`: a Gilt Fund is ~100% one issuer (the
 * Government of India) by mandate, and SEBI's own single-issuer cap excludes
 * government securities for exactly that reason.
 */

import { describe, it, expect } from 'vitest';
import { serializePct } from '@portfolioos/shared';
import type { Pct, SebiSubCategory } from '@portfolioos/shared';
import { debtIssuerConcentrationRule } from '../../../../src/services/mfAnalytics/rules/debt.issuer-concentration.js';
import { DEBT_PROFILE_BASE, factsForFund } from './_facts.fixture.js';

function evaluate(sub: SebiSubCategory, topIssuerPct: Pct | null) {
  const { facts, schemeCode } = factsForFund({
    meta: { sebiCategory: 'DEBT', sebiSubCategory: sub },
    profile: { ...DEBT_PROFILE_BASE, topIssuerPct },
  });
  return debtIssuerConcentrationRule.evaluate(facts, schemeCode);
}

describe('mf.debt.issuer-concentration', () => {
  it('fires when a single issuer is above the norm', () => {
    const found = evaluate('Corporate Bond Fund', serializePct(14));

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('ISSUER_CONCENTRATION');
    expect(found[0]!.severity).toBe('NOTICE');
    expect(found[0]!.category).toBe('DEBT');
  });

  it('stays silent one notch below the threshold', () => {
    expect(evaluate('Corporate Bond Fund', serializePct('10.1'))).toHaveLength(1);
    expect(evaluate('Corporate Bond Fund', serializePct(10))).toEqual([]);
  });

  it('does NOT fire on a gilt fund concentrated in the sovereign', () => {
    // 85% in one issuer is what a Gilt Fund *is*. The suppression is keyed on
    // the sub-category's mandated SOVEREIGN issuer floor, not on its name.
    expect(evaluate('Gilt Fund', serializePct(85))).toEqual([]);
    expect(evaluate('Gilt Fund with 10 year constant duration', serializePct(97))).toEqual([]);
  });

  it('names the threshold in the counterfactual', () => {
    const counterfactual = evaluate('Corporate Bond Fund', serializePct(14))[0]!
      .whatWouldChangeThis;
    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('10%');
  });

  it('is silent when the input is missing', () => {
    // Null on an equity fund, and null on a debt fund whose disclosure did not
    // name issuers. Both mean no finding, never "0%".
    expect(evaluate('Corporate Bond Fund', null)).toEqual([]);

    const { facts, schemeCode } = factsForFund({
      meta: { sebiCategory: 'DEBT', sebiSubCategory: 'Corporate Bond Fund' },
      profile: null,
    });
    expect(debtIssuerConcentrationRule.evaluate(facts, schemeCode)).toEqual([]);
  });
});
