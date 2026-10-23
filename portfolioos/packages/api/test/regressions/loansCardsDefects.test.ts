import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  addStatement,
  createCard,
  deleteStatement,
  getCardSummary,
  markStatementPaid,
} from '../../src/services/banking/creditCards.service.js';
import {
  computeLoanSummary,
  loanPosition,
  type StoredLoan,
} from '../../src/services/loans/loans.service.js';
import { getDashboardNetWorth } from '../../src/services/analytics/dashboard.service.js';
import { loansAdapter } from '../../src/services/will/estate/adapters/credit.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

const D = (v: string) => new Prisma.Decimal(v);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ── 1. Credit-card outstanding follows its statements ────────────────────────

describe('credit-card outstanding is derived from unpaid statements', () => {
  let scope: TestScope;
  let cardId: string;

  beforeAll(async () => {
    scope = await createTestScope('cc-outstanding');
  });
  afterAll(async () => {
    await prisma.creditCardStatement.deleteMany({ where: { card: { userId: scope.userId } } });
    await prisma.creditCard.deleteMany({ where: { userId: scope.userId } });
    await scope.cleanup();
  });

  const outstanding = () =>
    scope.runAs(async () => (await prisma.creditCard.findUniqueOrThrow({ where: { id: cardId } })).outstandingBalance?.toString());

  it('adds, pays, un-pays and deletes statements and the balance tracks each step', async () => {
    await scope.runAs(async () => {
      const card = await createCard(scope.userId, {
        issuerBank: 'HDFC', cardName: 'Regalia', last4: '4242', creditLimit: '100000', statementDay: 5, dueDay: 25,
      });
      cardId = card.id;
    });

    const sep = await scope.runAs(() => addStatement(scope.userId, cardId, {
      forMonth: '2026-09', statementAmount: '10000', dueDate: '2026-09-25', status: 'PENDING',
    }));
    const oct = await scope.runAs(() => addStatement(scope.userId, cardId, {
      forMonth: '2026-10', statementAmount: '5000', dueDate: '2026-10-25', status: 'PENDING',
    }));
    // Both bills are unpaid: ₹15,000 owed, not just the newest ₹5,000.
    expect(await outstanding()).toBe('15000');

    await scope.runAs(() => markStatementPaid(scope.userId, sep.id, { paidAmount: '10000', paidOn: '2026-09-20' }));
    expect(await outstanding()).toBe('5000');

    // Part payment leaves the remainder owed.
    await scope.runAs(() => markStatementPaid(scope.userId, oct.id, { paidAmount: '2000', paidOn: '2026-10-20' }));
    expect(await outstanding()).toBe('3000');

    // Un-paying September puts it back.
    await scope.runAs(() => markStatementPaid(scope.userId, sep.id, { paidAmount: '0', paidOn: '2026-09-20', status: 'PENDING' }));
    expect(await outstanding()).toBe('13000');

    await scope.runAs(() => deleteStatement(scope.userId, sep.id));
    expect(await outstanding()).toBe('3000');

    const summary = await scope.runAs(() => getCardSummary(scope.userId, cardId));
    expect(summary.outstanding).toBe('3000.0000');
    expect(summary.utilizationPct).toBe(3);
  });
});

// ── 2. A defaulted loan is still owed ────────────────────────────────────────

describe('a DEFAULT loan stays a liability', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('loan-default');
    await scope.runAs(async () => {
      const base = {
        userId: scope.userId, loanType: 'PERSONAL', borrowerName: 'Test', interestRate: D('12'),
        tenureMonths: 12, disbursementDate: date('2026-09-01'), firstEmiDate: date('2026-10-05'),
      };
      await prisma.loan.create({ data: { ...base, lenderName: 'Active Bank', principalAmount: D('100000'), emiAmount: D('8884.88') } });
      await prisma.loan.create({ data: { ...base, lenderName: 'Default Bank', principalAmount: D('200000'), emiAmount: D('17769.76'), status: 'DEFAULT' } });
      await prisma.loan.create({ data: { ...base, lenderName: 'Closed Bank', principalAmount: D('50000'), emiAmount: D('4442.44'), status: 'CLOSED' } });
    });
  });
  afterAll(async () => {
    await prisma.loan.deleteMany({ where: { userId: scope.userId } });
    await scope.cleanup();
  });

  it('counts toward dashboard liabilities but not monthly EMIs', async () => {
    const nw = await scope.runAs(() => getDashboardNetWorth(scope.userId));
    expect(nw.liabilities.loanCount).toBe(2);
    expect(new Prisma.Decimal(nw.liabilities.totalOutstanding).greaterThan(D('200000'))).toBe(true);
    expect(nw.liabilities.monthlyEmiTotal).toBe('8884.8800');
    expect(nw.liabilities.upcomingEmis.map((e) => e.lenderName)).not.toContain('Default Bank');
    expect(nw.liabilities.overdueEmis.map((e) => e.lenderName)).not.toContain('Default Bank');
  });

  it('is listed in the will estate', async () => {
    const rows = await scope.runAs(() => loansAdapter.collect({ userId: scope.userId } as never));
    expect(rows.map((r) => r.label).join('|')).toContain('Default Bank');
    expect(rows).toHaveLength(2);
  });
});

// ── 3 + 4. One outstanding definition; one tax calculator ────────────────────

// ₹6,00,000 car loan at 9% for 12 months, first EMI 5 Feb 2026.
function loan(overrides: Partial<StoredLoan> = {}): StoredLoan {
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

describe('loan outstanding has one definition', () => {
  it('loanPosition matches the Loans page summary when past EMIs were never marked paid', () => {
    const asOf = date('2026-06-10');
    const summary = computeLoanSummary(loan(), asOf);
    const position = loanPosition(loan(), asOf);
    expect(position.outstanding.toFixed(4)).toBe(summary.outstandingBalance);
  });

  it('a loan whose whole schedule is past, none marked, is not shown as fully owed', () => {
    const summary = computeLoanSummary(loan(), date('2027-06-01'));
    expect(summary.outstandingBalance).toBe('0.0000');
    expect(loanPosition(loan(), date('2027-06-01')).outstanding.toFixed(4)).toBe('0.0000');
  });
});

describe('loan tax panel uses the shared calculator rules', () => {
  // ₹50 lakh home loan, 9%, 20 years from April 2026: interest > ₹2 lakh, principal < ₹1.5 lakh in FY26-27.
  const home = loan({
    principalAmount: D('5000000'), interestRate: D('9'), tenureMonths: 240,
    emiAmount: D('44986.30'), firstEmiDate: date('2026-04-05'), taxBenefitSection: '80C+24B',
  });

  it('adds 4% cess to the 30% slab and says what it assumes', () => {
    const tb = computeLoanSummary(home, date('2026-10-01')).taxBenefit!;
    const deductions = new Prisma.Decimal(tb.principalDeduction!).plus(tb.interestDeduction!);
    expect(tb.interestDeduction).toBe('200000.0000');
    expect(tb.estimatedTaxSaving).toBe(serialize(deductions.times('0.312')));
    expect(tb.assumption).toMatch(/old tax regime/i);
  });

  it('stops the 80E deduction after 8 years from the first repayment', () => {
    const edu = loan({
      principalAmount: D('1000000'), interestRate: D('10'), tenureMonths: 180,
      emiAmount: D('10746.05'), firstEmiDate: date('2016-07-05'), taxBenefitSection: '80E',
    });
    const inYear8 = computeLoanSummary(edu, date('2023-10-01')).taxBenefit!;
    expect(new Prisma.Decimal(inYear8.estimatedTaxSaving).greaterThan(0)).toBe(true);
    const inYear11 = computeLoanSummary(edu, date('2026-10-01')).taxBenefit!;
    expect(inYear11.estimatedTaxSaving).toBe('0.0000');
    expect(inYear11.note).toMatch(/8 years/);
  });
});

function serialize(x: Prisma.Decimal): string {
  return x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
}
