/**
 * `mf.user.exit-load-window` — units still inside the scheme's exit-load ladder.
 *
 * The null test is the important one. `MfLotDto.exitLoadPct`'s doc comment is
 * explicit that null means "we do not know this scheme's exit load, not that it
 * is zero". Reading a null as 0% would make this rule silently certify "no load
 * applies" for every scheme whose load text we failed to parse — the most
 * expensive way to be wrong, because the user acts on it by selling.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney, serializePct } from '@portfolioos/shared';
import type { MfExitLoadRule, Pct } from '@portfolioos/shared';
import { userExitLoadWindowRule } from '../../../../src/services/mfAnalytics/rules/user.exit-load-window.js';
import { factsForFund, isoDaysFromAsOf, makeLot } from './_facts.fixture.js';

const LADDER: MfExitLoadRule[] = [{ daysUpTo: 365, pct: serializePct(1) }];

interface Case {
  exitLoadRules?: MfExitLoadRule[] | null;
  exitLoadPct?: Pct | null;
}

function evaluate({ exitLoadRules = LADDER, exitLoadPct = serializePct(1) }: Case = {}) {
  const lots = [
    // Inside the ladder: bought 100 days ago.
    makeLot({
      purchaseDate: isoDaysFromAsOf(-100),
      holdingDays: 100,
      gainType: 'STCG',
      daysToLtcg: 265,
      exitLoadPct,
      exitLoadInr: exitLoadPct === null ? null : serializeMoney(1400),
    }),
    // Long past it: three years old, load known to be zero.
    makeLot({
      purchaseDate: isoDaysFromAsOf(-1100),
      holdingDays: 1100,
      exitLoadPct: serializePct(0),
      exitLoadInr: serializeMoney(0),
    }),
  ];
  const { facts, schemeCode } = factsForFund({ meta: { exitLoadRules }, held: { lots } });
  return userExitLoadWindowRule.evaluate(facts, schemeCode);
}

describe('mf.user.exit-load-window', () => {
  it('fires when a lot is still inside the ladder', () => {
    const found = evaluate();

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('EXIT_LOAD_ACTIVE');
    expect(found[0]!.severity).toBe('INFO');
    expect(found[0]!.category).toBe('USER');
    // One finding per fund, not per lot: `makeFinding`'s id is
    // (rule, scheme, code) and two would collide on it.
    expect(found[0]!.headline).toContain('1 of 2 lots');
  });

  it('stays silent when the load has fallen to a known zero', () => {
    expect(evaluate({ exitLoadPct: serializePct('0.01') })).toHaveLength(1);
    expect(evaluate({ exitLoadPct: serializePct(0) })).toEqual([]);
  });

  it('treats a null exit load as UNKNOWN, not as zero — and stays silent', () => {
    // Silence is the honest answer: we cannot assert a charge we have not
    // measured, and we must not certify the absence of one either.
    expect(evaluate({ exitLoadPct: null })).toEqual([]);
  });

  it('names the clearing date and the ladder length', () => {
    const counterfactual = evaluate()[0]!.whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toMatch(/^Clears on \d{1,2} [A-Z][a-z]{2} \d{4},/);
    expect(counterfactual).toContain('365-day');
  });

  it('is silent without the ladder that produces the clearing date', () => {
    // A counterfactual that is entirely a date cannot be built from a per-lot
    // percentage alone, and reconstructing the ladder would be a guess.
    expect(evaluate({ exitLoadRules: null })).toEqual([]);
    expect(evaluate({ exitLoadRules: [] })).toEqual([]);
  });
});
