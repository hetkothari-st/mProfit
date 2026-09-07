/**
 * `mf.user.ltcg-approaching` — STCG lots about to become long-term.
 *
 * The loss case is the one that matters. `05 §4` requires `gain > 0`, and not
 * as a tidiness rule: a short-term capital loss can be set off against both
 * short- and long-term gains while a long-term loss can only offset long-term
 * gains, so waiting for the flip on a losing lot *narrows* what the loss can
 * do. Firing there would be advice that costs the user money.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney } from '@portfolioos/shared';
import type { MfGainType, Money } from '@portfolioos/shared';
import { userLtcgApproachingRule } from '../../../../src/services/mfAnalytics/rules/user.ltcg-approaching.js';
import { factsForFund, isoDaysFromAsOf, makeLot } from './_facts.fixture.js';

interface Case {
  daysToLtcg?: number | null;
  gain?: Money;
  gainType?: MfGainType;
}

function evaluate({ daysToLtcg = 30, gain = serializeMoney(40000), gainType = 'STCG' }: Case = {}) {
  const lots = [
    makeLot({
      purchaseDate: isoDaysFromAsOf(-335),
      holdingDays: 335,
      gainType,
      daysToLtcg,
      gain,
    }),
  ];
  const { facts, schemeCode } = factsForFund({ held: { lots } });
  return userLtcgApproachingRule.evaluate(facts, schemeCode);
}

describe('mf.user.ltcg-approaching', () => {
  it('fires on a gaining STCG lot inside the window', () => {
    const found = evaluate();

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('LTCG_FLIP_SOON');
    expect(found[0]!.severity).toBe('INFO');
    expect(found[0]!.category).toBe('USER');
  });

  it('stays silent one day the far side of the window', () => {
    expect(evaluate({ daysToLtcg: 45 })).toHaveLength(1);
    expect(evaluate({ daysToLtcg: 46 })).toEqual([]);
  });

  it('does NOT fire on a losing lot, whatever the flip date', () => {
    // Flipping a loss to long-term narrows what it can be set off against and
    // saves no tax. `05 §4`'s "gain > 0" is doing real work here.
    expect(evaluate({ gain: serializeMoney(-5000) })).toEqual([]);
    // Break-even too: there is nothing to convert.
    expect(evaluate({ gain: serializeMoney(0) })).toEqual([]);
  });

  it('names the flip date in the counterfactual', () => {
    const counterfactual = evaluate()[0]!.whatWouldChangeThis;
    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toMatch(/^Clears on \d{1,2} [A-Z][a-z]{2} \d{4},/);
  });

  it('is silent when the input is missing or the lot is already long-term', () => {
    // Null `daysToLtcg` on a lot we were told is STCG means we could not
    // compute the flip date; there is no date to quote.
    expect(evaluate({ daysToLtcg: null })).toEqual([]);
    // Already LTCG: nothing is approaching.
    expect(evaluate({ gainType: 'LTCG', daysToLtcg: null })).toEqual([]);
    // No lots at all — the fixture's default.
    const { facts, schemeCode } = factsForFund({ held: { lots: [] } });
    expect(userLtcgApproachingRule.evaluate(facts, schemeCode)).toEqual([]);
  });
});
