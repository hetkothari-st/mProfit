import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { overlapWith } from '../../scripts/nismOverlap.js';
import { KNOWLEDGE_LIBRARY } from '../../src/ai/knowledge/library.js';
import { AI_ASSISTANT_SYSTEM_PROMPT } from '../../src/ai/systemPrompt.js';
import type { ExamQuestion } from '../../scripts/nismExam.js';

// The current-law exam: 1 Finance Act 2026, 2 ITA basics, 3 capital gains, 4 income and
// deductions, 5 trading and NRIs, 6 SEBI IA rules, 7 SEBI MF/PMS/AIF/RA rules.
const bank = JSON.parse(
  readFileSync(new URL('../fixtures/law-exam/law.json', import.meta.url), 'utf8'),
) as ExamQuestion[];

describe('law exam bank', () => {
  it('every question has the expected shape', () => {
    for (const q of bank) {
      expect(q.id, JSON.stringify(q)).toMatch(/^law-\d{2}-\d{2}$/);
      expect(q.series, q.id).toBe('LAW');
      expect(q.id.slice(4, 6), q.id).toBe(String(q.chapter).padStart(2, '0'));
      expect(q.options, q.id).toHaveLength(4);
      expect(new Set(q.options).size, `${q.id} has duplicate options`).toBe(4);
      expect(['A', 'B', 'C', 'D'], q.id).toContain(q.answer);
      expect(q.why.length, q.id).toBeGreaterThan(5);
      expect(typeof q.lawSensitive, q.id).toBe('boolean');
    }
  });

  it('ids are unique and every topic has at least six questions', () => {
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
    for (let ch = 1; ch <= 7; ch++) {
      expect(bank.filter((q) => q.chapter === ch).length, `law ch.${ch}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('scores every question: the bank is current law, so none is set aside as law-sensitive', () => {
    expect(bank.filter((q) => q.lawSensitive).map((q) => q.id)).toEqual([]);
  });

  it('no answer letter carries more than 40% of the bank', () => {
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(bank.filter((q) => q.answer === letter).length / bank.length, letter).toBeLessThanOrEqual(0.4);
    }
  });

  it('no question stem shares a 10-word run with the library or the prompt', () => {
    const corpus = [
      AI_ASSISTANT_SYSTEM_PROMPT,
      ...KNOWLEDGE_LIBRARY.map((e) => `${e.title}. ${e.principle} ${e.inPractice ?? ''}`),
    ].join('\n');
    const shared = overlapWith(corpus);
    for (const q of bank) expect(shared(q.stem), q.id).toEqual([]);
  });
});
