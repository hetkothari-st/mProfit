/**
 * `mf.people.manager-change` — fires when the current line-up took over inside
 * `managerChangeLookbackMonths`.
 *
 * The boundary case is the one worth having: at exactly 12 months the record we
 * rate is the current manager's, so the finding must stop. An off-by-one here
 * would leave a NOTICE on a fund for thirteen months and make "clears after 12
 * months" a false statement in the counterfactual.
 */

import { describe, it, expect } from 'vitest';
import { peopleManagerChangeRule } from '../../../../src/services/mfAnalytics/rules/people.manager-change.js';
import { factsForFund, isoMonthsFromAsOf } from './_facts.fixture.js';

function evaluateWithManagerFrom(fromDate: string | null) {
  const { facts, schemeCode } = factsForFund({
    profile: {
      currentManagers:
        fromDate === null ? [] : [{ name: 'N. Manager', role: 'LEAD', fromDate }],
    },
  });
  return peopleManagerChangeRule.evaluate(facts, schemeCode);
}

describe('mf.people.manager-change', () => {
  it('fires when the manager took over inside the lookback window', () => {
    const found = evaluateWithManagerFrom(isoMonthsFromAsOf(-6));

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('MANAGER_CHANGE');
    expect(found[0]!.severity).toBe('NOTICE');
    expect(found[0]!.category).toBe('PEOPLE');
    expect(found[0]!.evidence.length).toBeGreaterThan(0);
  });

  it('stays silent one notch the other side of the boundary', () => {
    // 11 months: still inside. 12 months: the lookback is exclusive, so the
    // finding must already have cleared.
    expect(evaluateWithManagerFrom(isoMonthsFromAsOf(-11))).toHaveLength(1);
    expect(evaluateWithManagerFrom(isoMonthsFromAsOf(-12))).toEqual([]);
  });

  it('names the takeover date and the 12-month clearing period', () => {
    const changedOn = isoMonthsFromAsOf(-3);
    const counterfactual = evaluateWithManagerFrom(changedOn)[0]!.whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    // The year proves the template interpolated a real date rather than
    // hard-coding prose around a threshold.
    expect(counterfactual).toContain(changedOn.slice(0, 4));
    expect(counterfactual).toContain('12 months');
  });

  it('is silent when the input is missing rather than guessing', () => {
    // No profile at all.
    const { facts, schemeCode } = factsForFund({ profile: null });
    expect(peopleManagerChangeRule.evaluate(facts, schemeCode)).toEqual([]);

    // A profile with no manager list — the fixture's default. We cannot name a
    // date, so we say nothing rather than reconstruct one by subtracting a
    // rounded tenure from `asOf`.
    expect(evaluateWithManagerFrom(null)).toEqual([]);
  });

  it('does not fire on a manager dated after the run instant', () => {
    // A future `fromDate` is a data-entry error. A finding whose "took over"
    // date has not happened yet is worse than no finding.
    expect(evaluateWithManagerFrom(isoMonthsFromAsOf(2))).toEqual([]);
  });
});
