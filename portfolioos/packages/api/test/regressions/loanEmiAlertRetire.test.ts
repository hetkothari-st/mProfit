import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { generateLoanEmiAlerts } from '../../src/services/loans/loans.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/**
 * EMI alert keys carry the day-count, so each day used to add a new alert and leave the old one open
 * ("EMI due today" still showing weeks later). One scan must leave exactly the alert that is true now.
 */
const DAY = 86_400_000;
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

let scope: TestScope;
let loanId: string;

beforeAll(async () => {
  scope = await createTestScope('loan-emi-retire');
  loanId = await runAsSystem(async () => {
    const loan = await prisma.loan.create({
      data: {
        userId: scope.userId, lenderName: 'Test Bank', loanType: 'HOME', borrowerName: 'Test Borrower',
        principalAmount: '1000000', interestRate: '9', tenureMonths: 48, emiAmount: '24885.04',
        emiDueDay: daysAgo(10).getUTCDate(), disbursementDate: daysAgo(70), firstEmiDate: daysAgo(10),
        createdAt: daysAgo(60),
      },
    });
    // What earlier days' scans left behind: a "due today" alert for a long-gone date, and one for a loan
    // that no longer exists.
    await prisma.alert.createMany({
      data: [
        { userId: scope.userId, type: 'LOAN_EMI_DUE', title: 'Test Bank EMI due today', triggerDate: daysAgo(40),
          metadata: { key: `loan_emi:${loan.id}:2000-01-05:0d`, loanId: loan.id } },
        { userId: scope.userId, type: 'LOAN_EMI_DUE', title: 'Gone Bank EMI overdue', triggerDate: daysAgo(40),
          metadata: { key: 'loan_emi:deleted-loan:2000-01-05:overdue', loanId: 'deleted-loan' } },
      ],
    });
    return loan.id;
  });
});

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.alert.deleteMany({ where: { userId: scope.userId } });
    await prisma.loan.deleteMany({ where: { userId: scope.userId } });
  });
  await scope.cleanup();
});

describe('generateLoanEmiAlerts — retires alerts that are no longer true', () => {
  const open = () =>
    runAsSystem(() => prisma.alert.findMany({ where: { userId: scope.userId, type: 'LOAN_EMI_DUE', isActive: true } }));

  it('closes superseded and orphaned EMI alerts and keeps only the current one', async () => {
    await scope.runAs(() => generateLoanEmiAlerts(scope.userId));
    const now = await open();
    expect(now).toHaveLength(1);
    expect(now[0]!.title).toMatch(/Test Bank EMI overdue by 10 days/);
    expect((now[0]!.metadata as { loanId: string }).loanId).toBe(loanId);
    // Dates in alert text follow the app-wide dd/mm/yyyy, never a raw ISO date.
    expect(now[0]!.description).toMatch(/was due on \d{2}\/\d{2}\/\d{4}$/);
  });

  it('is idempotent: a second scan creates nothing and closes nothing', async () => {
    const created = await scope.runAs(() => generateLoanEmiAlerts(scope.userId));
    expect(created).toBe(0);
    expect(await open()).toHaveLength(1);
  });
});
