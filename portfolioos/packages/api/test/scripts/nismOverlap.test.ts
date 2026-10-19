import { describe, it, expect } from 'vitest';
import { sharedRuns } from '../../scripts/nismOverlap.js';

describe('sharedRuns', () => {
  const book = 'The quick brown fox jumps over the lazy dog near the quiet river bank today.';

  it('finds an identical ten-word run', () => {
    const ours = 'Notes: the quick brown fox jumps over the lazy dog near a cottage.';
    expect(sharedRuns(book, ours)).toEqual(['the quick brown fox jumps over the lazy dog near']);
  });

  it('does not flag a nine-word overlap', () => {
    const ours = 'Notes: quick brown fox jumps over the lazy dog near, then something else entirely.';
    expect(sharedRuns(book, ours)).toEqual([]);
  });

  it('ignores punctuation and case', () => {
    const ours = 'THE QUICK, brown fox -- jumps over the lazy dog: near.';
    expect(sharedRuns(book, ours)).toEqual(['the quick brown fox jumps over the lazy dog near']);
  });

  it('ignores runs that are mostly numbers (published data, not prose)', () => {
    const table = '2001 02 100 2002 03 105 2003 04 109 2004 05 113';
    expect(sharedRuns(table, `CII: ${table}`)).toEqual([]);
  });

  it('honours a custom run length', () => {
    expect(sharedRuns('a b c d', 'x b c d y', 3)).toEqual(['b c d']);
  });
});
