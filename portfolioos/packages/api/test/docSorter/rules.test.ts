import { describe, it, expect } from 'vitest';
import { runRules } from '../../src/services/documents/docSorter/rules.js';
import { FIXTURES } from './fixtures.js';

const NOW = new Date('2026-10-14');

describe('runRules golden fixtures', () => {
  for (const [i, fx] of FIXTURES.entries()) {
    it(`#${i} ${fx.type}`, () => {
      const r = runRules(fx.text, NOW);
      expect(r.docType).toBe(fx.type);
      if (fx.name !== null) expect(r.personName?.toLowerCase()).toBe(fx.name.toLowerCase());
      if (fx.pan !== null) expect(r.panLast4).toBe(fx.pan);
      if (fx.date !== null) expect(r.docDate).toBe(fx.date);
    });
  }

  it('returns OTHER with low confidence for unrelated text', () => {
    const r = runRules('hello world, lunch menu for friday', NOW);
    expect(r.docType).toBe('OTHER');
    expect(r.confidence).toBeLessThan(0.7);
    expect(r.personName).toBeNull();
  });

  it('never returns a name containing path characters', () => {
    const r = runRules('Bank Statement\nAccount Holder: ../../etc/passwd\nWithdrawal Deposit', NOW);
    expect(r.personName ?? '').not.toMatch(/[\\/]/);
  });
});
