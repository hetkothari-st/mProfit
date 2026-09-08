/**
 * `mf.debt.duration-mismatch` — duration outside the SEBI band.
 *
 * Three properties are under test and each protects a different mistake:
 *
 *  1. **Dynamic Bond Fund never fires.** Its band is `{null, null}` because
 *     duration is the manager's active call. Firing there would flag the
 *     product's entire purpose as a defect.
 *  2. **The below-band test only runs when we can convert.** SEBI bands are on
 *     Macaulay duration; the profile carries *modified*, which is always the
 *     smaller number. Without a YTM to convert with, "below the floor" is
 *     indistinguishable from the units bias.
 *  3. **The above-band test runs either way**, because the bias can only ever
 *     hide an above-band breach, never invent one.
 */

import { describe, it, expect } from 'vitest';
import { serializePct, serializeRatio } from '@portfolioos/shared';
import type { Pct, Ratio, SebiSubCategory } from '@portfolioos/shared';
import { debtDurationMismatchRule } from '../../../../src/services/mfAnalytics/rules/debt.duration-mismatch.js';
import { DEBT_PROFILE_BASE, factsForFund } from './_facts.fixture.js';

interface Case {
  sub: SebiSubCategory;
  modifiedDuration: Ratio | null;
  ytmPct?: Pct | null;
  approximated?: boolean;
}

function evaluate({ sub, modifiedDuration, ytmPct = null, approximated = false }: Case) {
  const { facts, schemeCode } = factsForFund({
    meta: { sebiCategory: 'DEBT', sebiSubCategory: sub },
    profile: {
      ...DEBT_PROFILE_BASE,
      modifiedDuration,
      ytmPct,
      durationIsApproximated: approximated,
    },
  });
  return debtDurationMismatchRule.evaluate(facts, schemeCode);
}

describe('mf.debt.duration-mismatch', () => {
  it('fires above the ceiling even without a YTM to convert with', () => {
    // Short Duration Fund: SEBI band is 1-3 years. A modified duration of 4 is
    // a lower bound on Macaulay, so the breach is certain.
    const found = evaluate({ sub: 'Short Duration Fund', modifiedDuration: serializeRatio(4) });

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('DURATION_MISMATCH');
    expect(found[0]!.severity).toBe('WARNING');
    expect(found[0]!.category).toBe('DEBT');
  });

  it('stays silent one notch below the ceiling', () => {
    expect(
      evaluate({ sub: 'Short Duration Fund', modifiedDuration: serializeRatio('3.01') }),
    ).toHaveLength(1);
    // Exactly at the ceiling is inside the band.
    expect(
      evaluate({ sub: 'Short Duration Fund', modifiedDuration: serializeRatio(3) }),
    ).toEqual([]);
  });

  it('does NOT fire for a Dynamic Bond Fund at any duration', () => {
    // `durationBand: { minYears: null, maxYears: null }` is deliberate: SEBI's
    // mandate for the category is "investment across duration".
    expect(evaluate({ sub: 'Dynamic Bond Fund', modifiedDuration: serializeRatio(12) })).toEqual([]);
    expect(
      evaluate({ sub: 'Dynamic Bond Fund', modifiedDuration: serializeRatio('0.1') }),
    ).toEqual([]);
  });

  it('does not fire on a point mandate, which has no tolerance constant', () => {
    // `Gilt Fund with 10 year constant duration` has `exactYears: 10` and no
    // range. Testing a point needs a tolerance and none is defined; inventing
    // one would invent the number that flags a real fund.
    expect(
      evaluate({
        sub: 'Gilt Fund with 10 year constant duration',
        modifiedDuration: serializeRatio(3),
      }),
    ).toEqual([]);
  });

  describe('Macaulay vs modified duration', () => {
    it('does not fire below the floor when there is no YTM to convert with', () => {
      // Modified 0.5 against a 1-year Macaulay floor. Without the yield we
      // cannot tell a genuine breach from the units bias, so we say nothing.
      expect(
        evaluate({
          sub: 'Short Duration Fund',
          modifiedDuration: serializeRatio('0.5'),
          ytmPct: null,
        }),
      ).toEqual([]);
    });

    it('fires below the floor once the YTM lets us convert', () => {
      // 0.5 x (1 + 0.072) = 0.536 Macaulay, genuinely under the 1-year floor.
      const found = evaluate({
        sub: 'Short Duration Fund',
        modifiedDuration: serializeRatio('0.5'),
        ytmPct: serializePct('7.2'),
      });
      expect(found).toHaveLength(1);
      expect(found[0]!.headline).toContain('below');
    });

    it('does not turn a compliant fund into a breach through the conversion', () => {
      // Modified 0.95 looks under a 1-year floor, but at a 7.2% yield the
      // Macaulay duration is 1.018 — inside the band. This is the false
      // positive the whole conversion exists to prevent.
      expect(
        evaluate({
          sub: 'Short Duration Fund',
          modifiedDuration: serializeRatio('0.95'),
          ytmPct: serializePct('7.2'),
        }),
      ).toEqual([]);
    });
  });

  it('lowers confidence when the duration was estimated rather than disclosed', () => {
    const disclosed = evaluate({ sub: 'Short Duration Fund', modifiedDuration: serializeRatio(4) });
    const estimated = evaluate({
      sub: 'Short Duration Fund',
      modifiedDuration: serializeRatio(4),
      approximated: true,
    });

    expect(Number.parseFloat(estimated[0]!.confidence)).toBeLessThan(
      Number.parseFloat(disclosed[0]!.confidence),
    );
  });

  it('names the band boundary in the counterfactual', () => {
    const counterfactual = evaluate({
      sub: 'Short Duration Fund',
      modifiedDuration: serializeRatio(4),
    })[0]!.whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('3 years');
    expect(counterfactual).toContain('Macaulay');
  });

  it('is silent when the duration is missing rather than reading null as zero', () => {
    expect(evaluate({ sub: 'Short Duration Fund', modifiedDuration: null })).toEqual([]);

    const { facts, schemeCode } = factsForFund({
      meta: { sebiCategory: 'DEBT', sebiSubCategory: 'Short Duration Fund' },
      profile: null,
    });
    expect(debtDurationMismatchRule.evaluate(facts, schemeCode)).toEqual([]);
  });
});
