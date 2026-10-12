import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { LoanRatesWire } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { loanRatesRouter } from '../../src/routes/loanRates.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = () => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
const get = (query: string, auth = true) =>
  fetch(`${base}/api/loan-rates${query}`, { headers: auth ? { authorization: `Bearer ${token()}` } : {} });
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

async function rate(sourceId: string, data: { min: string; max?: string; origin?: 'AUTO' | 'MANUAL'; status?: string; basis?: string; effectiveDate?: string }) {
  await sys(() => prisma.loanRate.create({
    data: {
      sourceId,
      basis: data.basis ?? 'REPO_LINKED',
      minRatePct: data.min,
      maxRatePct: data.max ?? null,
      origin: data.origin ?? 'AUTO',
      status: data.status ?? 'ACTIVE',
      effectiveDate: data.effectiveDate ? new Date(`${data.effectiveDate}T00:00:00Z`) : null,
      fetchedAt: ago(2),
    },
  }));
}

beforeAll(async () => {
  user = await createTestScope('loan-rates-http');
  await sys(() => ensureLoanRateSources(true));
  const app = express();
  app.use(express.json());
  app.use('/api/loan-rates', loanRatesRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(clearLoanRateTables);
afterAll(async () => {
  server.close();
  await clearLoanRateTables();
  await user.cleanup();
});

describe('GET /api/loan-rates', () => {
  it('requires auth', async () => expect((await get('', false)).status).toBe(401));

  it('rejects an unknown loan type', async () => expect((await get('?loanType=BOAT')).status).toBe(422));

  it('is empty, not an error, before any rate exists', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ loanType: 'HOME', rows: [], repo: null });
  });

  it('returns effective rates lowest first: manual wins, suspect hidden, stale flagged, other types excluded', async () => {
    await sys(() => prisma.loanRateSource.update({ where: { id: 'hdfc.home' }, data: { lastSuccessAt: ago(1) } }));
    await sys(() => prisma.loanRateSource.update({ where: { id: 'kotak.home' }, data: { lastSuccessAt: ago(8 * 24) } }));
    await rate('hdfc.home', { min: '8.00', max: '13.45' });
    await rate('icici.home', { min: '8.75', max: '10.05' });
    await rate('icici.home', { min: '8.60', origin: 'MANUAL', basis: 'REPO_LINKED' });
    await rate('axis.home', { min: '5.00', status: 'SUSPECT' });
    await rate('kotak.home', { min: '7.70', max: '13.05' });
    await rate('sbi.home', { min: '7.25', basis: 'REPO_LINKED', status: 'SUPERSEDED' });
    await rate('pnb.home', { min: '7.10', basis: 'REPO_LINKED', status: 'REJECTED' });
    await rate('lic.home', { min: '7.00', origin: 'MANUAL', status: 'REJECTED' });
    await rate('canara.car', { min: '7.70', max: '15.25', basis: 'OTHER' });

    const body = (await (await get('?loanType=HOME')).json()).data as LoanRatesWire;
    expect(body.rows.map((r) => [r.sourceId, r.minRatePct, r.maxRatePct, r.origin, r.stale])).toEqual([
      ['kotak.home', '7.70', '13.05', 'AUTO', true],
      ['hdfc.home', '8.00', '13.45', 'AUTO', false],
      ['icici.home', '8.60', null, 'MANUAL', false],
    ]);
    const hdfc = body.rows[1]!;
    expect(hdfc).toMatchObject({ lender: 'HDFC Bank', loanType: 'HOME', basis: 'REPO_LINKED', effectiveDate: null, sourceUrl: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates' });
    expect(Math.abs(Date.parse(hdfc.asOf) - ago(1).getTime())).toBeLessThan(60_000);
  });

  it('repo: null lastChange with one row, signed delta after a cut', async () => {
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.75', effectiveDate: new Date('2026-06-06T00:00:00Z') } }));
    let body = (await (await get('')).json()).data as LoanRatesWire;
    expect(body.repo).toEqual({ ratePct: '5.75', effectiveDate: '2026-06-06', lastChange: null });
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.50', effectiveDate: new Date('2026-10-08T00:00:00Z') } }));
    body = (await (await get('')).json()).data as LoanRatesWire;
    expect(body.repo).toEqual({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } });
  });

  it('repo: two rows with the same rate are not a change (no 0.00 delta)', async () => {
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.50', effectiveDate: new Date('2026-06-06T00:00:00Z') } }));
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.50', effectiveDate: new Date('2026-10-08T00:00:00Z') } }));
    const body = (await (await get('')).json()).data as LoanRatesWire;
    expect(body.repo).toEqual({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: null });
  });
});
