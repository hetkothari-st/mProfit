import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  computeEmiSchedule,
  computeLoanGivenSummary,
  type LoanTerms,
  type LedgerEntry,
} from '../../src/services/loansGiven.service.js';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function flexible(over: Partial<LoanTerms> = {}): LoanTerms {
  return {
    principalAmount: '100000',
    lentOn: d('2026-01-01'),
    interestRate: '0',
    dueDate: null,
    repaymentMode: 'FLEXIBLE',
    emiAmount: null,
    tenureMonths: null,
    firstEmiDate: null,
    status: 'ACTIVE',
    closedOn: null,
    ...over,
  };
}

const entry = (kind: string, amount: string, date: string): LedgerEntry => ({ kind, amount, date: d(date) });

describe('computeLoanGivenSummary — flexible', () => {
  it('outstanding is lent plus extra lent, minus repaid and forgiven', () => {
    const s = computeLoanGivenSummary(
      flexible(),
      [
        entry('ADDITIONAL_LENT', '20000', '2026-02-01'),
        entry('REPAYMENT', '30000', '2026-03-01'),
        entry('WAIVER', '5000', '2026-04-01'),
        entry('INTEREST_RECEIVED', '1000', '2026-04-01'),
      ],
      d('2026-05-01'),
    );
    expect(s.principalLent).toBe('120000.0000');
    expect(s.outstandingPrincipal).toBe('85000.0000');
    expect(s.totalReceived).toBe('31000.0000');
    expect(s.interestAccrued).toBeNull();
    expect(s.nextDue).toBeNull();
  });

  it('accrues simple interest day by day on the balance', () => {
    // ₹1,00,000 at 12% for 73 days = 2,400; then ₹50,000 left for 73 days = 1,200.
    const s = computeLoanGivenSummary(
      flexible({ interestRate: '12' }),
      [entry('REPAYMENT', '50000', '2026-03-15'), entry('INTEREST_RECEIVED', '1000', '2026-03-15')],
      d('2026-05-27'),
    );
    expect(s.interestAccrued).toBe('3600.0000');
    expect(s.interestDue).toBe('2600.0000');
    expect(s.outstandingPrincipal).toBe('50000.0000');
  });

  it('flags an overdue due date with principal plus unpaid interest', () => {
    const s = computeLoanGivenSummary(
      flexible({ interestRate: '12', dueDate: d('2026-03-15') }),
      [],
      d('2026-03-25'),
    );
    expect(s.overdueDays).toBe(10);
    expect(s.nextDue?.date).toBe('2026-03-15');
    // 83 days of interest on 1,00,000 at 12% = 2,728.77
    expect(s.nextDue?.amount).toBe('102728.7700');
  });

  it('closed loans stop accruing and have nothing due', () => {
    const s = computeLoanGivenSummary(
      flexible({ interestRate: '12', dueDate: d('2026-02-01'), status: 'SETTLED', closedOn: d('2026-01-31') }),
      [entry('REPAYMENT', '100000', '2026-01-31')],
      d('2026-12-31'),
    );
    expect(s.nextDue).toBeNull();
    expect(s.overdueDays).toBe(0);
    expect(s.outstandingPrincipal).toBe('0.0000');
    // 30 days on 1,00,000 at 12%
    expect(s.interestAccrued).toBe('986.3000');
  });
});

describe('computeLoanGivenSummary — EMI', () => {
  const emiTerms = (over: Partial<LoanTerms> = {}): LoanTerms =>
    flexible({
      principalAmount: '120000',
      repaymentMode: 'EMI',
      emiAmount: '10000',
      tenureMonths: 12,
      firstEmiDate: d('2026-02-05'),
      ...over,
    });

  it('counts instalments received and points at the next one', () => {
    const s = computeLoanGivenSummary(
      emiTerms(),
      [entry('REPAYMENT', '10000', '2026-02-05'), entry('REPAYMENT', '15000', '2026-03-05')],
      d('2026-04-01'),
    );
    expect(s.emi?.installmentsPaid).toBe(2);
    expect(s.emi?.remainingToReceive).toBe('95000.0000');
    // Third instalment due 5 Apr, ₹5,000 of it already received.
    expect(s.nextDue).toEqual({ date: '2026-04-05', amount: '5000.0000' });
    expect(s.overdueDays).toBe(0);
    expect(s.outstandingPrincipal).toBe('95000.0000');
  });

  it('amortises principal when the EMI includes interest', () => {
    // 1,00,000 at 12% over 12 months → EMI 8,884.88; after 1 EMI balance ≈ 92,115.12
    const s = computeLoanGivenSummary(
      emiTerms({ principalAmount: '100000', interestRate: '12', emiAmount: '8884.88' }),
      [entry('REPAYMENT', '8884.88', '2026-02-05')],
      d('2026-02-10'),
    );
    expect(s.emi?.installmentsPaid).toBe(1);
    expect(s.outstandingPrincipal).toBe('92115.1200');
  });

  it('shows overdue days for a missed instalment, clamping month ends', () => {
    const s = computeLoanGivenSummary(
      emiTerms({ firstEmiDate: d('2026-01-31') }),
      [entry('REPAYMENT', '10000', '2026-01-31')],
      d('2026-03-10'),
    );
    expect(s.nextDue?.date).toBe('2026-02-28');
    expect(s.overdueDays).toBe(10);
  });
});

describe('computeEmiSchedule', () => {
  const terms = (over: Partial<LoanTerms> = {}): LoanTerms => ({
    principalAmount: '60000',
    lentOn: d('2026-01-01'),
    interestRate: '0',
    dueDate: null,
    repaymentMode: 'EMI',
    emiAmount: '10000',
    tenureMonths: 6,
    firstEmiDate: d('2026-02-01'),
    status: 'ACTIVE',
    closedOn: null,
    ...over,
  });
  const marked = (kind: string, amount: string, date: string, no: number): LedgerEntry => ({
    ...entry(kind, amount, date),
    installmentNo: no,
  });

  it('is null for flexible loans', () => {
    expect(computeEmiSchedule(terms({ repaymentMode: 'FLEXIBLE' }), [])).toBeNull();
  });

  it('keeps a payment on the instalment it was marked against', () => {
    const today = d('2026-03-15');
    const rows = computeEmiSchedule(terms(), [marked('REPAYMENT', '10000', '2026-03-10', 3)], today)!;
    expect(rows.map((r) => r.status)).toEqual(['OVERDUE', 'OVERDUE', 'PAID', 'UPCOMING', 'UPCOMING', 'UPCOMING']);
    expect(rows[2]!.marked).toBe(true);
    expect(rows[2]!.lastPaidOn).toBe('2026-03-10');

    const s = computeLoanGivenSummary(terms(), [marked('REPAYMENT', '10000', '2026-03-10', 3)], today);
    expect(s.emi?.installmentsPaid).toBe(1);
    expect(s.nextDue).toEqual({ date: '2026-02-01', amount: '10000.0000' });
    expect(s.overdueDays).toBe(42);
    expect(s.outstandingPrincipal).toBe('50000.0000');
  });

  it('spills a marked overpayment into the next instalment', () => {
    const rows = computeEmiSchedule(terms(), [marked('REPAYMENT', '15000', '2026-02-01', 1)], d('2026-02-02'))!;
    expect(rows[0]!.status).toBe('PAID');
    expect(rows[1]!.status).toBe('PARTIAL');
    expect(rows[1]!.paid).toBe('5000.0000');
    expect(rows[1]!.remaining).toBe('5000.0000');
    expect(rows[1]!.marked).toBe(false);
  });

  it('fills untied repayments around marked instalments, oldest first', () => {
    const rows = computeEmiSchedule(
      terms(),
      [marked('WAIVER', '10000', '2026-02-01', 1), entry('REPAYMENT', '12000', '2026-02-20')],
      d('2026-02-25'),
    )!;
    expect(rows[0]!.status).toBe('WAIVED');
    expect(rows[1]!.status).toBe('PAID');
    expect(rows[2]!.paid).toBe('2000.0000');
  });

  it('flags instalments due within a week as DUE', () => {
    const rows = computeEmiSchedule(terms(), [], d('2026-01-26'))!;
    expect(rows[0]!.status).toBe('DUE');
    expect(rows[1]!.status).toBe('UPCOMING');
  });

  it('splits interest and principal on an interest-bearing EMI', () => {
    const rows = computeEmiSchedule(
      terms({ principalAmount: '100000', interestRate: '12', emiAmount: '8884.88', tenureMonths: 12 }),
      [],
      d('2026-01-01'),
    )!;
    expect(rows[0]!.interest).toBe('1000.0000');
    expect(rows[0]!.principal).toBe('7884.8800');
    expect(rows[0]!.balanceAfter).toBe('92115.1200');
    expect(new Decimal(rows[11]!.balanceAfter).lessThan(1)).toBe(true);
  });
});
