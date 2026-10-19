import { describe, it, expect } from 'vitest';
import { searchKnowledge } from '../../src/ai/knowledge/search.js';
import { NISM_LIBRARY } from '../../src/ai/knowledge/nism/index.js';

// One natural question per NISM chapter must find that chapter's key entry in
// the top five — the same retrieval the assistant uses at answer time.
const ids = (q: string) => searchKnowledge(q, { limit: 5 }).map((h) => h.entry.id);

describe('NISM library', () => {
  it('ids follow the series-chapter convention and match their source', () => {
    for (const e of NISM_LIBRARY) {
      expect(e.source.kind, e.id).toBe('NISM');
      if (e.source.kind !== 'NISM') continue;
      const prefix = `${e.source.series === 'X-A' ? 'xa' : 'xb'}-${String(e.source.chapter).padStart(2, '0')}-`;
      expect(e.id.startsWith(prefix), e.id).toBe(true);
    }
  });
});

describe('NISM retrieval, chapter by chapter', () => {
  it('X-B 16: prospect theory', () => {
    expect(ids('why do people hold losing stocks and sell winners early, prospect theory')).toContain('xb-16-prospect-theory');
  });
  it('X-B 16: mental accounting', () => {
    expect(ids('treating a bonus differently from salary money')).toContain('xb-16-mental-accounting');
  });
  it('X-B 17: home country bias', () => {
    expect(ids('should I invest abroad through LRS for diversification')).toContain('xb-17-home-bias');
  });
  it('X-B 17: too many funds', () => {
    expect(ids('I own twelve mutual funds, is that too many')).toContain('xb-17-over-under-diversification');
  });
});
