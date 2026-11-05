import { describe, it, expect } from 'vitest';
import type { SafeToInvestSummary } from '@everypaisa/shared';
import { monthLabel, sipAdvice } from './safeToInvestView';

function summary(safe: string | null, sip: string | null, missed = 0): SafeToInvestSummary {
  return {
    safeAmount: safe, basis: 'BANK', monthsUsed: 12, months: [], leanInflow: '118000.0000', typicalInflow: '140000.0000',
    stabilityScore: 84, stabilityLabel: 'SOMEWHAT_VARIABLE',
    fixed: { total: '71000.0000', items: [] }, buffer: { monthly: '25000.0000', source: 'DEBITS' },
    currentSip: { monthly: sip, source: sip ? 'PLANS' : 'NONE', missedMonths: missed },
    thisMonth: { month: '2026-11', inflowSoFar: '0.0000', surplus: '0.0000', topUp: '0.0000' },
    dataSource: 'ALERTS',
    dataStatus: { gmailConnected: true, monitoredSenders: 1, awaitingReview: 0, overBudget: 0 },
    plan: { topUpShare: '0.5000', bufferOverride: null, savedAmount: null, savedAt: null },
  };
}

describe('sipAdvice', () => {
  it('tells an over-committed user to step down, with the missed months', () => {
    const a = sipAdvice(summary('22000.0000', '35000.0000', 2));
    expect(a.tone).toBe('over');
    expect(a.text).toContain('₹13,000 more than a lean month can carry');
    expect(a.text).toContain('missed SIPs in 2 months');
    expect(a.text).toContain('Step down to ₹22,000');
  });
  it('shows room to add when SIPs are below the safe amount', () => {
    const a = sipAdvice(summary('22000.0000', '15000.0000'));
    expect(a.tone).toBe('under');
    expect(a.text).toContain('room for ₹7,000 more');
  });
  it('treats a gap under ₹500 as a match', () => {
    expect(sipAdvice(summary('22000.0000', '22300.0000')).tone).toBe('match');
  });
  it('says nothing without an amount', () => {
    expect(sipAdvice(summary(null, '5000.0000')).tone).toBe('none');
  });
});

describe('monthLabel', () => {
  it('formats short months', () => {
    expect(monthLabel('2026-10')).toBe('Oct');
    expect(monthLabel('2026-10', true)).toBe('Oct 2026');
  });
});
