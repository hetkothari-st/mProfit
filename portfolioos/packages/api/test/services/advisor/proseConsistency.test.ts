import { describe, it, expect } from 'vitest';
import {
  assertProseConsistency,
  extractNumericTokens,
} from '../../../src/services/advisor/proseConsistency.js';

describe('extractNumericTokens', () => {
  it('normalises rupee formatting away', () => {
    expect(extractNumericTokens('Sell ₹3,20,000 of it')).toEqual(['320000']);
    expect(extractNumericTokens('Sell 320000 of it')).toEqual(['320000']);
    expect(extractNumericTokens('Sell Rs. 3,20,000 of it')).toEqual(['320000']);
  });

  it('normalises Indian scale words to the same value', () => {
    expect(extractNumericTokens('₹3.2 lakh')).toEqual(['320000']);
    expect(extractNumericTokens('3.2 lakhs')).toEqual(['320000']);
    expect(extractNumericTokens('1.5 crore')).toEqual(['15000000']);
    expect(extractNumericTokens('1.5 cr')).toEqual(['15000000']);
  });

  it('strips trailing zeros so 320000.00 and 320000 are one token', () => {
    expect(extractNumericTokens('₹320000.00')).toEqual(extractNumericTokens('320000'));
    expect(extractNumericTokens('12.50%')).toEqual(['12.5']);
  });

  it('picks up percentages and bare unit counts', () => {
    expect(extractNumericTokens('30% overweight, sell 412.5 units')).toEqual(['30', '412.5']);
  });

  it('de-duplicates by value, keeping first appearance order', () => {
    expect(extractNumericTokens('₹5,000 then 5000 then 8%')).toEqual(['5000', '8']);
  });

  it('does not mistake identifiers or version strings for figures', () => {
    expect(extractNumericTokens('scheme INF109K012B7 on engine v1.2.3')).toEqual([]);
  });

  it('ignores ordinals, which can never be a money claim', () => {
    expect(extractNumericTokens('the 1st and 2nd legs')).toEqual([]);
  });

  it('does NOT ignore years — a fabricated horizon is a fabricated figure', () => {
    expect(extractNumericTokens('matures in 2035')).toEqual(['2035']);
  });

  it('returns nothing for text with no figures', () => {
    expect(extractNumericTokens('Rebalance your portfolio.')).toEqual([]);
    expect(extractNumericTokens('')).toEqual([]);
  });
});

describe('assertProseConsistency', () => {
  it('accepts prose that narrates only computed figures', () => {
    const rationale =
      'EQUITY_DOMESTIC is 30.0pp above its 40% target. Sell ₹3,20,000 (412.5 units).';
    const prose =
      'Your domestic equity sits 30 percentage points above the 40% target, so trim ₹3,20,000 — about 412.5 units.';
    expect(assertProseConsistency(rationale, prose)).toEqual({ ok: true, offending: [] });
  });

  it('accepts prose that leaves figures out', () => {
    const rationale = 'Sell ₹3,20,000 of Fund A, 30% over a 40% target, 412.5 units.';
    const prose = 'Trim ₹3,20,000 from Fund A.';
    expect(assertProseConsistency(rationale, prose).ok).toBe(true);
  });

  it('accepts a differently formatted version of the same figure', () => {
    const rationale = 'Sell ₹3,20,000 of Fund A.';
    const prose = 'Trim about 3.2 lakh from Fund A.';
    expect(assertProseConsistency(rationale, prose).ok).toBe(true);
  });

  it('REJECTS a rupee figure the engine never computed', () => {
    const rationale = 'EQUITY_DOMESTIC is 30pp above target. Sell ₹3,20,000.';
    const prose =
      'Trim ₹3,20,000 from domestic equity — that should save you roughly ₹45,000 in tax this year.';
    const result = assertProseConsistency(rationale, prose);
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['₹45,000']);
  });

  it('rejects an invented percentage', () => {
    const rationale = 'Sell ₹3,20,000 of Fund A.';
    const prose = 'Trim ₹3,20,000 of Fund A, which should lift returns by 2% a year.';
    const result = assertProseConsistency(rationale, prose);
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['2%']);
  });

  it('rejects an invented unit count', () => {
    const rationale = 'Sell ₹10,000. Units unavailable: the price is stale.';
    const prose = 'Sell ₹10,000, roughly 40 units.';
    const result = assertProseConsistency(rationale, prose);
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['40']);
  });

  it('rejects a rounded restatement of a computed figure', () => {
    const rationale = 'Sell ₹3,21,450 of Fund A.';
    const prose = 'Sell about ₹3,20,000 of Fund A.';
    expect(assertProseConsistency(rationale, prose).ok).toBe(false);
  });

  it('rejects an invented horizon year', () => {
    const rationale = 'Goal shortfall of ₹5,00,000 remains.';
    const prose = 'You are ₹5,00,000 short, which you should close by 2035.';
    const result = assertProseConsistency(rationale, prose);
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['2035']);
  });

  it('reports each offending value once, quoted as it appears in the prose', () => {
    const rationale = 'Sell ₹10,000.';
    const prose = 'Sell ₹10,000. You may save ₹45,000. Really, ₹45,000.';
    const result = assertProseConsistency(rationale, prose);
    expect(result.offending).toEqual(['₹45,000']);
  });

  it('accepts prose with no figures at all', () => {
    expect(assertProseConsistency('Sell ₹10,000.', 'Consider trimming this holding.')).toEqual({
      ok: true,
      offending: [],
    });
  });

  it('accepts ordinals in the prose that the rationale never mentions', () => {
    expect(assertProseConsistency('Sell ₹10,000.', 'This is the 1st of two steps: sell ₹10,000.').ok).toBe(true);
  });

  it('treats an empty rationale as permitting no figures at all', () => {
    const result = assertProseConsistency('', 'Sell ₹10,000.');
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['₹10,000']);
  });
});
