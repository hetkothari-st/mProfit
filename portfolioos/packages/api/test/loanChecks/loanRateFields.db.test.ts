import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../src/lib/errors.js';
import {
  computeLoanSummary, createLoan, updateLoan, type CreateLoanInput, type StoredLoan,
} from '../../src/services/loans.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const BASE: CreateLoanInput = {
  lenderName: 'HDFC Bank', loanType: 'HOME', borrowerName: 'Test Borrower', principalAmount: '3000000', interestRate: '9.10',
  tenureMonths: 180, emiAmount: '30607', emiDueDay: 5, disbursementDate: '2026-10-01', firstEmiDate: '2026-11-05',
};
const iso = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

let user: TestScope;
let other: TestScope;
beforeAll(async () => {
  user = await createTestScope('loan-rate-fields');
  other = await createTestScope('loan-rate-fields-other');
});
afterAll(async () => {
  await user.cleanup();
  await other.cleanup();
});
const as = <T>(fn: () => Promise<T>) => user.runAs(fn);

describe('loan rate fields (spec s6.1)', () => {
  it('a new loan starts UNKNOWN with no benchmark', async () => {
    const loan = await as(() => createLoan(user.userId, BASE));
    expect(loan).toMatchObject({ rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: null });
  });

  it('stores a floating repo-linked loan with its next reset date', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }));
    expect(loan).toMatchObject({ rateType: 'FLOATING', rateBenchmark: 'REPO' });
    expect(iso(loan.nextRateResetDate)).toBe('2027-01-01');
  });

  it('refuses a benchmark or reset date on a loan that is not floating', async () => {
    await expect(as(() => createLoan(user.userId, { ...BASE, rateType: 'FIXED', rateBenchmark: 'REPO' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(as(() => createLoan(user.userId, { ...BASE, nextRateResetDate: '2027-01-01' }))).rejects.toBeInstanceOf(ValidationError);
    const unknown = await as(() => createLoan(user.userId, BASE));
    await expect(as(() => updateLoan(user.userId, unknown.id, { rateBenchmark: 'MCLR' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('switching a floating loan to fixed clears the benchmark and reset date', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '2027-04-01' }));
    const fixed = await as(() => updateLoan(user.userId, loan.id, { rateType: 'FIXED' }));
    expect(fixed).toMatchObject({ rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null });
  });

  it('changing only the reset date of a floating loan keeps its benchmark', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO' }));
    const moved = await as(() => updateLoan(user.userId, loan.id, { nextRateResetDate: '2027-02-01' }));
    expect(moved.rateBenchmark).toBe('REPO');
    expect(iso(moved.nextRateResetDate)).toBe('2027-02-01');
  });

  it('refuses a reset date that is not on the calendar (2026-02-30), on create and on update', async () => {
    const create = as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2026-02-30' }));
    await expect(create).rejects.toBeInstanceOf(ValidationError);
    await expect(create).rejects.toMatchObject({ statusCode: 422, details: { field: 'nextRateResetDate' } });
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO' }));
    await expect(as(() => updateLoan(user.userId, loan.id, { nextRateResetDate: '2026-02-30' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('an UNKNOWN loan becomes FLOATING with its benchmark and reset date in one patch', async () => {
    const loan = await as(() => createLoan(user.userId, BASE));
    const updated = await as(() => updateLoan(user.userId, loan.id, { rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '2027-04-01' }));
    expect(updated).toMatchObject({ rateType: 'FLOATING', rateBenchmark: 'MCLR' });
    expect(iso(updated.nextRateResetDate)).toBe('2027-04-01');
  });

  it("another user's loan cannot be updated: not found, and nothing changes", async () => {
    const loan = await as(() => createLoan(user.userId, BASE));
    await expect(other.runAs(() => updateLoan(other.userId, loan.id, { rateType: 'FLOATING', rateBenchmark: 'REPO' })))
      .rejects.toBeInstanceOf(NotFoundError);
    const after = await as(() => updateLoan(user.userId, loan.id, {}));
    expect(after).toMatchObject({ rateType: 'UNKNOWN', rateBenchmark: null });
  });

  it('an unrelated edit leaves the rate fields alone', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }));
    const edited = await as(() => updateLoan(user.userId, loan.id, { borrowerName: 'Renamed' }));
    expect(edited).toMatchObject({ rateType: 'FLOATING', rateBenchmark: 'REPO' });
    expect(iso(edited.nextRateResetDate)).toBe('2027-01-01');
  });
});

describe('computeLoanSummary as of a date', () => {
  const stored: StoredLoan = {
    id: 'pure', principalAmount: new Prisma.Decimal('3000000'), interestRate: new Prisma.Decimal('9.10'), tenureMonths: 180,
    emiAmount: new Prisma.Decimal('30607'), emiDueDay: 5, firstEmiDate: new Date('2026-11-05T00:00:00Z'),
    prepaymentOption: 'REDUCE_TENURE', payments: [],
  };
  it('before the first EMI everything is still outstanding', () => {
    const s = computeLoanSummary(stored, new Date('2026-10-12T03:00:00Z'));
    expect(s).toMatchObject({ outstandingBalance: '3000000.0000', remainingEmiCount: 180, nextEmiDate: '2026-11-05' });
  });
  it('a later date moves the next EMI on (unpaid past rows are not counted, as before)', () => {
    const s = computeLoanSummary(stored, new Date('2026-12-06T03:00:00Z'));
    expect(s.nextEmiDate).toBe('2027-01-05');
    expect(s.remainingEmiCount).toBe(178);
  });
});
