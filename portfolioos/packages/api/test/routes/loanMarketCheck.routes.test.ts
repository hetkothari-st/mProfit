import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { LoanMarketCheckWire } from '@everypaisa/shared';
import { Decimal } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { loansRouter } from '../../src/routes/loans.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { computeLoanSummary, type StoredLoan } from '../../src/services/loans.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let other: TestScope;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** The 5th of the month `offset` months from today (UTC), as YYYY-MM-DD. */
const fifth = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 5)).toISOString().slice(0, 10);
};
const token = (u: TestScope) => signAccessToken({ sub: u.userId, email: `${u.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
async function check(loanId: string, as: TestScope | null = user): Promise<Response> {
  return fetch(`${base}/api/loans/${loanId}/market-check`, { headers: as ? { authorization: `Bearer ${token(as)}` } : {} });
}
async function body(loanId: string): Promise<LoanMarketCheckWire> {
  const res = await check(loanId);
  expect(res.status).toBe(200);
  return (await res.json()).data as LoanMarketCheckWire;
}

async function loan(owner: TestScope, data: { lenderName?: string; loanType?: string; rate?: string; emi?: string; rateType?: string; rateBenchmark?: string | null; firstEmiDate?: string }) {
  return sys(() => prisma.loan.create({
    data: {
      userId: owner.userId, lenderName: data.lenderName ?? 'HDFC Bank', loanType: data.loanType ?? 'HOME', borrowerName: 'Test Borrower',
      principalAmount: '3000000', interestRate: data.rate ?? '9.10', tenureMonths: 180, emiAmount: data.emi ?? '30607', emiDueDay: 5,
      disbursementDate: day(fifth(-4)), firstEmiDate: day(data.firstEmiDate ?? fifth(1)),
      rateType: data.rateType ?? 'FIXED', rateBenchmark: data.rateBenchmark ?? null,
    },
  }));
}

async function seedRates() {
  await sys(async () => {
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: ago(1) } });
    await prisma.loanRateSource.update({ where: { id: 'kotak.home' }, data: { lastSuccessAt: ago(8 * 24) } });
    await prisma.loanRate.createMany({
      data: [
        { sourceId: 'sbi.home', basis: 'REPO_LINKED', minRatePct: '8.35', maxRatePct: '10.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: ago(2) },
        // Lower, but stale (no success for 8 days): never the market rate.
        { sourceId: 'kotak.home', basis: 'REPO_LINKED', minRatePct: '7.70', maxRatePct: '13.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: ago(8 * 24) },
        // Lower, but held for review: never shown.
        { sourceId: 'axis.home', basis: 'REPO_LINKED', minRatePct: '5.00', origin: 'AUTO', status: 'SUSPECT', fetchedAt: ago(2) },
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
}

beforeAll(async () => {
  user = await createTestScope('loan-market-check');
  other = await createTestScope('loan-market-check-other');
  await sys(() => ensureLoanRateSources(true));
  const app = express();
  app.use(express.json());
  app.use('/api/loans', loansRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await clearLoanRateTables();
  await seedRates();
});
afterAll(async () => {
  server.close();
  await clearLoanRateTables();
  await user.cleanup();
  await other.cleanup();
});

describe('GET /api/loans/:id/market-check', () => {
  it('requires auth and ownership', async () => {
    const mine = await loan(user, {});
    expect((await check(mine.id, null)).status).toBe(401);
    expect((await check(mine.id, other)).status).toBe(404);
  });

  it('a fixed home loan: position from its schedule, lowest fresh market rate, no benchmark', async () => {
    const l = await loan(user, {});
    expect(await body(l.id)).toEqual({
      loanId: l.id, status: 'ACTIVE', loanType: 'HOME', rateLoanType: 'HOME', lender: 'HDFC Bank',
      rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null, currentRatePct: '9.10',
      outstanding: '3000000.00', remainingMonths: 180, nextEmiDate: fifth(1),
      market: { sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: expect.any(String), sourceUrl: expect.stringMatching(/^https:\/\//) },
      benchmark: null,
    });
  });

  it('a floating repo-linked loan shows the repo series and its last change', async () => {
    const l = await loan(user, { rateType: 'FLOATING', rateBenchmark: 'REPO', rate: '8.50', emi: '29543' });
    expect((await body(l.id)).benchmark).toEqual({
      kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: '2026-10-08',
      lastChange: { deltaPct: '-0.25', date: '2026-10-08' },
    });
  });

  it('a floating MCLR loan with a matched lender shows that lender 1-year MCLR', async () => {
    const l = await loan(user, { lenderName: 'State Bank of India', rateType: 'FLOATING', rateBenchmark: 'MCLR', rate: '8.60', emi: '29719' });
    const b = await body(l.id);
    expect(b.lender).toBe('SBI');
    expect(b.benchmark).toEqual({
      kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.65', effectiveDate: '2026-10-10',
      lastChange: { deltaPct: '-0.10', date: '2026-10-10' },
    });
  });

  it('a floating MCLR loan with an unmatched lender falls back to the repo rate', async () => {
    const l = await loan(user, { lenderName: 'Bajaj Finance', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
    const b = await body(l.id);
    expect(b.lender).toBeNull();
    expect(b.benchmark?.kind).toBe('REPO');
  });

  it('OTHER loans have no market data', async () => {
    const l = await loan(user, { loanType: 'OTHER' });
    expect(await body(l.id)).toMatchObject({ rateLoanType: null, market: null });
  });

  it('market is null when only stale or suspect rates exist', async () => {
    await sys(() => prisma.loanRate.deleteMany({ where: { sourceId: 'sbi.home' } }));
    const l = await loan(user, {});
    expect((await body(l.id)).market).toBeNull();
  });

  it("uses the loan's own schedule: a recorded EMI for the next month shortens it", async () => {
    const l = await loan(user, { firstEmiDate: fifth(1) });
    await sys(() => prisma.loanPayment.create({
      data: { loanId: l.id, paymentType: 'EMI', paidOn: day(fifth(0)), amount: '30607', forMonth: fifth(1).slice(0, 7) },
    }));
    const stored = await sys(() => prisma.loan.findUniqueOrThrow({ where: { id: l.id }, include: { payments: { orderBy: { paidOn: 'asc' } } } }));
    const now = new Date();
    const without = computeLoanSummary({ ...(stored as unknown as StoredLoan), payments: [] }, now);
    const withPaid = computeLoanSummary(stored as unknown as StoredLoan, now);
    expect(without.remainingEmiCount).toBe(180);
    expect(withPaid.remainingEmiCount).toBe(179);
    const b = await body(l.id);
    expect(b.remainingMonths).toBe(179);
    expect(b.outstanding).toBe(new Decimal(withPaid.outstandingBalance).toFixed(2));
    expect(new Decimal(b.outstanding).lessThan(new Decimal(without.outstandingBalance))).toBe(true);
  });
});

describe('PATCH /api/loans/:id rate fields (final review)', () => {
  async function patch(loanId: string, payload: unknown, as: TestScope = user): Promise<Response> {
    return fetch(`${base}/api/loans/${loanId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token(as)}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  it('the body schema refuses an unknown rate type, an unknown benchmark and a malformed date with 422', async () => {
    const l = await loan(user, { rateType: 'UNKNOWN' });
    for (const bad of [{ rateType: 'VARIABLE' }, { rateBenchmark: 'LIBOR' }, { nextRateResetDate: '01/01/2027' }]) {
      const res = await patch(l.id, bad);
      expect(res.status, JSON.stringify(bad)).toBe(422);
      expect((await res.json()).code).toBe('VALIDATION_ERROR');
    }
  });

  it('a reset date that is not on the calendar is 422, not rolled forward', async () => {
    const l = await loan(user, { rateType: 'FLOATING', rateBenchmark: 'REPO' });
    const res = await patch(l.id, { nextRateResetDate: '2026-02-30' });
    expect(res.status).toBe(422);
    const stored = await sys(() => prisma.loan.findUniqueOrThrow({ where: { id: l.id } }));
    expect(stored.nextRateResetDate).toBeNull();
  });

  it('FLOATING with a benchmark in one patch; another user gets 404', async () => {
    const l = await loan(user, { rateType: 'UNKNOWN' });
    expect((await patch(l.id, { rateType: 'FLOATING', rateBenchmark: 'REPO' }, other)).status).toBe(404);
    const res = await patch(l.id, { rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ rateType: 'FLOATING', rateBenchmark: 'REPO' });
  });
});
