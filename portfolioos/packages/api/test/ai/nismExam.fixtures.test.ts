import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { overlapWith } from '../../scripts/nismOverlap.js';
import { KNOWLEDGE_LIBRARY } from '../../src/ai/knowledge/library.js';
import { AI_ASSISTANT_SYSTEM_PROMPT } from '../../src/ai/systemPrompt.js';

interface ExamQuestion {
  id: string;
  series: 'X-A' | 'X-B';
  chapter: number;
  kind: 'mcq' | 'case';
  stem: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  why: string;
  workbookRef: number;
  lawSensitive: boolean;
}

const load = (file: string): ExamQuestion[] =>
  JSON.parse(readFileSync(new URL(`../fixtures/nism-exam/${file}`, import.meta.url), 'utf8')) as ExamQuestion[];

const bank = [...load('xa.json'), ...load('xb.json')];

describe('NISM exam bank', () => {
  it('every question has the expected shape', () => {
    for (const q of bank) {
      expect(q.id, JSON.stringify(q)).toMatch(/^x[ab]-\d{2}-\d{2}$/);
      expect(['X-A', 'X-B'], q.id).toContain(q.series);
      expect(q.id.startsWith(q.series === 'X-A' ? 'xa-' : 'xb-'), q.id).toBe(true);
      expect(q.id.slice(3, 5), q.id).toBe(String(q.chapter).padStart(2, '0'));
      expect(['mcq', 'case'], q.id).toContain(q.kind);
      expect(q.stem.length, q.id).toBeGreaterThan(15);
      expect(q.options, q.id).toHaveLength(4);
      for (const o of q.options) expect(o.trim().length, q.id).toBeGreaterThan(0);
      expect(new Set(q.options).size, `${q.id} has duplicate options`).toBe(4);
      expect(['A', 'B', 'C', 'D'], q.id).toContain(q.answer);
      expect(q.why.length, q.id).toBeGreaterThan(10);
      expect(Number.isInteger(q.workbookRef) && q.workbookRef > 0, q.id).toBe(true);
      expect(typeof q.lawSensitive, q.id).toBe('boolean');
    }
  });

  it('ids are unique', () => {
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
  });

  it('covers every chapter of both workbooks with at least four questions', () => {
    for (const series of ['X-A', 'X-B'] as const) {
      for (let ch = 1; ch <= 20; ch++) {
        const n = bank.filter((q) => q.series === series && q.chapter === ch).length;
        expect(n, `${series} ch.${ch}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('has at least 200 questions', () => {
    expect(bank.length).toBeGreaterThanOrEqual(200);
  });

  it('spreads correct answers across A-D', () => {
    for (const letter of ['A', 'B', 'C', 'D']) {
      const share = bank.filter((q) => q.answer === letter).length / bank.length;
      expect(share, letter).toBeLessThanOrEqual(0.4);
    }
  });

  it('no question stem is lifted from the library or system prompt', () => {
    const ours = [
      ...KNOWLEDGE_LIBRARY.map((e) => [e.title, e.principle, e.inPractice ?? ''].join(' ')),
      AI_ASSISTANT_SYSTEM_PROMPT,
    ].join('\n');
    const sharedWithOurs = overlapWith(ours);
    for (const q of bank) expect(sharedWithOurs(q.stem), q.id).toEqual([]);
  });
});
