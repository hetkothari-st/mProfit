import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  computeLoanSummary,
  loanPosition,
  type StoredLoan,
} from '../../src/services/loans/loans.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ₹10,00,000 over 48 months, first EMI 1 Jan 2026 — a loan added to the app
// mid-tenure, with its earlier EMIs never marked paid.
function loan(overrides: Partial<StoredLoan> = {}): StoredLoan {
  return {
    id: 'l1',
    principalAmount: D('1000000'),
    interestRate: D('9'),
    tenureMonths: 48,
    emiAmount: D('24885.04'),
    emiDueDay: 1,
    firstEmiDate: date('2026-01-01'),
    prepaymentOption: 'REDUCE_TENURE',
    taxBenefitSection: null,
    payments: [],
    createdAt: date('2026-11-10'), // added to the app only a week ago
    ...overrides,
  } as StoredLoan;
}

describe('loanPosition — overdue EMI', () => {
  it('does not call EMIs overdue that fell due before the loan was added to the app', () => {
    // No payments marked; loan added 10 Nov; today 18 Nov. The earlier EMIs are assumed paid
    // (the outstanding balance already assumes so), and the 1 Nov EMI fell due before the loan
    // was added, so nothing is overdue.
    const p = loanPosition(loan(), date('2026-11-18'));
    expect(p.missedEmi).toBeNull();
  });

  it('flags the latest EMI missed after the loan was added, within 30 days', () => {
    const p = loanPosition(loan({ createdAt: date('2026-09-01') }), date('2026-11-18'));
    expect(p.missedEmi?.date).toBe('2026-11-01');
  });

  it('stops calling an EMI overdue once it is more than 30 days late', () => {
    const p = loanPosition(loan({ createdAt: date('2026-09-01') }), date('2026-12-20'));
    // 1 Nov is 49 days late, 1 Dec is 19 days late -> latest missed within window is 1 Dec
    expect(p.missedEmi?.date).toBe('2026-12-01');
    const q = loanPosition(loan({ createdAt: date('2026-09-01') }), date('2026-12-31'));
    // 1 Dec is 30 days late: still inside the window
    expect(q.missedEmi?.date).toBe('2026-12-01');
    const r = loanPosition(loan({ createdAt: date('2026-09-01') }), date('2027-01-01'));
    // 1 Jan is due today (not missed); 1 Dec is 31 days late -> outside the window
    expect(r.missedEmi).toBeNull();
  });

  it('exposes the next EMI that is still ahead, independent of old unmarked ones', () => {
    const p = loanPosition(loan(), date('2026-11-18'));
    expect(p.nextDue?.date).toBe('2026-12-01');
  });
});

describe('computeLoanSummary — instalment counts add up', () => {
  it('paid + remaining equals the tenure, counting unmarked past EMIs as paid', () => {
    const s = computeLoanSummary(loan(), date('2026-11-18'));
    // Unmarked past EMIs are assumed paid (the outstanding balance already does), so
    // "done" must be tenure - remaining, not just the EMIs someone clicked "paid" on.
    expect(s.paidEmiCount + s.remainingEmiCount).toBe(s.scheduledEmiCount);
    expect(s.scheduledEmiCount).toBe(48);
    expect(s.remainingEmiCount).toBe(37); // 1 Dec 2026 .. 1 Dec 2029; Jan-Nov 2026 are behind us
  });
});
