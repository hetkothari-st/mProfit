import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { AdminLoanRateSourceWire } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { adminLoanRatesRouter } from '../../src/routes/adminLoanRates.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { listLoanRates } from '../../src/services/loanRates/loanRates.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { runLoanRates, runLoanRatesJob } from '../../src/jobs/loanRatesJob.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

vi.mock('../../src/jobs/loanRatesJob.js', () => ({
  runLoanRates: vi.fn(async () => ({
    pages: [{ readerId: 'axis.home', status: 'OK', active: 1, suspect: 0, unchanged: 0, missing: [], error: null }],
    staleSources: [],
    dlqRows: 0,
    alerted: false,
  })),
  runLoanRatesJob: vi.fn(async () => null),
}));

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let investor: TestScope;
let adminNo2fa: TestScope;
let admin: TestScope;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const tokenFor = (scope: TestScope, role: string, mfa: boolean) =>
  signAccessToken({ sub: scope.userId, email: `${scope.userId}@test.local`, role, plan: 'FREE', ...(mfa ? { mfa: true } : {}) }).token;

function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  return fetch(`${base}/api/admin/loan-rates${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.token ?? tokenFor(admin, 'ADMIN', true)}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const audits = (action: string) => sys(() => prisma.auditLog.findMany({ where: { userId: admin.userId, action } }));
const autoRate = (sourceId: string, min: string, status = 'ACTIVE') =>
  sys(() => prisma.loanRate.create({
    data: { sourceId, basis: 'REPO_LINKED', minRatePct: min, maxRatePct: '13.45', origin: 'AUTO', status, sourceAdapter: 'hdfc.home', sourceAdapterVer: '1' },
  }));

beforeAll(async () => {
  investor = await createTestScope('lr-admin-investor');
  adminNo2fa = await createTestScope('lr-admin-no2fa');
  admin = await createTestScope('lr-admin');
  await sys(() => prisma.user.update({ where: { id: adminNo2fa.userId }, data: { role: 'ADMIN' } }));
  await sys(() => prisma.user.update({
    where: { id: admin.userId },
    data: { role: 'ADMIN', twoFactorEnabledAt: new Date(), twoFactorSecretEnc: encryptSecret(generateTotpSecret()) },
  }));
  await sys(() => ensureLoanRateSources(true));
  const app = express();
  app.use(express.json());
  app.use('/api/admin/loan-rates', adminLoanRatesRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await clearLoanRateTables();
  vi.clearAllMocks();
});
afterAll(async () => {
  server.close();
  await clearLoanRateTables();
  for (const s of [investor, adminNo2fa, admin]) await s.cleanup();
});

describe('gate', () => {
  it('investor -> 401, admin without two-factor -> 403, admin session without a code -> 403, verified admin -> 200', async () => {
    expect((await call('GET', '/', { token: tokenFor(investor, 'INVESTOR', true) })).status).toBe(401);
    const no2fa = await call('GET', '/', { token: tokenFor(adminNo2fa, 'ADMIN', true) });
    expect(no2fa.status).toBe(403);
    expect((await no2fa.json()).code).toBe('TWO_FACTOR_REQUIRED');
    expect((await call('GET', '/', { token: tokenFor(admin, 'ADMIN', false) })).status).toBe(403);
    const ok = await call('GET', '/');
    expect(ok.status).toBe(200);
    expect(((await ok.json()).data.sources as AdminLoanRateSourceWire[]).length).toBeGreaterThanOrEqual(92);
  });
});

describe('manual override', () => {
  it('wins for users, shows differs to the admin, is audited, and clearing brings AUTO back', async () => {
    await autoRate('hdfc.home', '8.00');
    const set = await call('POST', '/hdfc.home/manual', {
      body: { basis: 'REPO_LINKED', minRatePct: '7.95', maxRatePct: '13.00', note: 'Branch confirmed festive offer' },
    });
    expect(set.status).toBe(201);
    expect((await set.json()).data).toMatchObject({ origin: 'MANUAL', status: 'ACTIVE', minRatePct: '7.95', maxRatePct: '13.00' });

    const users = await sys(() => listLoanRates('HOME'));
    expect(users.rows.find((r) => r.sourceId === 'hdfc.home')).toMatchObject({ minRatePct: '7.95', origin: 'MANUAL' });

    const sources = (await (await call('GET', '/')).json()).data.sources as AdminLoanRateSourceWire[];
    const hdfc = sources.find((s) => s.id === 'hdfc.home')!;
    expect(hdfc.keys).toHaveLength(1);
    expect(hdfc.keys[0]).toMatchObject({ tenor: null, differs: true, manual: { minRatePct: '7.95' }, latestAuto: { minRatePct: '8.00' } });

    const setAudit = await audits('loan_rate_manual_set');
    expect(setAudit).toHaveLength(1);
    expect(setAudit[0]).toMatchObject({ resource: 'LoanRateSource:hdfc.home' });

    const cleared = await call('DELETE', '/hdfc.home/manual');
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data).toEqual({ cleared: 1 });
    expect((await audits('loan_rate_override_cleared'))).toHaveLength(1);
    const after = await sys(() => listLoanRates('HOME'));
    expect(after.rows.find((r) => r.sourceId === 'hdfc.home')).toMatchObject({ minRatePct: '8.00', origin: 'AUTO' });
    expect((await call('DELETE', '/hdfc.home/manual')).status).toBe(404);
  });

  it('a manual repo rate also records the benchmark change', async () => {
    const res = await call('POST', '/rbi.repo/manual', { body: { basis: 'OTHER', minRatePct: '5.50', effectiveDate: '2026-10-08', note: 'RBI MPC statement 08/10/2026' } });
    expect(res.status).toBe(201);
    const bench = await prisma.benchmarkRate.findMany({ where: { kind: 'REPO' } });
    expect(bench.map((b) => [b.ratePct.toString(), b.effectiveDate.toISOString().slice(0, 10)])).toEqual([['5.5', '2026-10-08']]);
  });

  it.each([
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', tenor: '1Y', minRatePct: '8.00', note: 'tenor on a product' }, 400],
    ['/sbi.mclr/manual', { basis: 'MCLR', minRatePct: '8.70', note: 'MCLR without tenor' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '60', note: 'too high' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '9.00', maxRatePct: '8.00', note: 'max below min' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '8.00', effectiveDate: '2026-02-30', note: 'no such day' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '8,00', note: 'comma' }, 422],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '8.00' }, 422],
    ['/nope.home/manual', { basis: 'OTHER', minRatePct: '8.00', note: 'unknown source' }, 404],
  ])('POST %s %j -> %i', async (path, body, status) => {
    expect((await call('POST', path, { body })).status).toBe(status);
  });
});

describe('suspect readings', () => {
  it('approve makes it ACTIVE (once), reject makes it REJECTED; both audited', async () => {
    await autoRate('hdfc.home', '8.00');
    const suspect = await autoRate('hdfc.home', '11.00', 'SUSPECT');
    const approved = await call('POST', `/readings/${suspect.id}/approve`);
    expect(approved.status).toBe(200);
    expect((await approved.json()).data).toMatchObject({ id: suspect.id, status: 'ACTIVE' });
    expect((await call('POST', `/readings/${suspect.id}/approve`)).status).toBe(409);
    expect(await audits('loan_rate_suspect_approved')).toHaveLength(1);

    const another = await autoRate('hdfc.home', '4.00', 'SUSPECT');
    const rejected = await call('POST', `/readings/${another.id}/reject`);
    expect((await rejected.json()).data).toMatchObject({ status: 'REJECTED' });
    expect(await audits('loan_rate_suspect_rejected')).toHaveLength(1);
  });
});

describe('run now', () => {
  it('one AUTO source runs its page reader; a MANUAL source is refused; all starts in the background', async () => {
    const one = await call('POST', '/run', { body: { sourceId: 'axis.home' } });
    expect(one.status).toBe(200);
    expect(vi.mocked(runLoanRates)).toHaveBeenCalledWith({ readerIds: ['axis.home'] });
    expect((await one.json()).data.started).toBe('one');
    expect((await call('POST', '/run', { body: { sourceId: 'pnb.home' } })).status).toBe(400);
    const all = await call('POST', '/run', { body: {} });
    expect(all.status).toBe(202);
    expect(vi.mocked(runLoanRatesJob)).toHaveBeenCalledTimes(1);
    expect((await audits('loan_rate_run_now')).map((a) => a.resource).sort()).toEqual(['LoanRateSource:*', 'LoanRateSource:axis.home']);
  });

  it('a single-source run while another run is in progress -> 409 LOAN_RATES_BUSY, not audited', async () => {
    // A second verified admin: the run limiter (3 a minute) is keyed per admin and the test above spent it.
    const other = await createTestScope('lr-admin-busy');
    try {
      await sys(() => prisma.user.update({
        where: { id: other.userId },
        data: { role: 'ADMIN', twoFactorEnabledAt: new Date(), twoFactorSecretEnc: encryptSecret(generateTotpSecret()) },
      }));
      vi.mocked(runLoanRates).mockResolvedValueOnce(null as never);
      const busy = await call('POST', '/run', { token: tokenFor(other, 'ADMIN', true), body: { sourceId: 'axis.home' } });
      expect(busy.status).toBe(409);
      expect((await busy.json()).code).toBe('LOAN_RATES_BUSY');
      expect(await sys(() => prisma.auditLog.count({ where: { userId: other.userId, action: 'loan_rate_run_now' } }))).toBe(0);
    } finally {
      await other.cleanup();
    }
  });
});
