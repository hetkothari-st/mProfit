/**
 * `mf.people.amc-action` — a curated regulatory-action fact inside the
 * three-year lookback.
 *
 * The `code` assertion below is doing real work: `05 §5` row 2 matches
 * `AMC_REGULATORY_ACTION` by value to escalate a fund toward
 * `SWITCH_CANDIDATE`. A typo in the code string would fail no other test — it
 * would just silently sever that escalation path.
 */

import { describe, it, expect } from 'vitest';
import { peopleAmcActionRule } from '../../../../src/services/mfAnalytics/rules/people.amc-action.js';
import { factsForFund, isoMonthsFromAsOf, makeQualitativeFact } from './_facts.fixture.js';

const ACTION = 'AMC_REGULATORY_ACTION';

function evaluateWithFacts(entries: Array<{ factType: string; validFrom: string }>) {
  const { facts, schemeCode } = factsForFund({
    qualitative: entries.map((e) => makeQualitativeFact(e)),
  });
  return peopleAmcActionRule.evaluate(facts, schemeCode);
}

describe('mf.people.amc-action', () => {
  it('fires on a regulatory action inside the lookback window', () => {
    const found = evaluateWithFacts([{ factType: ACTION, validFrom: isoMonthsFromAsOf(-12) }]);

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe(ACTION);
    expect(found[0]!.severity).toBe('WARNING');
    expect(found[0]!.category).toBe('PEOPLE');
  });

  it('stays silent one month the other side of the three-year boundary', () => {
    // 36 months: the last month it still counts. 37: outside.
    expect(
      evaluateWithFacts([{ factType: ACTION, validFrom: isoMonthsFromAsOf(-36) }]),
    ).toHaveLength(1);
    expect(evaluateWithFacts([{ factType: ACTION, validFrom: isoMonthsFromAsOf(-37) }])).toEqual([]);
  });

  it('emits one finding for several actions, and names the most recent', () => {
    // `makeFinding` derives a deterministic id from (rule, scheme, code), so
    // two findings from one rule for one scheme would collide on that key.
    const recent = isoMonthsFromAsOf(-2);
    const found = evaluateWithFacts([
      { factType: ACTION, validFrom: isoMonthsFromAsOf(-30) },
      { factType: ACTION, validFrom: recent },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]!.headline).toContain(recent.slice(0, 4));
  });

  it('names the action date and the three-year threshold', () => {
    const validFrom = isoMonthsFromAsOf(-6);
    const counterfactual = evaluateWithFacts([{ factType: ACTION, validFrom }])[0]!
      .whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain(validFrom.slice(0, 4));
    expect(counterfactual).toContain('3 years');
  });

  it('is silent when there is no such fact', () => {
    // No qualitative facts at all.
    expect(evaluateWithFacts([])).toEqual([]);

    // A different fact type in force is not a regulatory action.
    expect(
      evaluateWithFacts([{ factType: 'STRATEGY_CAPACITY_CAP', validFrom: isoMonthsFromAsOf(-1) }]),
    ).toEqual([]);

    // A future-dated action is a data-entry error, not news.
    expect(evaluateWithFacts([{ factType: ACTION, validFrom: isoMonthsFromAsOf(3) }])).toEqual([]);
  });
});
