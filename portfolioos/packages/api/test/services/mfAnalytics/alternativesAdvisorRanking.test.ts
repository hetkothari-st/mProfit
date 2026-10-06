import { describe, it, expect } from 'vitest';
import { pickAdvisorRankedAlternatives } from '../../../src/services/mfAnalytics/mfAlternatives.service.js';

// The fund page's "better-scoring funds" used the MF research score alone, so
// it could name funds the adviser's signed ranking (what /advisor tells a
// client to buy) places BELOW the fund — two parts of one advisory product
// contradicting each other on what to buy. The signed ranking now decides.
const pool = ['A', 'B', 'C', 'D', 'E']; // same SEBI category as the subject 'S'

describe('pickAdvisorRankedAlternatives', () => {
  const ranking = new Map([
    ['S', { bucket: 'EQUITY_DOMESTIC', rank: 4 }],
    ['A', { bucket: 'EQUITY_DOMESTIC', rank: 6 }], // MF-score favourite, adviser ranks it below S
    ['B', { bucket: 'EQUITY_DOMESTIC', rank: 1 }],
    ['C', { bucket: 'EQUITY_DOMESTIC', rank: 3 }],
    ['D', { bucket: 'EQUITY_DOMESTIC', rank: 2 }],
    // E: not eligible / not ranked by the adviser
  ]);

  it('names only funds the adviser ranks above the subject, best first', () => {
    expect(pickAdvisorRankedAlternatives('S', pool, ranking, 3)).toEqual(['B', 'D', 'C']);
  });

  it('caps the list', () => {
    expect(pickAdvisorRankedAlternatives('S', pool, ranking, 2)).toEqual(['B', 'D']);
  });

  it('names ranked funds when the subject itself is not ranked', () => {
    const r = new Map(ranking);
    r.delete('S');
    expect(pickAdvisorRankedAlternatives('S', pool, r, 3)).toEqual(['B', 'D', 'C']);
  });

  it('never names a fund the adviser has not ranked', () => {
    expect(pickAdvisorRankedAlternatives('S', ['E'], ranking, 3)).toEqual([]);
  });

  it('names nothing when there is no usable ranking', () => {
    expect(pickAdvisorRankedAlternatives('S', pool, null, 3)).toEqual([]);
  });

  it('does not compare ranks across buckets', () => {
    const r = new Map(ranking);
    r.set('D', { bucket: 'DEBT', rank: 1 });
    expect(pickAdvisorRankedAlternatives('S', pool, r, 3)).toEqual(['B', 'C']);
  });
});
