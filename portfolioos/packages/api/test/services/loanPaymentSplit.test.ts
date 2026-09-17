import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildAmortizationSchedule,
  computeLoanSummary,
  splitLoanPayment,
  type StoredLoan,
} from '../../src/services/loans.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ₹6,00,000 car loan at 9% for 12 months, first EMI 5 Feb 2026.
function carLoan(payments: StoredLoan['payments']): StoredLoan {
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
    payments,
  };
}

const emi = (month: string, parts?: { principal: string; interest: string }) => ({
  id: `p-${month}`,
  paymentType: 'EMI',
  paidOn: date(`${month}-05`),
  amount: D('52471.32'),
  principalPart: parts ? D(parts.principal) : null,
  interestPart: parts ? D(parts.interest) : null,
  forMonth: month,
});

describe('splitLoanPayment', () => {
  const schedule = buildAmortizationSchedule(carLoan([]));

  it("takes an EMI's split from its month in the schedule when none was saved", () => {
    const split = splitLoanPayment(emi('2026-02'), schedule);
    // Month 1 interest on ₹6,00,000 at 0.75% = ₹4,500.
    expect(split.interest.toFixed(2)).toBe('4500.00');
    expect(split.principal.toFixed(2)).toBe('47971.32');
  });

  it('keeps a split the user entered', () => {
    const split = splitLoanPayment(emi('2026-02', { principal: '50000', interest: '2471.32' }), schedule);
    expect(split.principal.toFixed(2)).toBe('50000.00');
    expect(split.interest.toFixed(2)).toBe('2471.32');
  });

  it('counts a prepayment as principal', () => {
    const split = splitLoanPayment(
      { paymentType: 'PREPAYMENT', paidOn: date('2026-03-10'), amount: D('100000'), principalPart: null, interestPart: null, forMonth: null },
      schedule,
    );
    expect(split.principal.toFixed(2)).toBe('100000.00');
    expect(split.interest.isZero()).toBe(true);
  });

  it('never books more interest than the amount paid', () => {
    const split = splitLoanPayment({ ...emi('2026-02'), amount: D('3000') }, schedule);
    expect(split.interest.toFixed(2)).toBe('3000.00');
    expect(split.principal.isZero()).toBe(true);
  });
});

describe('computeLoanSummary paid so far', () => {
  it('counts EMIs recorded without a principal/interest split', () => {
    const months = ['2026-02', '2026-03', '2026-04'];
    const summary = computeLoanSummary(carLoan(months.map((m) => emi(m))));
    const paid = new Prisma.Decimal(summary.totalPrincipalPaid).plus(summary.totalInterestPaid);
    expect(paid.toFixed(2)).toBe('157413.96');
    expect(new Prisma.Decimal(summary.totalInterestPaid).greaterThan(0)).toBe(true);
  });
});
