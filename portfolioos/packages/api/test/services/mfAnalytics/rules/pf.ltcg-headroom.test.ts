/**
 * `mf.pf.ltcg-headroom` — `LTCG_HEADROOM_UNUSED`.
 *
 * Three conditions must hold together, and each has its own silence case
 * below, because any one of them alone produces a notice the reader cannot
 * act on:
 *
 *  - headroom above ₹50,000;
 *  - long-term lots actually sitting on a gain to put through it;
 *  - within 60 days of 31 March, measured from `facts.asOf` and never a clock.
 *
 * The June case is the one worth naming: the same headroom, the same lots, and
 * ten months to act. Firing then is noise, and a rule that reads `Date.now()`
 * instead of `facts.asOf` would fire or not fire depending on the day the
 * suite ran.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney } from '@portfolioos/shared';

import { pfLtcgHeadroomRule } from '../../../../src/services/mfAnalytics/rules/pf.ltcg-headroom.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeLot,
  makePartialScope,
  makePortfolioFacts,
  makeTaxSummary,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

/** 44 days before 31 March 2026 — inside the default 60-day window. */
const INSIDE_WINDOW = '2026-02-15T00:00:00.000Z';
/** 89 days before it — outside. */
const OUTSIDE_WINDOW = '2026-01-01T00:00:00.000Z';

const LTCG_LOT = makeLot({ gainType: 'LTCG', gain: serializeMoney('90000') });

function factsWithTax(
  tax: Parameters<typeof makeTaxSummary>[0],
  asOf = INSIDE_WINDOW,
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    asOf,
    portfolio: { tax: makeTaxSummary(tax), ...(extra.portfolio ?? {}) },
  });
}

const FIRING_TAX = {
  ltcgExemptionHeadroomInr: serializeMoney('75000'),
  financialYear: '2025-26',
  lots: [LTCG_LOT],
};

describe('mf.pf.ltcg-headroom', () => {
  it('is a portfolio-scope rule in the TAX category', () => {
    expect(pfLtcgHeadroomRule.id).toBe('mf.pf.ltcg-headroom');
    expect(pfLtcgHeadroomRule.scope).toBe('PORTFOLIO');
    expect(pfLtcgHeadroomRule.category).toBe('TAX');
  });

  it('fires with headroom, realisable LTCG lots, and the FY end in sight', () => {
    const findings = pfLtcgHeadroomRule.evaluate(factsWithTax(FIRING_TAX));

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('LTCG_HEADROOM_UNUSED');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('TAX');
    expect(finding.schemeCode).toBeNull();
    // ₹75,000 of headroom against ₹90,000 of realisable gain: the usable
    // figure is the headroom, and that is what the headline cites.
    expect(finding.headline).toContain('₹75,000');
    expect(finding.headline).toContain('44 days');
    expect(finding.headline).toContain('FY 2025-26');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('cites the realisable gain when it is smaller than the headroom', () => {
    const facts = factsWithTax({
      ...FIRING_TAX,
      lots: [makeLot({ gainType: 'LTCG', gain: serializeMoney('61000') })],
    });

    // The allowance is only useful up to the gains that exist to use it.
    expect(pfLtcgHeadroomRule.evaluate(facts)[0]!.headline).toContain('₹61,000');
  });

  it('does not fire one notch below the headroom threshold', () => {
    // The trigger is "> ₹50,000", so ₹50,000 exactly is clean.
    const facts = factsWithTax({
      ...FIRING_TAX,
      ltcgExemptionHeadroomInr: serializeMoney('50000'),
    });

    expect(pfLtcgHeadroomRule.evaluate(facts)).toEqual([]);
  });

  it('does not fire without long-term lots to realise', () => {
    const facts = factsWithTax({
      ...FIRING_TAX,
      // Short-term lots, and a long-term lot at a loss. Neither can use the
      // §112A allowance.
      lots: [
        makeLot({ gainType: 'STCG', gain: serializeMoney('80000'), daysToLtcg: 120 }),
        makeLot({ gainType: 'LTCG', gain: serializeMoney('-20000') }),
      ],
    });

    expect(pfLtcgHeadroomRule.evaluate(facts)).toEqual([]);
  });

  it('does not fire outside the financial-year-end window', () => {
    // Same headroom, same lots, ten months to act. Firing in January is noise.
    expect(pfLtcgHeadroomRule.evaluate(factsWithTax(FIRING_TAX, OUTSIDE_WINDOW))).toEqual([]);
  });

  it('reads the window and the minimum from facts.constants', () => {
    const widened = pfLtcgHeadroomRule.evaluate(
      factsWithTax(FIRING_TAX, OUTSIDE_WINDOW, {
        constants: { ltcgHeadroomFyEndWindowDays: 120 },
      }),
    );
    const raised = pfLtcgHeadroomRule.evaluate(
      factsWithTax(FIRING_TAX, INSIDE_WINDOW, { constants: { ltcgHeadroomMinInr: '100000' } }),
    );

    expect(widened).toHaveLength(1);
    expect(raised).toEqual([]);
  });

  it('stays silent for a financial year in which §112A did not exist', () => {
    // `ltcg112aExemptionForFy` returns null before FY 2018-19 — "this concept
    // did not apply", which is not a ₹0 allowance.
    const facts = factsWithTax(
      { ...FIRING_TAX, financialYear: '2016-17' },
      '2017-02-15T00:00:00.000Z',
    );

    expect(pfLtcgHeadroomRule.evaluate(facts)).toEqual([]);
  });

  it('stays silent on a malformed financial year rather than guessing a deadline', () => {
    const facts = factsWithTax({ ...FIRING_TAX, financialYear: '2025-99' });

    expect(pfLtcgHeadroomRule.evaluate(facts)).toEqual([]);
  });

  it('names both the threshold and the deadline in whatWouldChangeThis', () => {
    const finding = pfLtcgHeadroomRule.evaluate(factsWithTax(FIRING_TAX))[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('₹50,000');
    expect(finding.whatWouldChangeThis).toContain('31 March 2026');
    expect(finding.whatWouldChangeThis).toContain('60 days');
  });

  it('calls the realisable gain a floor under a partial family scope', () => {
    const facts = factsWithTax(FIRING_TAX, INSIDE_WINDOW, {
      portfolio: { scope: makePartialScope() },
    });

    const finding = pfLtcgHeadroomRule.evaluate(facts)[0]!;

    // The gain is summed over visible lots and is a floor; the statutory
    // headroom is per-person and is not.
    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.label.includes('floor'))).toBe(true);
  });
});
