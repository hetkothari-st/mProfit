/**
 * `mf.data.stale-holdings` — the portfolio disclosure behind every structural
 * figure is older than the staleness threshold.
 *
 * A finding about our data rather than about the fund. The `snapshotAsOf ===
 * null` case is deliberately silent: "no disclosure at all" is a different
 * state from "an old one", and a finding claiming a null snapshot is N days
 * stale would have to invent N.
 */

import { describe, it, expect } from 'vitest';
import { dataStaleHoldingsRule } from '../../../../src/services/mfAnalytics/rules/data.stale-holdings.js';
import { factsForFund, isoDaysFromAsOf } from './_facts.fixture.js';

function evaluate(snapshotAsOf: string | null) {
  const { facts, schemeCode } = factsForFund({ profile: { snapshotAsOf } });
  return dataStaleHoldingsRule.evaluate(facts, schemeCode);
}

describe('mf.data.stale-holdings', () => {
  it('fires when the latest disclosure is older than the threshold', () => {
    const found = evaluate(isoDaysFromAsOf(-90));

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('STALE_HOLDINGS_DATA');
    expect(found[0]!.severity).toBe('INFO');
    expect(found[0]!.category).toBe('DATA');
    expect(found[0]!.headline).toContain('90 days old');
  });

  it('stays silent one day the fresh side of the threshold', () => {
    // The trigger is `> 60`, so a disclosure exactly 60 days old is fine.
    expect(evaluate(isoDaysFromAsOf(-61))).toHaveLength(1);
    expect(evaluate(isoDaysFromAsOf(-60))).toEqual([]);
  });

  it('names the threshold and the disclosure date', () => {
    const snapshot = isoDaysFromAsOf(-90);
    const counterfactual = evaluate(snapshot)[0]!.whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('60 days');
    expect(counterfactual).toContain(snapshot.slice(0, 4));
  });

  it('is silent when there is no disclosure to age', () => {
    // Null snapshot: a different state, carried to the UI by
    // `MfLookThrough.fundsWithoutHoldings` rather than by this rule.
    expect(evaluate(null)).toEqual([]);

    // No profile at all.
    const { facts, schemeCode } = factsForFund({ profile: null });
    expect(dataStaleHoldingsRule.evaluate(facts, schemeCode)).toEqual([]);
  });

  it('does not fire on a disclosure dated after the run instant', () => {
    // A negative age is a data problem, not staleness.
    expect(evaluate(isoDaysFromAsOf(10))).toEqual([]);
  });
});
