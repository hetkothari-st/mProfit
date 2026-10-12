import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Alert } from '@prisma/client';
import type { MarketRateWire, RateLoanType } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runLoanChecks } from '../../src/jobs/loanChecksJob.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/** 08:30 IST, an hour after the 07:30 rates run. */
const NOW = new Date('2026-10-12T03:00:00Z');
const BEFORE_CHANGES = new Date('2026-09-01T00:00:00Z');
const HOUR = 3_600_000;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const SBI_HOME: MarketRateWire = {
  sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: '2026-10-12', sourceUrl: 'https://sbi.bank.in/web/interest-rates',
};

const scopes: TestScope[] = [];
async function scope(label: string): Promise<string> {
  const s = await createTestScope(label);
  scopes.push(s);
  return s.userId;
}

interface LoanSpec {
  lenderName: string; rate: string; emi: string; rateType: string; rateBenchmark?: string; tenureMonths?: number; principal?: string;
}
async function addLoan(userId: string, spec: LoanSpec): Promise<string> {
  const row = await sys(() => prisma.loan.create({
    data: {
      userId, lenderName: spec.lenderName, loanType: 'HOME', borrowerName: 'Test Borrower',
      principalAmount: spec.principal ?? '3000000', interestRate: spec.rate, tenureMonths: spec.tenureMonths ?? 180,
      emiAmount: spec.emi, emiDueDay: 5, disbursementDate: day('2026-10-01'), firstEmiDate: day('2026-11-05'),
      rateType: spec.rateType, rateBenchmark: spec.rateBenchmark ?? null, createdAt: BEFORE_CHANGES,
    },
  }));
  return row.id;
}

async function alertsOf(userId: string): Promise<Alert[]> {
  return sys(() => prisma.alert.findMany({
    where: { userId, type: { in: ['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE'] } },
    orderBy: { createdAt: 'asc' },
  }));
}
const loanIdOf = (a: Alert) => (a.metadata as { loanId?: string }).loanId;

beforeAll(async () => {
  await sys(() => ensureLoanRateSources(true));
  await clearLoanRateTables();
  await sys(async () => {
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - HOUR) } });
    await prisma.loanRate.create({
      data: { sourceId: 'sbi.home', basis: 'REPO_LINKED', minRatePct: '8.35', maxRatePct: '10.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 2 * HOUR) },
    });
    await prisma.benchmarkRate.createMany({
      data: [
        { kind: 'REPO', lender: null, tenor: null, ratePct: '5.50', effectiveDate: day('2026-06-06'), fetchedAt: new Date('2026-06-06T04:00:00Z') },
        { kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: day('2026-10-08'), fetchedAt: new Date('2026-10-09T02:00:00Z') },
        { kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.75', effectiveDate: day('2026-09-15'), fetchedAt: new Date('2026-09-15T02:00:00Z') },
        { kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.65', effectiveDate: day('2026-10-10'), fetchedAt: new Date('2026-10-10T02:00:00Z') },
      ],
    });
  });
});

afterAll(async () => {
  await clearLoanRateTables();
  for (const s of scopes) await s.cleanup();
});

describe('runLoanChecks: refinance thresholds (spec s6.3)', () => {
  it('gap >= 0.50 pp but no net saving after switching costs (short remaining tenure): no alert', async () => {
    const user = await scope('loan-checks-short-tenure');
    await addLoan(user, { lenderName: 'HDFC Bank', rate: '9.10', emi: '262600', rateType: 'FIXED', tenureMonths: 12 });
    const result = await runLoanChecks({ now: NOW, userIds: [user] });
    expect(result).toMatchObject({ users: 1, refinance: 0, benchmark: 0, failedLoans: 0, failedUsers: 0 });
    expect(await alertsOf(user)).toEqual([]);
  });

  it('a gap of exactly 0.50 pp alerts', async () => {
    const user = await scope('loan-checks-boundary');
    const loanId = await addLoan(user, { lenderName: 'HDFC Bank', rate: '8.85', emi: '30160', rateType: 'FIXED' });
    const result = await runLoanChecks({ now: NOW, userIds: [user] });
    expect(result).toMatchObject({ refinance: 1, failedLoans: 0 });
    const alerts = await alertsOf(user);
    expect(alerts.map((a) => [a.type, loanIdOf(a)])).toEqual([['LOAN_REFINANCE', loanId]]);
    expect(alerts[0]!.metadata).toMatchObject({ currentRatePct: '8.85', marketRatePct: '8.35' });
  });
});

describe('runLoanChecks: benchmark guards (spec s6.3)', () => {
  it('FIXED and UNKNOWN loans with rateBenchmark REPO set in the DB get no benchmark alert', async () => {
    const user = await scope('loan-checks-not-floating');
    await addLoan(user, { lenderName: 'State Bank of India', rate: '8.50', emi: '29543', rateType: 'FIXED', rateBenchmark: 'REPO' });
    await addLoan(user, { lenderName: 'State Bank of India', rate: '8.50', emi: '29543', rateType: 'UNKNOWN', rateBenchmark: 'REPO' });
    const result = await runLoanChecks({ now: NOW, userIds: [user] });
    expect(result).toMatchObject({ users: 1, refinance: 0, benchmark: 0, changes: 2, failedLoans: 0 });
    expect(await alertsOf(user)).toEqual([]);
  });

  it('an MCLR loan with LIC Housing Finance (matched lender, no MCLR series): no alert and no error', async () => {
    const user = await scope('loan-checks-lic');
    await addLoan(user, { lenderName: 'LIC Housing Finance', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
    const result = await runLoanChecks({ now: NOW, userIds: [user] });
    expect(result).toMatchObject({ users: 1, refinance: 0, benchmark: 0, failedLoans: 0, failedUsers: 0 });
    expect(await alertsOf(user)).toEqual([]);
  });
});

describe('runLoanChecks: eligible users (plan ruling 10)', () => {
  it('skips an inactive user and a user scheduled for deletion', async () => {
    const inactive = await scope('loan-checks-inactive');
    const leaving = await scope('loan-checks-leaving');
    await addLoan(inactive, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
    await addLoan(leaving, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
    await sys(async () => {
      await prisma.user.update({ where: { id: inactive }, data: { isActive: false } });
      await prisma.user.update({ where: { id: leaving }, data: { deletionScheduledFor: new Date('2026-11-12T00:00:00Z') } });
    });
    const result = await runLoanChecks({ now: NOW, userIds: [inactive, leaving] });
    expect(result).toMatchObject({ users: 0, refinance: 0, benchmark: 0 });
    expect(await alertsOf(inactive)).toEqual([]);
    expect(await alertsOf(leaving)).toEqual([]);
  });
});

describe('runLoanChecks: a failed market lookup (review fix)', () => {
  it('is not cached for the run: a later user still gets the refinance alert', async () => {
    const first = await scope('loan-checks-lookup-1');
    const second = await scope('loan-checks-lookup-2');
    await addLoan(first, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
    await addLoan(second, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
    const calls: RateLoanType[] = [];
    const marketLookup = async (type: RateLoanType): Promise<MarketRateWire | null> => {
      calls.push(type);
      if (calls.length === 1) throw new Error('transient db error');
      return SBI_HOME;
    };
    const result = await runLoanChecks({ now: NOW, userIds: [first, second], marketLookup });
    expect(result).toMatchObject({ users: 2, refinance: 1, failedLoans: 1, failedUsers: 0 });
    expect(calls).toEqual(['HOME', 'HOME']);
    const alerted = [...(await alertsOf(first)), ...(await alertsOf(second))];
    expect(alerted.map((a) => a.type)).toEqual(['LOAN_REFINANCE']);
  });

  it('does not stop the benchmark alert of a floating repo loan', async () => {
    const user = await scope('loan-checks-lookup-down');
    const loanId = await addLoan(user, { lenderName: 'State Bank of India', rate: '9.10', emi: '30607', rateType: 'FLOATING', rateBenchmark: 'REPO' });
    const marketLookup = async (): Promise<MarketRateWire | null> => {
      throw new Error('market lookup down');
    };
    const result = await runLoanChecks({ now: NOW, userIds: [user], marketLookup });
    expect(result).toMatchObject({ users: 1, refinance: 0, benchmark: 1, failedLoans: 1, failedUsers: 0 });
    expect((await alertsOf(user)).map((a) => [a.type, loanIdOf(a)])).toEqual([['LOAN_BENCHMARK_CHANGE', loanId]]);
  });
});
