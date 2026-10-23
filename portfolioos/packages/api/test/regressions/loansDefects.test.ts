import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildAmortizationSchedule,
  computeLoanSummary,
  emiDueDayFrom,
  pickEmiAlert,
  LOAN_STATUSES,
  type StoredLoan,
} from '../../src/services/loans/loans.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ₹6,00,000 car loan at 9% for 12 months, first EMI 5 Feb 2026.
function carLoan(overrides: Partial<StoredLoan> = {}): StoredLoan {
  return {
    id: 'l1',
    principalAmount: D('600000'),
    interestRate: D('9'),
    tenureMonths: 12,
    emiAmount: D('52471.32'),
    emiDueDay: 5,
    firstEmiDate: date('2026-02-05'),
    prepaymentOption: 'REDUCE_TENURE',
    taxBenefitSection: null,
    payments: [],
    ...overrides,
  };
}

describe('home-loan tax benefit (the form saves "80C+24B")', () => {
  it('computes the 80C + 24(b) panel for the value the form actually saves', () => {
    const s = computeLoanSummary(carLoan({ taxBenefitSection: '80C+24B' }), date('2026-06-01'));
    expect(s.taxBenefit?.section).toBe('80C + 24(b)');
    expect(s.taxBenefit?.principalDeduction).not.toBeNull();
  });

  it('still accepts the legacy 80C_24B code', () => {
    const s = computeLoanSummary(carLoan({ taxBenefitSection: '80C_24B' }), date('2026-06-01'));
    expect(s.taxBenefit?.section).toBe('80C + 24(b)');
  });
});

describe('loan status', () => {
  it('accepts DEFAULT, which both loan forms offer', () => {
    expect(LOAN_STATUSES).toContain('DEFAULT');
  });
});

describe('foreclosure payments', () => {
  it('a foreclosure that covers the balance ends the schedule and leaves nothing outstanding', () => {
    const base = buildAmortizationSchedule(carLoan());
    // Pay EMIs for Feb and Mar, then foreclose on 20 Mar with the balance left after March's EMI.
    const balanceAfterMar = base[1]!.closingBalance;
    const loan = carLoan({
      payments: [
        { id: 'e1', paymentType: 'EMI', paidOn: date('2026-02-05'), amount: D('52471.32'), principalPart: null, interestPart: null, forMonth: '2026-02' },
        { id: 'e2', paymentType: 'EMI', paidOn: date('2026-03-05'), amount: D('52471.32'), principalPart: null, interestPart: null, forMonth: '2026-03' },
        { id: 'f1', paymentType: 'FORECLOSURE', paidOn: date('2026-03-20'), amount: D(balanceAfterMar), principalPart: null, interestPart: null, forMonth: null },
      ],
    });
    const schedule = buildAmortizationSchedule(loan);
    expect(schedule).toHaveLength(2);
    const summary = computeLoanSummary(loan, date('2026-03-25'));
    expect(summary.outstandingBalance).toBe('0.0000');
    expect(summary.remainingEmiCount).toBe(0);
    expect(summary.nextEmiDate).toBeNull();
  });
});

describe('pickEmiAlert', () => {
  const schedule = buildAmortizationSchedule(carLoan()); // EMIs on the 5th, Feb 2026 – Jan 2027
  const addedOn = date('2026-01-10');

  it('flags an EMI missed within the last 30 days as overdue', () => {
    const a = pickEmiAlert(schedule, date('2026-02-08'), addedOn);
    expect(a).toMatchObject({ isOverdue: true, daysLeft: -3 });
    expect(a!.row.date).toBe('2026-02-05');
  });

  it('does not flag EMIs due before the loan was added to the app', () => {
    // Loan added mid-tenure on 1 Jun: Feb–May unpaid history is not overdue.
    const a = pickEmiAlert(schedule, date('2026-06-04'), date('2026-06-01'));
    expect(a).toMatchObject({ isOverdue: false, daysLeft: 1 });
    expect(a!.row.date).toBe('2026-06-05');
  });

  it('does not flag an EMI missed more than 30 days ago', () => {
    // 5 Feb missed; on 10 Mar it is 33 days late — too old. Next EMI (5 Mar) is also missed, 5 days late.
    const a = pickEmiAlert(schedule, date('2026-03-10'), addedOn);
    expect(a!.row.date).toBe('2026-03-05');
    expect(a!.isOverdue).toBe(true);
  });

  it('alerts on the due date itself', () => {
    expect(pickEmiAlert(schedule, date('2026-02-05'), addedOn)).toMatchObject({ isOverdue: false, daysLeft: 0 });
  });

  it('alerts at the 7-day threshold and stays quiet between thresholds', () => {
    expect(pickEmiAlert(schedule, date('2026-01-29'), addedOn)).toMatchObject({ daysLeft: 7 });
    expect(pickEmiAlert(schedule, date('2026-01-30'), addedOn)).toBeNull();
  });
});

describe('emiDueDayFrom', () => {
  it('is the day of the first EMI date', () => {
    expect(emiDueDayFrom('2026-02-05')).toBe(5);
    expect(emiDueDayFrom('2026-03-31')).toBe(31);
  });
});
