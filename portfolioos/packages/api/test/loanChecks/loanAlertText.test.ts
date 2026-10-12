import { describe, it, expect } from 'vitest';
import { Decimal, type PassThroughEstimate } from '@everypaisa/shared';
import { benchmarkAlertText, loanLabel, refinanceAlertText } from '../../src/services/loanChecks/loanAlertText.js';

const D = (v: string | number) => new Decimal(v);
const estimate = (newEmi: string, tenureDeltaMonths: number | null): PassThroughEstimate =>
  ({ newRatePct: D(0), currentEmi: D(0), newEmi: D(newEmi), tenureDeltaMonths });

describe('refinanceAlertText', () => {
  it('names the loan, both rates and the rounded net saving', () => {
    expect(refinanceAlertText({
      loanType: 'HOME', lenderName: 'HDFC Bank', currentRatePct: D('9.1'), marketLender: 'SBI', marketRatePct: D('8.35'), netSaving: D('214108.70'),
    })).toEqual({
      title: 'Home loan with HDFC Bank at 9.10%; market from 8.35%',
      description: 'Switching could save ≈ ₹2.1 lakh after switching costs (lowest: SBI). Open the loan to compare.',
    });
  });
});

describe('benchmarkAlertText', () => {
  it('repo cut with a reset date and both estimates (dd/mm/yyyy dates)', () => {
    expect(benchmarkAlertText({
      kind: 'REPO', benchmarkLender: null, deltaPct: D('-0.25'), effectiveDate: '2026-10-08', lenderName: 'State Bank of India',
      nextResetDate: '2027-01-01', estimate: estimate('29105', -5),
    })).toEqual({
      title: 'RBI cut the repo rate by 0.25% on 08/10/2026',
      description: 'Your State Bank of India loan rate should drop at the next reset (≈ 01/01/2027). Estimated: EMI ≈ ₹29,105 or tenure -5 months, assuming the full change is passed on.',
    });
  });

  it('MCLR rise: rise wording, + months, singular month', () => {
    expect(benchmarkAlertText({
      kind: 'MCLR', benchmarkLender: 'HDFC Bank', deltaPct: D('0.10'), effectiveDate: '2026-11-01', lenderName: 'HDFC Ltd',
      nextResetDate: null, estimate: estimate('29719', 1),
    })).toEqual({
      title: 'HDFC Bank raised its 1-year MCLR by 0.10% on 01/11/2026',
      description: 'Your HDFC Ltd loan rate should rise at the next reset. Estimated: EMI ≈ ₹29,719 or tenure +1 month, assuming the full change is passed on.',
    });
  });

  it('no tenure estimate -> EMI only; no estimate -> no Estimated sentence', () => {
    const base = { kind: 'REPO' as const, benchmarkLender: null, deltaPct: D('0.50'), effectiveDate: '2026-12-05', lenderName: 'PNB', nextResetDate: null };
    expect(benchmarkAlertText({ ...base, estimate: estimate('29709', null) }).description)
      .toBe('Your PNB loan rate should rise at the next reset. Estimated: EMI ≈ ₹29,709, assuming the full change is passed on.');
    expect(benchmarkAlertText({ ...base, estimate: null }).description).toBe('Your PNB loan rate should rise at the next reset.');
  });

  it('uses plain hyphens only', () => {
    const t = benchmarkAlertText({ kind: 'REPO', benchmarkLender: null, deltaPct: D('-0.25'), effectiveDate: '2026-10-08', lenderName: 'SBI', nextResetDate: null, estimate: estimate('29105', -5) });
    expect(`${t.title} ${t.description}`).not.toMatch(/[–—−]/);
  });
});

describe('loanLabel', () => {
  it('maps known types and falls back to "Loan"', () => {
    expect(loanLabel('LAS')).toBe('Loan against securities');
    expect(loanLabel('CAR')).toBe('Car loan');
    expect(loanLabel('OTHER')).toBe('Loan');
    expect(loanLabel('toString')).toBe('Loan');
  });
});
