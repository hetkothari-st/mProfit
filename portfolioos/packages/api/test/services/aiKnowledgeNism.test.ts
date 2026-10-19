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
  it('X-A 1: six-step planning process', () => {
    expect(ids('what are the steps of the financial planning process')).toContain('xa-01-six-step-process');
  });
  it('X-A 1: advice vs distribution', () => {
    expect(ids('can an investment adviser also earn distribution commission')).toContain('xa-01-advice-vs-distribution');
  });
  it('X-A 2: CAGR', () => {
    expect(ids('how do I calculate CAGR of my fund')).toContain('xa-02-cagr');
  });
  it('X-A 2: annuity due', () => {
    expect(ids('difference between ordinary annuity and annuity due')).toContain('xa-02-annuity-types');
  });
  it('X-A 3: liquidity ratio', () => {
    expect(ids('what is the liquidity ratio and what counts as liquid assets')).toContain('xa-03-liquidity-ratio');
  });
  it('X-A 3: debt to income', () => {
    expect(ids('what debt to income ratio is too high')).toContain('xa-03-debt-to-income');
  });
  it('X-A 4: avalanche vs snowball', () => {
    expect(ids('avalanche or snowball method to pay off my loans')).toContain('xa-04-avalanche-snowball-blizzard');
  });
  it('X-A 4: hypothecation', () => {
    expect(ids('is a car loan a pledge or hypothecation')).toContain('xa-04-mortgage-pledge-hypothecation');
  });
  it('X-A 4: prepay or invest', () => {
    expect(ids('should I prepay my home loan or invest the bonus')).toContain('xa-04-invest-or-prepay');
  });
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
