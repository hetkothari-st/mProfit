import { describe, it, expect, vi } from 'vitest';
import { main, parseLetter, reportName, scoreExam, type ExamQuestion } from '../../scripts/nismExam.js';

const q = (id: string, chapter: number, answer: ExamQuestion['answer'], lawSensitive = false): ExamQuestion => ({
  id,
  series: id.startsWith('xa') ? 'X-A' : 'X-B',
  chapter,
  kind: 'mcq',
  stem: `Question ${id}?`,
  options: ['one', 'two', 'three', 'four'],
  answer,
  why: 'because',
  workbookRef: 1,
  lawSensitive,
});

describe('parseLetter', () => {
  it('reads a plain final answer line', () => {
    expect(parseLetter('Reasoning here.\nAnswer: B')).toBe('B');
  });
  it('accepts brackets, bold and lower case', () => {
    expect(parseLetter('So the best choice is clear.\n**Answer: (c)**')).toBe('C');
  });
  it('takes the last answer line when there are several', () => {
    expect(parseLetter('Answer: B was my first thought.\nOn reflection:\nAnswer: A')).toBe('A');
  });
  it('returns null when no answer line is present', () => {
    expect(parseLetter('I think it is probably B.')).toBeNull();
  });
});

describe('scoreExam', () => {
  const questions = [
    q('xa-01-01', 1, 'A'),
    q('xa-01-02', 1, 'B'),
    q('xa-02-01', 2, 'C'),
    q('xb-07-01', 7, 'D', true),
  ];
  const replies: Record<string, string> = {
    'xa-01-01': 'Answer: A',
    'xa-01-02': 'Answer: C',
    'xa-02-01': 'Answer: C',
    'xb-07-01': 'Answer: A',
  };

  it('scores overall and by chapter, leaving law-sensitive questions out of the bar', async () => {
    const report = await scoreExam(questions, async (x) => replies[x.id] ?? '', { model: 'test-model' });
    expect(report.model).toBe('test-model');
    expect(report.total).toBe(3);
    expect(report.correct).toBe(2);
    expect(report.pct).toBeCloseTo(66.67, 1);
    expect(report.byChapter['X-A ch.1']).toEqual({ n: 2, correct: 1, pct: 50 });
    expect(report.byChapter['X-A ch.2']).toEqual({ n: 1, correct: 1, pct: 100 });
    expect(report.byChapter['X-B ch.7']).toBeUndefined();
    expect(report.lawSensitive).toEqual({ n: 1, correct: 0 });
  });

  it('lists every miss with what was given and what was wanted', async () => {
    const report = await scoreExam(questions, async (x) => replies[x.id] ?? '', { model: 'm' });
    expect(report.misses).toEqual([
      { id: 'xa-01-02', got: 'C', want: 'B', lawSensitive: false },
      { id: 'xb-07-01', got: 'A', want: 'D', lawSensitive: true },
    ]);
  });

  it('counts an unreadable or failed answer as a miss', async () => {
    const report = await scoreExam([q('xa-03-01', 3, 'A')], async () => {
      throw new Error('network');
    }, { model: 'm' });
    expect(report.correct).toBe(0);
    expect(report.misses).toEqual([{ id: 'xa-03-01', got: null, want: 'A', lawSensitive: false }]);
  });
});

describe('nismExam CLI', () => {
  it('refuses to spend without --confirm-spend and prints the estimate', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const code = await main(['--series', 'xa']);
    expect(code).toBe(2);
    const out = log.mock.calls.flat().join('\n');
    expect(out).toMatch(/100 questions/);
    expect(out).toMatch(/\$\d/);
    expect(out).toMatch(/--confirm-spend/);
    log.mockRestore();
  });

  it('loads the current-law bank with --bank law', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const code = await main(['--bank', 'law']);
    expect(code).toBe(2);
    expect(log.mock.calls.flat().join(' ')).toMatch(/60 questions/);
    log.mockRestore();
  });
});

describe('reportName', () => {
  it('keeps law and NISM reports for the same day apart', () => {
    expect(reportName('nism', '2026-10-21', 'm')).toEqual({ file: '2026-10-21-nism-m', heading: 'NISM exam report' });
    expect(reportName('law', '2026-10-21', 'm')).toEqual({ file: '2026-10-21-law-m', heading: 'Current-law exam report' });
  });
});
