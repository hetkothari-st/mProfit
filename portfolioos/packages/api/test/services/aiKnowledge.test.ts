import { describe, it, expect } from 'vitest';
import { KNOWLEDGE_BOOKS, KNOWLEDGE_LIBRARY, type KnowledgeEntry } from '../../src/ai/knowledge/library.js';
import { knowledgeForPrompt, searchKnowledge } from '../../src/ai/knowledge/search.js';

// The adviser's reading: principles from five classic books, in our own words
// and credited, plus the planning framework it follows. Retrieval is local —
// no embeddings service, no database.

describe('knowledge library', () => {
  it('gives every entry a unique id, a credited source and a principle', () => {
    const ids = KNOWLEDGE_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of KNOWLEDGE_LIBRARY) {
      expect(e.principle.length, e.id).toBeGreaterThan(40);
      expect(e.principle.length, e.id).toBeLessThanOrEqual(700);
      expect(e.keywords.length, e.id).toBeGreaterThan(0);
      if (e.source.kind === 'BOOK') {
        const book = e.source.book;
        expect(KNOWLEDGE_BOOKS.some((b) => b.title === book), `${e.id}: ${book}`).toBe(true);
      }
    }
  });

  it("keeps only the enabled books: Let's Talk Money and the framework (four classics switched off 2026-10-19)", () => {
    const enabled = KNOWLEDGE_BOOKS.filter((b) => b.enabled).map((b) => b.title);
    expect(enabled).toEqual(["Let's Talk Money"]);
    for (const e of KNOWLEDGE_LIBRARY) {
      if (e.source.kind === 'BOOK') expect(enabled, e.id).toContain(e.source.book);
    }
    expect(KNOWLEDGE_LIBRARY.filter((e) => e.source.kind === 'BOOK').length).toBeGreaterThanOrEqual(8);
  });

  it('dates every NISM entry that states a rate or an amount', () => {
    for (const e of KNOWLEDGE_LIBRARY) {
      if (e.source.kind !== 'NISM') continue;
      const text = `${e.principle} ${e.inPractice ?? ''}`;
      if (/%|₹|Rs\.?\s?\d/.test(text)) expect(e.asOf, e.id).toBeTruthy();
    }
  });

  it('paraphrases rather than quotes: no quoted passage longer than a dozen words', () => {
    for (const e of KNOWLEDGE_LIBRARY) {
      for (const text of [e.principle, e.inPractice ?? '']) {
        for (const m of text.matchAll(/[“"]([^”"]+)[”"]/g)) {
          expect(m[1]!.trim().split(/\s+/).length, `${e.id}: ${m[1]}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});

describe('searchKnowledge', () => {
  it('finds the behaviour lessons for a panicky SIP question', () => {
    const hits = searchKnowledge('market crashed should I stop my SIP and sell');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.slice(0, 3).some((h) => h.entry.topics.includes('behaviour'))).toBe(true);
  });

  it('finds the cost lessons for an index-fund question', () => {
    const hits = searchKnowledge('index fund versus active fund expense ratio');
    expect(hits[0]!.entry.topics).toContain('costs');
  });

  it('finds the planning order for an emergency-fund question', () => {
    const hits = searchKnowledge('how big should my emergency fund be');
    expect(hits[0]!.entry.topics).toContain('emergency-fund');
  });

  it('returns nothing for words it has never seen, and respects the limit', () => {
    expect(searchKnowledge('zzqx wibblewobble')).toEqual([]);
    expect(searchKnowledge('investing', { limit: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('formats hits for the prompt with their credit, and nothing when empty', () => {
    const text = knowledgeForPrompt(searchKnowledge('index fund costs', { limit: 1 }));
    expect(text).toMatch(/Halan|framework|NISM/i);
    expect(knowledgeForPrompt([])).toBe('');
  });
});

describe('NISM credit', () => {
  it('credits a NISM entry with its series, edition and chapter', () => {
    const entry: KnowledgeEntry = {
      id: 'xb-08-test',
      title: 'Test entry',
      principle: 'A test principle that is long enough to pass the library length rule easily.',
      source: { kind: 'NISM', series: 'X-B', edition: '2025-12', chapter: 8, chapterTitle: 'Capital Gains' },
      asOf: '2025-12',
      topics: ['tax'],
      keywords: ['test'],
    };
    expect(knowledgeForPrompt([{ entry, score: 1 }])).toContain('NISM Series X-B (Dec 2025), ch. 8');
  });
});
