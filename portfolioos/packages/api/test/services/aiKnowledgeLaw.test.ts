import { describe, it, expect } from 'vitest';
import { credit, searchKnowledge } from '../../src/ai/knowledge/search.js';
import { KNOWLEDGE_LIBRARY, type KnowledgeEntry } from '../../src/ai/knowledge/library.js';
import { LAW_LIBRARY } from '../../src/ai/knowledge/law/index.js';

const law = (over: Partial<KnowledgeEntry> = {}): KnowledgeEntry => ({
  id: 'fa26-test',
  title: 'Buyback proceeds are capital gains',
  principle: 'From April 2026 buyback proceeds are taxed as capital gains in the hands of the shareholder.',
  source: { kind: 'LAW', instrument: 'Income-tax Act 2025', ref: 's.69', date: '2026-04-01' },
  asOf: '2026-04',
  topics: ['tax'],
  keywords: ['buyback tax'],
  ...over,
});

const nism = (over: Partial<KnowledgeEntry> = {}): KnowledgeEntry => ({
  id: 'xb-09-old',
  title: 'Buyback proceeds are dividend',
  principle: 'Buyback proceeds are taxed as dividend income at slab rates.',
  source: { kind: 'NISM', series: 'X-B', edition: '2025-12', chapter: 9, chapterTitle: 'Other sources' },
  asOf: '2025-12',
  topics: ['tax'],
  keywords: ['buyback tax', 'buyback history'],
  ...over,
});

describe('LAW entries: credit', () => {
  it('names the instrument, the reference and the date', () => {
    expect(credit(law())).toBe('from Income-tax Act 2025, s.69 (as of Apr 2026)');
  });
  it('marks a superseded entry as the older rule', () => {
    expect(credit(nism({ supersededBy: 'fa26-test' }))).toBe(
      'from NISM Series X-B (Dec 2025), ch. 9; older rule, superseded by fa26-test',
    );
  });
});

describe('supersession in retrieval', () => {
  const library = [law(), nism({ supersededBy: 'fa26-test' })];

  it('drops a superseded entry when its successor is also found', () => {
    const ids = searchKnowledge('how is buyback tax charged', { library, minScore: 0 }).map((h) => h.entry.id);
    expect(ids).toEqual(['fa26-test']);
  });
  it('keeps a superseded entry when its successor does not match', () => {
    const ids = searchKnowledge('buyback history', { library: [nism({ supersededBy: 'fa26-test' })], minScore: 0 }).map(
      (h) => h.entry.id,
    );
    expect(ids).toEqual(['xb-09-old']);
  });
});

describe('law library integrity', () => {
  const ids = new Set(KNOWLEDGE_LIBRARY.map((e) => e.id));

  it('every supersededBy points at an entry that exists', () => {
    for (const e of KNOWLEDGE_LIBRARY) if (e.supersededBy) expect(ids.has(e.supersededBy), e.id).toBe(true);
  });
  it('every LAW entry is dated and referenced, and in the main library', () => {
    for (const e of LAW_LIBRARY) {
      expect(e.source.kind, e.id).toBe('LAW');
      expect(e.asOf, e.id).toMatch(/^\d{4}-\d{2}$/);
      if (e.source.kind === 'LAW') expect(e.source.ref.length, e.id).toBeGreaterThan(0);
      expect(ids.has(e.id), e.id).toBe(true);
    }
  });
  it('law entries keep within the length caps', () => {
    for (const e of LAW_LIBRARY) {
      expect(e.principle.length, e.id).toBeLessThanOrEqual(900);
      expect((e.inPractice ?? '').length, e.id).toBeLessThanOrEqual(500);
    }
  });
});
