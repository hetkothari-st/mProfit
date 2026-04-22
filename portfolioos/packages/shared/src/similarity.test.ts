import { describe, it, expect } from 'vitest';
import { levenshtein, normaliseForSimilarity, similarityRatio } from './similarity.js';

describe('normaliseForSimilarity', () => {
  it('lowercases and trims', () => {
    expect(normaliseForSimilarity('  Rajesh Kumar  ')).toBe('rajesh kumar');
  });

  it('strips punctuation, honorifics, and collapses whitespace', () => {
    expect(normaliseForSimilarity('Mr. Rajesh-K.  Kumar')).toBe('rajesh k kumar');
    expect(normaliseForSimilarity('Smt. Kavita Shah')).toBe('kavita shah');
  });

  it('keeps digits (account-number style counterparties)', () => {
    expect(normaliseForSimilarity('UPI/123456/rajesh')).toBe('upi 123456 rajesh');
  });
});

describe('levenshtein', () => {
  it('identical strings → 0', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('empty string distance = length of other', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('classic kitten/sitting example → 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('symmetric', () => {
    expect(levenshtein('rajesh', 'rakesh')).toBe(levenshtein('rakesh', 'rajesh'));
  });
});

describe('similarityRatio', () => {
  it('identical (after normalisation) → 1', () => {
    expect(similarityRatio('Rajesh Kumar', 'rajesh kumar')).toBe(1);
    // Honorifics are stripped, so "Mr. Rajesh Kumar" also normalises to
    // "rajesh kumar" and matches exactly — which is what we want for
    // bank-alert counterparties.
    expect(similarityRatio('Mr. Rajesh Kumar', 'rajesh kumar')).toBe(1);
  });

  it('completely different → 0 or very low', () => {
    expect(similarityRatio('abcdef', 'zzzzzz')).toBeLessThanOrEqual(0.1);
  });

  it('empty input on either side → 0 (no match signal)', () => {
    expect(similarityRatio('', 'rajesh')).toBe(0);
    expect(similarityRatio('rajesh', '')).toBe(0);
    expect(similarityRatio('   ', 'rajesh')).toBe(0);
  });

  it('§8.2 example: "MR RAJESH K" vs "Rajesh Kumar" clears 0.5', () => {
    // After normalisation: "mr rajesh k" (11 chars) vs "rajesh kumar" (12 chars).
    // This is the kind of mangling bank alerts produce and the spec
    // requires >=50% similarity to auto-match.
    expect(similarityRatio('MR RAJESH K', 'Rajesh Kumar')).toBeGreaterThanOrEqual(0.5);
  });

  it('short counterparty vs longer tenant name still matches on common prefix', () => {
    expect(similarityRatio('RAJESH', 'Rajesh Kumar')).toBeGreaterThanOrEqual(0.5);
  });

  it('clearly different names stay below 0.5', () => {
    expect(similarityRatio('Suresh Shah', 'Rajesh Kumar')).toBeLessThan(0.5);
  });
});
