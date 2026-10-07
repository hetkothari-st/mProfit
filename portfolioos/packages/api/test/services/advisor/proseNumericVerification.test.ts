/**
 * The MF extension of `proseConsistency.ts`
 * (`docs/mf-analytics/05-FINDINGS-ENGINE.md §6.3`, `06 §4`).
 *
 * This file guards the anti-hallucination mechanism itself, at the level where
 * it is a pure function: no database, no model, no job. Three properties, in
 * descending order of how badly a regression would hurt:
 *
 *  1. **A fabricated figure is caught.** Including a near-miss — a number that
 *     differs from a real one only in the last decimal — because "close to a
 *     real number" is the shape a hallucination actually takes when a model is
 *     copying from a payload full of figures.
 *  2. **A legitimate rounding is NOT caught.** A guard that rejects "1.18" for
 *     a stored `1.184321` gets disabled by the first person it inconveniences,
 *     and then nothing is guarded at all.
 *  3. **The grammar reaches everything the MF payload contains.** Indian digit
 *     grouping, and the ₹, %, x and pp suffixes this surface writes.
 *
 * The advisor's own `assertProseConsistency` is asserted UNCHANGED here too:
 * it is the guard on the one prescriptive surface in the codebase, and the
 * extension must not have loosened it as a side effect.
 */

import { describe, it, expect } from 'vitest';
import {
  assertProseConsistency,
  extractNumericTokens,
  findAdvisoryImperatives,
  verifyProseNumbers,
} from '../../../src/services/advisor/proseConsistency.js';

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

describe('numeric token grammar — MF additions', () => {
  it('reads a capture ratio written with an x suffix', () => {
    expect(extractNumericTokens('down-capture of 1.18x')).toEqual(['1.18']);
  });

  it('reads a percentage-point gap written with pp', () => {
    expect(extractNumericTokens('5 pp worse than the category')).toEqual(['5']);
    expect(extractNumericTokens('5pp worse')).toEqual(['5']);
  });

  it('reads Indian digit grouping, with and without the rupee sign', () => {
    expect(extractNumericTokens('₹1,23,456.78')).toEqual(['123456.78']);
    expect(extractNumericTokens('123456.78')).toEqual(['123456.78']);
  });

  it('leaves the advisor grammar it shares otherwise untouched', () => {
    // The x/pp additions are suffixes, not scales: they change the surface a
    // rejection quotes and never the value it compares.
    expect(extractNumericTokens('Sell ₹3,20,000 — 3.2 lakh — at 12.50%')).toEqual(['320000', '12.5']);
    expect(extractNumericTokens('scheme INF109K012B7 on engine v1.2.3')).toEqual([]);
    expect(extractNumericTokens('the 1st and 2nd legs')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The headline behaviour: fabricated figures
// ---------------------------------------------------------------------------

const EVIDENCE = JSON.stringify({
  schemeName: 'Fixture Large Cap Fund - Direct - Growth',
  findings: [
    {
      headline: 'Captured 118% of benchmark losses (category median 96%)',
      whatWouldChangeThis: 'Would clear at down-capture 1.10 or lower',
      evidence: [{ metric: 'capture.down', value: '1.184321', categoryMedian: '0.960000' }],
    },
  ],
  holding: { currentValue: '520000.0000', absoluteGain: '120000.0000' },
});

describe('verifyProseNumbers — fabrication', () => {
  it('REJECTS a rupee figure the engine never computed', () => {
    const result = verifyProseNumbers({
      allowed: [EVIDENCE],
      prose: 'Your fund passed on 118% of the benchmark falls, which cost you about ₹45,000.',
    });
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['₹45,000']);
  });

  it('REJECTS a near miss — a figure differing only in the last decimal', () => {
    // The dangerous case. 1.184322 is not in the payload; 1.184321 is. A model
    // that mistypes a digit while copying produces exactly this, and a guard
    // that let it through would be worse than no guard, because it would be
    // trusted.
    const result = verifyProseNumbers({
      allowed: [EVIDENCE],
      prose: 'Down-capture came in at 1.184322x against a category median of 0.96.',
    });
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['1.184322x']);
  });

  it('REJECTS precision the evidence never had', () => {
    // The prose claims four decimals about a value stored with two. Rounding
    // tolerance runs one way only: dropping digits is narration, adding them
    // is invention.
    const result = verifyProseNumbers({ allowed: ['1.18'], prose: 'a ratio of 1.1804' });
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['1.1804']);
  });

  it('names EVERY distinct offending token, once each, in order of appearance', () => {
    const result = verifyProseNumbers({
      allowed: [EVIDENCE],
      prose: 'It lost ₹45,000 and trails by 7 points; the ₹45,000 is the part that matters.',
    });
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(['₹45,000', '7']);
  });
});

// ---------------------------------------------------------------------------
// Rounding tolerance
// ---------------------------------------------------------------------------

describe('verifyProseNumbers — rounding tolerance', () => {
  it('ACCEPTS a figure rounded to fewer decimals than the evidence carries', () => {
    // 1.184321 displayed as 1.18 is the single most common legitimate case:
    // the engine stores six decimals and no human narration would repeat them.
    const result = verifyProseNumbers({
      allowed: [EVIDENCE],
      prose: 'Down-capture was 1.18x against a category median of 0.96.',
    });
    expect(result.ok).toBe(true);
    expect(result.offending).toEqual([]);
  });

  it('ACCEPTS a whole-number rounding of a fractional figure', () => {
    expect(verifyProseNumbers({ allowed: ['118.4'], prose: 'about 118%' }).ok).toBe(true);
  });

  it('ACCEPTS either half-up or half-even on an exact tie', () => {
    // Only a value sitting exactly on .5 can distinguish the two, and the
    // narration is copying from headlines several formatters produced.
    expect(verifyProseNumbers({ allowed: ['1.125'], prose: '1.13' }).ok).toBe(true);
    expect(verifyProseNumbers({ allowed: ['1.125'], prose: '1.12' }).ok).toBe(true);
  });

  it('ACCEPTS a rupee amount restated in Indian grouping or in lakh', () => {
    const result = verifyProseNumbers({
      allowed: [EVIDENCE],
      prose: 'The position is worth ₹5,20,000 today, of which ₹1,20,000 is gain.',
    });
    expect(result.ok).toBe(true);
  });

  it('exact mode refuses the rounding that displayed-precision allows', () => {
    // The advisor's mode. Asserted here so the two tolerances cannot quietly
    // converge: the prescriptive surface must stay strict.
    expect(
      verifyProseNumbers({ allowed: ['1.184321'], prose: '1.18', tolerance: 'exact' }).ok,
    ).toBe(false);
    expect(verifyProseNumbers({ allowed: ['1.184321'], prose: '1.18' }).ok).toBe(true);
  });

  it('accepts prose that names no figures at all', () => {
    const result = verifyProseNumbers({ allowed: [EVIDENCE], prose: 'The fund lagged its peers.' });
    expect(result).toEqual({ ok: true, offending: [], matched: [] });
  });

  it('is sign-blind: a magnitude narrated without its minus still matches', () => {
    // "gave back 22.4% at the worst point" narrating a stored -22.4 is correct
    // English about a correct number.
    expect(verifyProseNumbers({ allowed: ['-22.400000'], prose: 'fell 22.4% at worst' }).ok).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Advisory imperatives (`06 §4`)
// ---------------------------------------------------------------------------

describe('findAdvisoryImperatives', () => {
  it('catches a bare instruction opening a sentence', () => {
    expect(findAdvisoryImperatives('Sell this fund and move on.').length).toBeGreaterThan(0);
    expect(
      findAdvisoryImperatives('The fund lagged badly. Switch to the direct plan.').length,
    ).toBeGreaterThan(0);
  });

  it('catches a hedged instruction', () => {
    expect(findAdvisoryImperatives('You should sell this fund.').length).toBeGreaterThan(0);
    expect(
      findAdvisoryImperatives('You may want to seriously consider switching out of it.').length,
    ).toBeGreaterThan(0);
    expect(findAdvisoryImperatives('We recommend redeeming your units.').length).toBeGreaterThan(0);
    expect(
      findAdvisoryImperatives('Consider moving to the direct plan of the same fund.').length,
    ).toBeGreaterThan(0);
  });

  it('does NOT catch descriptive prose, including the engine own counterfactuals', () => {
    // These are deterministic strings the rules themselves wrote. If the
    // detector flagged them, the compliant phrasing of a real finding would be
    // un-narratable and the layer would produce nothing at all.
    expect(findAdvisoryImperatives('Switching to the direct plan saves about 4,200 a year.')).toEqual(
      [],
    );
    expect(
      findAdvisoryImperatives(
        'Your fund captured 118% of the benchmark fall. This would clear at a down-capture of 1.10 or lower.',
      ),
    ).toEqual([]);
    expect(
      findAdvisoryImperatives('The expense ratio is increasing relative to its category.'),
    ).toEqual([]);
    expect(
      findAdvisoryImperatives('Track record before March 2025 belongs to the previous manager.'),
    ).toEqual([]);
  });

  it('returns [] for empty input rather than throwing', () => {
    expect(findAdvisoryImperatives('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The advisor's own guard, unchanged
// ---------------------------------------------------------------------------

describe('assertProseConsistency is unaffected by the MF extension', () => {
  it('still rejects a figure absent from the rationale', () => {
    const result = assertProseConsistency(
      'EQUITY_DOMESTIC is 30pp above target. Sell ₹3,20,000.',
      'Trim ₹3,20,000 — that saves roughly ₹45,000 in tax.',
    );
    expect(result).toEqual({ ok: false, offending: ['₹45,000'] });
  });

  it('still accepts a differently formatted version of the same figure', () => {
    expect(assertProseConsistency('Sell ₹3,20,000.', 'Trim about 3.2 lakh.').ok).toBe(true);
  });
});
