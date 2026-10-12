import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Alert } from '@prisma/client';
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
const NEXT_MONTH = new Date('2026-11-12T03:00:00Z');
const BEFORE_CHANGES = new Date('2026-09-01T00:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

let owner: TestScope;
let optedOut: TestScope;
let managedId = '';
let caClientId = '';
const ids: Record<string, string> = {};
const scope = () => [owner.userId, optedOut.userId, managedId, caClientId];

async function shadowUser(label: string, managedById: string | null): Promise<string> {
  const row = await sys(() => prisma.user.create({
    data: { email: `inv-${label}-${randomUUID().slice(0, 8)}@test.local`, passwordHash: 'test-not-a-real-hash', name: `Test ${label}`, isShadowClient: true, managedById },
  }));
  return row.id;
}

interface LoanSpec { lenderName: string; rate: string; emi: string; loanType?: string; rateType: string; rateBenchmark?: string; nextRateResetDate?: string; createdAt?: Date }
async function addLoan(name: string, userId: string, spec: LoanSpec): Promise<void> {
  const row = await sys(() => prisma.loan.create({
    data: {
      userId, lenderName: spec.lenderName, loanType: spec.loanType ?? 'HOME', borrowerName: 'Test Borrower',
      principalAmount: '3000000', interestRate: spec.rate, tenureMonths: 180, emiAmount: spec.emi, emiDueDay: 5,
      disbursementDate: day('2026-10-01'), firstEmiDate: day('2026-11-05'),
      rateType: spec.rateType, rateBenchmark: spec.rateBenchmark ?? null,
      nextRateResetDate: spec.nextRateResetDate ? day(spec.nextRateResetDate) : null,
      createdAt: spec.createdAt ?? BEFORE_CHANGES,
    },
  }));
  ids[name] = row.id;
}

async function alertsOf(userId: string): Promise<Alert[]> {
  return sys(() => prisma.alert.findMany({
    where: { userId, type: { in: ['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE'] } },
    orderBy: { createdAt: 'asc' },
  }));
}
const loanIdOf = (a: Alert) => (a.metadata as { loanId?: string }).loanId;

beforeAll(async () => {
  owner = await createTestScope('loan-checks-owner');
  optedOut = await createTestScope('loan-checks-opted-out');
  managedId = await shadowUser('loan-checks-managed', owner.userId);
  caClientId = await shadowUser('loan-checks-ca-client', null);
  await sys(() => prisma.user.update({ where: { id: optedOut.userId }, data: { loanRateAlerts: false } }));

  await sys(() => ensureLoanRateSources(true));
  await clearLoanRateTables();
  await sys(async () => {
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - HOUR) } });
    await prisma.loanRateSource.update({ where: { id: 'kotak.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - 8 * DAY) } });
    await prisma.loanRate.createMany({
      data: [
        { sourceId: 'sbi.home', basis: 'REPO_LINKED', minRatePct: '8.35', maxRatePct: '10.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 2 * HOUR) },
        // Lower but stale: must not drive a refinance alert.
        { sourceId: 'kotak.home', basis: 'REPO_LINKED', minRatePct: '7.70', maxRatePct: '13.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 8 * DAY) },
      ],
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

  // A: fixed, 0.75 pp above the market -> refinance.
  await addLoan('A', owner.userId, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
  // B: floating repo-linked, reset date in the past -> repo alert with the rolled-forward reset.
  await addLoan('B', owner.userId, { lenderName: 'State Bank of India', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2026-07-01' });
  // C: floating MCLR with a tracked lender -> MCLR alert only.
  await addLoan('C', owner.userId, { lenderName: 'SBI', rate: '8.60', emi: '29719', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
  // D: UNKNOWN rate type, close to the market -> nothing.
  await addLoan('D', owner.userId, { lenderName: 'Axis Bank', rate: '8.50', emi: '29543', rateType: 'UNKNOWN' });
  // E: floating repo, but added after the cut was seen -> nothing (and no CAR market rates).
  await addLoan('E', owner.userId, { lenderName: 'HDFC Bank', loanType: 'CAR', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'REPO', createdAt: new Date('2026-10-11T00:00:00Z') });
  // I: floating MCLR with an untracked lender -> no MCLR alert, and the repo cut is not its benchmark.
  await addLoan('I', owner.userId, { lenderName: 'Bajaj Finance', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
  // G: managed family profile, same as A -> refinance on the profile's own alerts.
  await addLoan('G', managedId, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
  // F: opted out; H: a CA-owned shadow client -> nothing for either.
  await addLoan('F', optedOut.userId, { lenderName: 'HDFC Bank', rate: '9.50', emi: '31327', rateType: 'FIXED' });
  await addLoan('H', caClientId, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
});

afterAll(async () => {
  await sys(() => prisma.user.deleteMany({ where: { id: { in: [managedId, caClientId] } } }));
  await clearLoanRateTables();
  await owner.cleanup();
  await optedOut.cleanup();
});

describe('runLoanChecks (spec s6.3)', () => {
  it('first run: refinance for loans well above the market, benchmark alerts for matching floating loans only', async () => {
    const result = await runLoanChecks({ now: NOW, userIds: scope() });
    expect(result).toEqual({ users: 2, refinance: 2, benchmark: 2, changes: 2, failedLoans: 0, failedUsers: 0 });

    const mine = await alertsOf(owner.userId);
    const of = (name: string) => mine.filter((a) => loanIdOf(a) === ids[name]);

    expect(of('A')).toHaveLength(1);
    expect(of('A')[0]).toMatchObject({
      type: 'LOAN_REFINANCE',
      title: 'Home loan with HDFC Bank at 9.10%; market from 8.35%',
      description: 'Switching could save ≈ ₹2.1 lakh after switching costs (lowest: SBI). Open the loan to compare.',
    });
    expect(of('A')[0]!.metadata).toMatchObject({
      key: `loan:refi:${ids.A}:2026-10`, month: '2026-10', currentRatePct: '9.10', marketRatePct: '8.35', marketLender: 'SBI',
      netSaving: '214108.70', breakEvenMonth: 19,
    });

    expect(of('B')).toHaveLength(1);
    expect(of('B')[0]).toMatchObject({
      type: 'LOAN_BENCHMARK_CHANGE',
      title: 'RBI cut the repo rate by 0.25% on 08/10/2026',
      description: 'Your State Bank of India loan rate should drop at the next reset (≈ 01/01/2027). Estimated: EMI ≈ ₹29,105 or tenure -5 months, assuming the full change is passed on.',
    });
    expect(of('B')[0]!.metadata).toMatchObject({
      key: `loan:bench:${ids.B}:REPO:2026-10-08`, kind: 'REPO', effectiveDate: '2026-10-08', deltaPct: '-0.25', nextResetDate: '2027-01-01',
      newEmi: '29105', tenureDeltaMonths: -5,
    });

    expect(of('C')).toHaveLength(1);
    expect(of('C')[0]).toMatchObject({
      type: 'LOAN_BENCHMARK_CHANGE',
      title: 'SBI cut its 1-year MCLR by 0.10% on 10/10/2026',
      description: 'Your SBI loan rate should drop at the next reset. Estimated: EMI ≈ ₹29,543 or tenure -2 months, assuming the full change is passed on.',
    });

    for (const name of ['D', 'E', 'I']) expect(of(name), name).toEqual([]);
    expect(mine).toHaveLength(3);
    expect((await alertsOf(managedId)).map((a) => [a.type, loanIdOf(a)])).toEqual([['LOAN_REFINANCE', ids.G]]);
    expect(await alertsOf(optedOut.userId)).toEqual([]);
    expect(await alertsOf(caClientId)).toEqual([]);
  });

  it('a second run the same day creates nothing', async () => {
    const result = await runLoanChecks({ now: new Date(NOW.getTime() + 2 * HOUR), userIds: scope() });
    expect(result).toMatchObject({ refinance: 0, benchmark: 0 });
    expect(await alertsOf(owner.userId)).toHaveLength(3);
  });

  it('next month: one new refinance alert per loan, no repeated benchmark alert', async () => {
    await sys(() => prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: new Date(NEXT_MONTH.getTime() - HOUR) } }));
    const result = await runLoanChecks({ now: NEXT_MONTH, userIds: scope() });
    expect(result).toMatchObject({ refinance: 2, benchmark: 0, changes: 0 });
    const keys = (await alertsOf(owner.userId)).map((a) => (a.metadata as { key: string }).key);
    expect(keys).toContain(`loan:refi:${ids.A}:2026-11`);
    expect(keys).toHaveLength(4);
  });
});
