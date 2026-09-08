/**
 * `mf.pf.redundant-funds` — `REDUNDANT_FUNDS`.
 *
 * The suite is built around one bug in particular. `MfOverlapPair.overlapPct`
 * is a **`Pct`** (55 = 55%) and `redundantFundsOverlapFloor` is a **fraction**
 * (0.5), so a rule that compares them raw fires on *every* pair that shares a
 * single security — 20 > 0.5, 3 > 0.5, all of them.
 *
 * A suite with only a firing case would pass under that bug, which is why the
 * scaling test below asserts both directions: 55% fires, 45% does not. Under
 * the raw comparison the 45% case fires too, and the test fails. That pair of
 * assertions is the whole reason the `Ratio`/`Pct` brands exist.
 */

import { describe, it, expect } from 'vitest';
import { serializePct } from '@portfolioos/shared';

import { pfRedundantFundsRule } from '../../../../src/services/mfAnalytics/rules/pf.redundant-funds.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeOverlapPair,
  makePartialScope,
  makePortfolioFacts,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

/** Facts whose only interesting content is the overlap matrix. */
function factsWithPairs(
  pairs: ReturnType<typeof makeOverlapPair>[],
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: { overlap: { pairs, debtPairs: [] }, ...(extra.portfolio ?? {}) },
  });
}

describe('mf.pf.redundant-funds', () => {
  it('is a portfolio-scope rule in the PORTFOLIO category', () => {
    expect(pfRedundantFundsRule.id).toBe('mf.pf.redundant-funds');
    expect(pfRedundantFundsRule.scope).toBe('PORTFOLIO');
    expect(pfRedundantFundsRule.category).toBe('PORTFOLIO');
  });

  it('fires on a same-sub-category pair whose holdings overlap 55%', () => {
    const facts = factsWithPairs([makeOverlapPair({ overlapPct: serializePct('55.000000') })]);

    const findings = pfRedundantFundsRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('REDUNDANT_FUNDS');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('PORTFOLIO');
    // Portfolio scope: the finding belongs to the book, not to one scheme.
    expect(finding.schemeCode).toBeNull();
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
    expect(finding.headline).toContain('55%');
  });

  /**
   * THE SCALING TEST. Both halves are required.
   *
   * With the ×100 bug (`toDecimal(overlapPct) >= 0.5`) the 45% pair also
   * clears the floor, so the second expectation fails and the bug is caught.
   * With a fraction/fraction comparison after correct scaling, 0.55 >= 0.50
   * and 0.45 < 0.50, which is what is asserted.
   */
  it('scales the Pct overlap against the fractional floor in both directions', () => {
    const above = pfRedundantFundsRule.evaluate(
      factsWithPairs([makeOverlapPair({ overlapPct: serializePct('55.000000') })]),
    );
    const below = pfRedundantFundsRule.evaluate(
      factsWithPairs([makeOverlapPair({ overlapPct: serializePct('45.000000') })]),
    );

    expect(above).toHaveLength(1);
    // 45 > 0.5 as raw numbers. Silence here is what proves the scaling.
    expect(below).toEqual([]);
  });

  it('does not fire one notch below the floor, and does fire on it', () => {
    const justBelow = pfRedundantFundsRule.evaluate(
      factsWithPairs([makeOverlapPair({ overlapPct: serializePct('49.999999') })]),
    );
    const exactly = pfRedundantFundsRule.evaluate(
      factsWithPairs([makeOverlapPair({ overlapPct: serializePct('50.000000') })]),
    );

    expect(justBelow).toEqual([]);
    // The doc's trigger is "overlap >= 0.50", so the boundary itself fires.
    expect(exactly).toHaveLength(1);
  });

  it('reads the floor from facts.constants, not from a literal', () => {
    const facts = factsWithPairs([makeOverlapPair({ overlapPct: serializePct('55.000000') })], {
      constants: { redundantFundsOverlapFloor: 0.6 },
    });

    expect(pfRedundantFundsRule.evaluate(facts)).toEqual([]);
  });

  it('ignores pairs from different sub-categories', () => {
    const facts = factsWithPairs([
      makeOverlapPair({ overlapPct: serializePct('80.000000'), sameSubCategory: false }),
    ]);

    // 80% overlap between a flexi-cap and a large-cap fund is the mandate
    // doing its job, not duplication.
    expect(pfRedundantFundsRule.evaluate(facts)).toEqual([]);
  });

  it('stays silent when no overlap has been computed', () => {
    expect(pfRedundantFundsRule.evaluate(factsWithPairs([]))).toEqual([]);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const facts = factsWithPairs([makeOverlapPair({ overlapPct: serializePct('62.500000') })]);

    const finding = pfRedundantFundsRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    // The actual threshold, in the units the reader sees.
    expect(finding.whatWouldChangeThis).toContain('50%');
    expect(finding.whatWouldChangeThis).toContain('62.5%');
  });

  it('emits exactly one finding however many pairs breach', () => {
    // Portfolio-scope findings all carry `schemeCode: null`, so two findings
    // from this rule would share `makeFinding`'s id. The extra pairs are
    // counted instead.
    const facts = factsWithPairs([
      makeOverlapPair({ overlapPct: serializePct('55.000000') }),
      makeOverlapPair({
        schemeCodeA: 'PF_C',
        schemeCodeB: 'PF_D',
        overlapPct: serializePct('72.000000'),
      }),
    ]);

    const findings = pfRedundantFundsRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    // The worst pair leads.
    expect(findings[0]!.headline).toContain('72%');
    expect(findings[0]!.headline).toContain('(+1 more)');
  });

  it('calls the pair count a floor under a partial family scope', () => {
    const facts = factsWithPairs([makeOverlapPair({ overlapPct: serializePct('55.000000') })], {
      portfolio: { scope: makePartialScope() },
    });

    const finding = pfRedundantFundsRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.label.includes('floor'))).toBe(true);
  });
});
