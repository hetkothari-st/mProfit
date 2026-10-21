import { describe, it, expect } from 'vitest';
import { credit, knowledgeForTurn, searchKnowledge } from '../../src/ai/knowledge/search.js';
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

// Finance Act 2026 (Act 4 of 2026): the four investor rules that changed from 1 April 2026.
describe('Finance Act 2026 changes', () => {
  const turn = (q: string) => knowledgeForTurn(q).map((h) => h.entry.id);
  const entry = (id: string) => KNOWLEDGE_LIBRARY.find((e) => e.id === id);

  it('buyback questions get the capital-gains rule, not the 2024 dividend rule', () => {
    const got = turn('How are share buybacks taxed now?');
    expect(got).toContain('fa26-buyback');
    expect(got).not.toContain('xb-09-dividends-buyback');
  });
  it('dividend questions learn that no deduction is allowed', () => {
    expect(turn('Can I deduct interest on a loan taken to buy shares from my dividend income?')).toContain(
      'fa26-dividend-no-deduction',
    );
  });
  it('SGB questions get the original-subscriber condition', () => {
    const got = turn('Is SGB redemption tax free if I bought the bond on the stock exchange?');
    expect(got).toContain('fa26-sgb');
    expect(got).not.toContain('xb-12-sgb');
  });
  it('STT questions get the 2026 rates', () => {
    expect(turn('What is the STT on options and futures now?')).toContain('fa26-stt');
  });
  it('whole entries that changed point at their replacement', () => {
    expect(entry('xb-09-dividends-buyback')?.supersededBy).toBe('fa26-buyback');
    expect(entry('xb-12-sgb')?.supersededBy).toBe('fa26-sgb');
  });
  it('entries with one changed clause say so in place', () => {
    for (const id of [
      'xb-13-buyback-rights',
      'xb-10-mf-dividend-nri',
      'xb-11-listed-equity-tax',
      'xb-08-transfer-not-transfer',
      'xb-19-gold-options',
    ]) {
      expect(entry(id)?.principle, id).toMatch(/Finance Act 2026/);
    }
  });
});

// Income-tax Act 2025: one natural question per entry finds it among the turn's passages.
describe('Income-tax Act 2025 retrieval', () => {
  const turn = (q: string) => knowledgeForTurn(q).map((h) => h.entry.id);
  const cases: [string, string][] = [
    ['what is a tax year under the new income tax act', 'ita25-tax-year'],
    ['how many days in India make me a resident for tax', 'ita25-residence'],
    ['what are the new tax regime slabs for 2026-27', 'ita25-new-regime'],
    ['old regime tax slabs for a senior citizen', 'ita25-old-regime'],
    ['is income up to 12 lakh tax free under the rebate', 'ita25-rebate'],
    ['what surcharge applies above 2 crore income', 'ita25-surcharge'],
    ['when does a listed share become long term', 'ita25-cg-holding-periods'],
    ['how much tax on long term capital gains from equity mutual funds', 'ita25-cg-equity'],
    ['tax on selling a flat bought in 2015 indexation option', 'ita25-cg-other-assets'],
    ['debt fund bought after april 2023 capital gains tax', 'ita25-cg-specified-mf'],
    ['save capital gains tax by buying another house', 'ita25-cg-house-to-house'],
    ['54EC bonds limit to save capital gains', 'ita25-cg-bonds'],
    ['sold shares and want to buy a house to save tax', 'ita25-cg-asset-to-house'],
    ['can I carry forward a long term capital loss', 'ita25-cg-losses'],
  ];
  for (const [q, id] of cases) it(`${id}: ${q}`, () => expect(turn(q)).toContain(id));
});
