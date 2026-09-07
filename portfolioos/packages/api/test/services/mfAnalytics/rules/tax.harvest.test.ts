/**
 * `mf.tax.harvest` — a loss worth realising, outside any exit-load window.
 *
 * Two conditions and one refusal are under test:
 *
 *  - the loss must clear `minHarvestInr`, because a taxable event has a cost of
 *    its own;
 *  - a lot with a KNOWN, positive exit load is excluded, because harvesting
 *    into a load can cost more than the tax it saves (`05 §4`);
 *  - a lot with an UNKNOWN load is neither excluded nor treated as free — it is
 *    counted, disclosed, and taken off the confidence.
 *
 * Tax figures are never computed here. `MfLotDto.taxIfSoldTodayInr` already
 * carries the statutory-rate number (`CONTEXT.md §9.8`), and it is null for
 * non-equity STCG because the slab is unknowable — a case the rule must not
 * turn into a zero.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney, serializePct } from '@portfolioos/shared';
import type { Money, Pct } from '@portfolioos/shared';
import { taxHarvestRule } from '../../../../src/services/mfAnalytics/rules/tax.harvest.js';
import { factsForFund, makeLot } from './_facts.fixture.js';

interface Case {
  harvestableLossInr?: Money | null;
  exitLoadPct?: Pct | null;
  taxIfSoldTodayInr?: Money | null;
}

function evaluate({
  harvestableLossInr = serializeMoney(20000),
  exitLoadPct = serializePct(0),
  taxIfSoldTodayInr = serializeMoney(0),
}: Case = {}) {
  const lots = [
    makeLot({
      cost: serializeMoney(100000),
      currentValue: serializeMoney(80000),
      gain: serializeMoney(-20000),
      harvestableLossInr,
      exitLoadPct,
      exitLoadInr: exitLoadPct === null ? null : serializeMoney(0),
      taxIfSoldTodayInr,
    }),
  ];
  const { facts, schemeCode } = factsForFund({ held: { lots } });
  return taxHarvestRule.evaluate(facts, schemeCode);
}

describe('mf.tax.harvest', () => {
  it('fires on a material loss outside any exit-load window', () => {
    const found = evaluate();

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('TAX_HARVEST_OPPORTUNITY');
    expect(found[0]!.severity).toBe('NOTICE');
    expect(found[0]!.category).toBe('TAX');
  });

  it('stays silent one notch below the harvest floor', () => {
    expect(evaluate({ harvestableLossInr: serializeMoney('5000.01') })).toHaveLength(1);
    // The trigger is `> 5000`, so exactly the floor is not worth a taxable event.
    expect(evaluate({ harvestableLossInr: serializeMoney(5000) })).toEqual([]);
  });

  it('does not fire on a lot inside a known exit-load window', () => {
    // Harvesting into a load can cost more than the tax it saves, so the lot is
    // excluded from the total rather than merely footnoted.
    expect(evaluate({ exitLoadPct: serializePct(1) })).toEqual([]);
  });

  it('counts an unknown exit load but says so and lowers confidence', () => {
    const known = evaluate({ exitLoadPct: serializePct(0) });
    const unknown = evaluate({ exitLoadPct: null });

    expect(unknown).toHaveLength(1);
    expect(Number.parseFloat(unknown[0]!.confidence)).toBeLessThan(
      Number.parseFloat(known[0]!.confidence),
    );
    expect(unknown[0]!.whatWouldChangeThis).toContain('exit load');
  });

  it('handles a null statutory tax figure without inventing a zero', () => {
    // Non-equity STCG: `taxIfSoldTodayInr` is null because the slab is not on
    // file. The finding still stands — the loss is rate-independent — but no
    // tax evidence row is emitted.
    const found = evaluate({ taxIfSoldTodayInr: null });

    expect(found).toHaveLength(1);
    expect(found[0]!.evidence.some((e) => e.metric === 'lots.taxIfSoldTodayInr')).toBe(false);
  });

  it('names the harvest floor in the counterfactual', () => {
    const counterfactual = evaluate()[0]!.whatWouldChangeThis;
    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('5,000');
    expect(counterfactual).toContain('exit-load');
  });

  it('is silent when there is no loss', () => {
    // Null means "no loss on this lot", not "a zero loss".
    expect(evaluate({ harvestableLossInr: null })).toEqual([]);

    const { facts, schemeCode } = factsForFund({ held: { lots: [] } });
    expect(taxHarvestRule.evaluate(facts, schemeCode)).toEqual([]);
  });
});
