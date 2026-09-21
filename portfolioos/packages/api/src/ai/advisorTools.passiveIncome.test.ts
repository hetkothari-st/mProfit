import { describe, it, expect, vi } from 'vitest';
import { Decimal } from 'decimal.js';

/**
 * The bug these cover, seen in production: the assistant wrote "you're not
 * starting from zero" and then quoted the SIP of someone who was. A client
 * with ₹56 lakh invested was told a 20-year ₹9.62cr goal needed ₹97,260 a
 * month when their own corpus covers over half of it.
 */
vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

const { runAdvisorTool } = await import('./advisorTools.js');

function ctx(totalPortfolioValue: Decimal | null) {
  return {
    userId: 'u1',
    financialYear: '2026-27',
    facts: totalPortfolioValue ? ({ totalPortfolioValue } as never) : null,
  } as never;
}

const ASK = { monthlyIncome: '100000', yearsToStart: [20], annualReturnPct: [12] };

describe('plan_passive_income — existing corpus', () => {
  it('nets the portfolio off the SIP instead of assuming zero', async () => {
    const out = await runAdvisorTool('plan_passive_income', ASK, ctx(new Decimal(5_600_000)));
    expect(out.ok).toBe(true);
    const row = (out.result as never as { scenarios: Array<{ sipByReturn: Array<Record<string, string>> }> })
      .scenarios[0]!.sipByReturn[0]!;
    const sip = Number(row['monthlySip']);
    const fromZero = Number(row['sipIfStartingFromZero']);
    // ₹56L compounding at 12% for 20 years covers more than half the target,
    // so the real SIP is a fraction of the from-zero figure.
    expect(fromZero).toBeGreaterThan(90_000);
    expect(sip).toBeLessThan(fromZero / 2);
    expect(sip).toBeGreaterThan(0);
  });

  it('reports what it grew, and what the from-zero answer would have been', async () => {
    const out = await runAdvisorTool('plan_passive_income', ASK, ctx(new Decimal(5_600_000)));
    const row = (out.result as never as { scenarios: Array<{ sipByReturn: Array<Record<string, string>> }> })
      .scenarios[0]!.sipByReturn[0]!;
    expect(Number(row['existingCorpusGrowsTo'])).toBeGreaterThan(50_000_000);
    expect(row['sipIfStartingFromZero']).toBeTruthy();
  });

  it('names where the corpus came from, so the answer can state the assumption', async () => {
    const out = await runAdvisorTool('plan_passive_income', ASK, ctx(new Decimal(5_600_000)));
    const r = out.result as never as { currentCorpus: string; currentCorpusSource: string };
    expect(r.currentCorpus).toBe('5600000');
    expect(r.currentCorpusSource).toMatch(/whole portfolio/i);
  });

  it('still honours an explicit corpus — a goal may be backed by part of it', async () => {
    const out = await runAdvisorTool(
      'plan_passive_income',
      { ...ASK, currentCorpus: '1000000' },
      ctx(new Decimal(5_600_000)),
    );
    const r = out.result as never as { currentCorpus: string; currentCorpusSource: string };
    expect(r.currentCorpus).toBe('1000000');
    expect(r.currentCorpusSource).toBe('given');
  });

  it('falls back to zero only when there is no portfolio on file', async () => {
    const out = await runAdvisorTool('plan_passive_income', ASK, ctx(null));
    const r = out.result as never as {
      currentCorpus: string;
      currentCorpusSource: string;
      scenarios: Array<{ sipByReturn: Array<Record<string, string>> }>;
    };
    expect(r.currentCorpus).toBe('0');
    expect(r.currentCorpusSource).toBe('nothing on file');
    const row = r.scenarios[0]!.sipByReturn[0]!;
    expect(row['monthlySip']).toBe(row['sipIfStartingFromZero']);
  });

  it('flags a goal the existing corpus already covers rather than quoting a SIP', async () => {
    const out = await runAdvisorTool('plan_passive_income', ASK, ctx(new Decimal(200_000_000)));
    const row = (out.result as never as { scenarios: Array<{ sipByReturn: Array<Record<string, unknown>> }> })
      .scenarios[0]!.sipByReturn[0]!;
    expect(row['alreadyCovered']).toBe(true);
    expect(row['monthlySip']).toBe('0');
  });
});
