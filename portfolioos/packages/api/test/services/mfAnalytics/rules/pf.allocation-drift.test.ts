/**
 * `mf.pf.allocation-drift` — `ALLOCATION_DRIFT`.
 *
 * The load-bearing case is the first one: a user with no risk profile has
 * `lookThrough.target === null`, and the rule must be **silent** rather than
 * report 0% drift. Reading an absent model as a perfect match is the same
 * class of error as rendering a hidden category as ₹0 (`CONTEXT.md §6`), and
 * it is the one this rule is most likely to make.
 */

import { describe, it, expect } from 'vitest';
import { serializePct } from '@portfolioos/shared';

import { pfAllocationDriftRule } from '../../../../src/services/mfAnalytics/rules/pf.allocation-drift.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeAllocationComparison,
  makeLookThrough,
  makePartialScope,
  makePortfolioFacts,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

function factsWithTarget(
  target: ReturnType<typeof makeAllocationComparison> | null,
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: { lookThrough: makeLookThrough({ target }), ...(extra.portfolio ?? {}) },
  });
}

/** 12pp over-weight equity, flagged by `04 §3` as outside tolerance. */
function driftedTarget(driftPp: string) {
  return makeAllocationComparison({
    actual: { EQUITY: serializePct('72.000000'), DEBT: serializePct('28.000000') },
    target: { EQUITY: serializePct('60.000000'), DEBT: serializePct('40.000000') },
    drift: { EQUITY: serializePct(driftPp), DEBT: serializePct('0.000000') },
    outsideTolerance: ['EQUITY'],
  });
}

describe('mf.pf.allocation-drift', () => {
  it('is a portfolio-scope rule in the ALLOCATION category', () => {
    expect(pfAllocationDriftRule.id).toBe('mf.pf.allocation-drift');
    expect(pfAllocationDriftRule.scope).toBe('PORTFOLIO');
    expect(pfAllocationDriftRule.category).toBe('ALLOCATION');
  });

  it('is silent with no model portfolio — not "0% drift"', () => {
    // No risk profile assessment means no active ModelPortfolioVersion, so
    // there is no model to be away from. Silence is the only honest answer.
    expect(pfAllocationDriftRule.evaluate(factsWithTarget(null))).toEqual([]);
  });

  it('fires when a bucket is outside the rebalance band', () => {
    const findings = pfAllocationDriftRule.evaluate(factsWithTarget(driftedTarget('12.000000')));

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('ALLOCATION_DRIFT');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('ALLOCATION');
    expect(finding.schemeCode).toBeNull();
    expect(finding.headline).toContain('EQUITY');
    expect(finding.headline).toContain('12.0pp above');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('reports the direction of the drift', () => {
    const under = pfAllocationDriftRule.evaluate(factsWithTarget(driftedTarget('-9.000000')))[0]!;

    expect(under.headline).toContain('9.0pp below');
  });

  it('does not fire one notch below the band', () => {
    // `REBALANCE_BAND_PP` is 5 and the trigger is strictly outside it, so a
    // 5pp drift is inside tolerance even though `04 §3` listed the bucket.
    expect(pfAllocationDriftRule.evaluate(factsWithTarget(driftedTarget('5.000000')))).toEqual([]);
  });

  it('reads the band from facts.constants', () => {
    const facts = factsWithTarget(driftedTarget('12.000000'), {
      constants: { allocationDriftBandPp: 15 },
    });

    expect(pfAllocationDriftRule.evaluate(facts)).toEqual([]);
  });

  it('stays silent when nothing is outside tolerance', () => {
    // `04 §3` computed the comparison and found no breach. The rule defers to
    // that list rather than re-deriving it, so the two surfaces agree.
    expect(pfAllocationDriftRule.evaluate(factsWithTarget(makeAllocationComparison()))).toEqual([]);
  });

  it('stays silent when a flagged bucket has no drift figure to cite', () => {
    const target = makeAllocationComparison({ outsideTolerance: ['GOLD'] });

    // GOLD has no entry in `drift`. A finding whose evidence cannot be filled
    // is one nobody can dispute, so the bucket is dropped.
    expect(pfAllocationDriftRule.evaluate(factsWithTarget(target))).toEqual([]);
  });

  it('names the band in whatWouldChangeThis', () => {
    const finding = pfAllocationDriftRule.evaluate(factsWithTarget(driftedTarget('12.000000')))[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('5 percentage points');
    expect(finding.whatWouldChangeThis).toContain('BALANCED');
  });

  it('calls the drift a floor under a partial family scope', () => {
    const facts = factsWithTarget(driftedTarget('12.000000'), {
      portfolio: { scope: makePartialScope() },
    });

    const finding = pfAllocationDriftRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis).toContain('floor');
  });
});
