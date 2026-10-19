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
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { listLoanRates } from '../../src/services/loans/loanRates/loanRates.service.js';
import { ensureLoanRateSources } from '../../src/services/loans/loanRates/sourceList.js';
import { isLoanRatesRunning, runLoanRates, runLoanRatesJob } from '../../src/jobs/loanRatesJob.js';
import { recordReading } from '../../src/services/loans/loanRates/store.js';
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
  isLoanRatesRunning: vi.fn(() => false),
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

function call(method: string, path: string, opts: { token?: string | null; body?: unknown } = {}) {
  const token = opts.token === undefined ? tokenFor(admin, 'ADMIN', true) : opts.token;
  return fetch(`${base}/api/admin/loan-rates${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
/** A fresh verified admin: the run limiter (3 a minute) is keyed per admin, so each run test gets its own. */
async function withAdmin(label: string, fn: (token: string, userId: string) => Promise<void>): Promise<void> {
  const other = await createTestScope(label);
  try {
    await sys(() => prisma.user.update({
      where: { id: other.userId },
      data: { role: 'ADMIN', twoFactorEnabledAt: new Date(), twoFactorSecretEnc: encryptSecret(generateTotpSecret()) },
    }));
    await fn(tokenFor(other, 'ADMIN', true), other.userId);
  } finally {
    await other.cleanup();
  }
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
  it('no Authorization header -> 401', async () => {
    expect((await call('GET', '/', { token: null })).status).toBe(401);
    expect((await call('POST', '/run', { token: null, body: {} })).status).toBe(401);
  });

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
    ['the same IST day as the AUTO reading', 0],
    ['three days after the AUTO reading', 3],
  ])('clearing a manual repo rate (%s) puts the repo header back on the AUTO rate, with no 0.00 change', async (_name, daysAfter) => {
    const repo = { id: 'rbi.repo', lender: 'RBI', loanType: 'REPO' };
    const reading = { sourceId: 'rbi.repo', basis: 'OTHER' as const, tenor: null, minRatePct: '5.50', maxRatePct: null, effectiveDate: null };
    await sys(() => recordReading(repo, reading, { id: 'rbi.home', version: '1' }, new Date(Date.now() - daysAfter * 86_400_000 - 1_000)));
    expect((await sys(() => listLoanRates('HOME'))).repo).toMatchObject({ ratePct: '5.50', lastChange: null });

    expect((await call('POST', '/rbi.repo/manual', { body: { basis: 'OTHER', minRatePct: '6.00', note: 'typo test' } })).status).toBe(201);
    expect((await sys(() => listLoanRates('HOME'))).repo).toMatchObject({ ratePct: '6.00' });

    expect((await call('DELETE', '/rbi.repo/manual')).status).toBe(200);
    expect((await sys(() => listLoanRates('HOME'))).repo).toMatchObject({ ratePct: '5.50', lastChange: null });
    const latest = await prisma.benchmarkRate.findFirst({ where: { kind: 'REPO' }, orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }] });
    expect(latest?.ratePct.toString()).toBe('5.5');
  });

  it("clearing a manual MCLR tenor restores that tenor's benchmark only", async () => {
    const mclr = { id: 'sbi.mclr', lender: 'SBI', loanType: 'MCLR' };
    const at = new Date(Date.now() - 1_000);
    for (const [tenor, rate] of [['6M', '8.60'], ['1Y', '8.70']] as const) {
      await sys(() => recordReading(mclr, { sourceId: 'sbi.mclr', basis: 'MCLR', tenor, minRatePct: rate, maxRatePct: null, effectiveDate: null }, { id: 'sbi.rates', version: '1' }, at));
    }
    expect((await call('POST', '/sbi.mclr/manual', { body: { basis: 'MCLR', tenor: '1Y', minRatePct: '9.10', note: 'branch circular' } })).status).toBe(201);
    expect((await call('DELETE', '/sbi.mclr/manual?tenor=1Y')).status).toBe(200);
    const latest = async (tenor: string) =>
      (await prisma.benchmarkRate.findFirst({ where: { kind: 'MCLR', lender: 'SBI', tenor }, orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }] }))?.ratePct.toString();
    expect(await latest('1Y')).toBe('8.7');
    expect(await latest('6M')).toBe('8.6');
  });

  it.each([
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', tenor: '1Y', minRatePct: '8.00', note: 'tenor on a product' }, 400],
    ['/sbi.mclr/manual', { basis: 'REPO_LINKED', tenor: '1Y', minRatePct: '8.70', note: 'MCLR source, other basis' }, 400],
    ['/rbi.repo/manual', { basis: 'MCLR', minRatePct: '5.50', note: 'repo on the MCLR basis' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '8.00', effectiveDate: '2099-01-01', note: 'far future' }, 400],
    [`/${'x'.repeat(65)}/manual`, { basis: 'OTHER', minRatePct: '8.00', note: 'long id' }, 422],
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

  it('accepts a date up to 7 days ahead, and clearing an unknown source is 404', async () => {
    const soon = new Date(Date.now() + 6 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
    expect((await call('POST', '/hdfc.home/manual', { body: { basis: 'REPO_LINKED', minRatePct: '8.00', effectiveDate: soon, note: 'announced' } })).status).toBe(201);
    expect((await call('DELETE', '/nope.home/manual')).status).toBe(404);
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

  it('an unknown reading id is 404 on approve and reject, not audited', async () => {
    const before = (await audits('loan_rate_suspect_approved')).length + (await audits('loan_rate_suspect_rejected')).length;
    expect((await call('POST', '/readings/no-such-reading/approve')).status).toBe(404);
    expect((await call('POST', '/readings/no-such-reading/reject')).status).toBe(404);
    expect((await audits('loan_rate_suspect_approved')).length + (await audits('loan_rate_suspect_rejected')).length).toBe(before);
  });

  it('approving an older SUSPECT once a newer reading is ACTIVE -> 409 LOAN_RATES_STALE_SUSPECT', async () => {
    const old = await autoRate('hdfc.home', '11.00', 'SUSPECT');
    await new Promise((r) => setTimeout(r, 5));
    await autoRate('hdfc.home', '8.10');
    const res = await call('POST', `/readings/${old.id}/approve`);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('LOAN_RATES_STALE_SUSPECT');
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

  it('run all while a run is in progress -> 409 LOAN_RATES_BUSY, not started, not audited', async () => {
    await withAdmin('lr-admin-busy-all', async (token, userId) => {
      vi.mocked(isLoanRatesRunning).mockReturnValueOnce(true);
      const busy = await call('POST', '/run', { token, body: {} });
      expect(busy.status).toBe(409);
      expect((await busy.json()).code).toBe('LOAN_RATES_BUSY');
      expect(vi.mocked(runLoanRatesJob)).not.toHaveBeenCalled();
      expect(await sys(() => prisma.auditLog.count({ where: { userId, action: 'loan_rate_run_now' } }))).toBe(0);
    });
  });

  it('an unknown sourceId is 404', async () => {
    await withAdmin('lr-admin-unknown', async (token) => {
      expect((await call('POST', '/run', { token, body: { sourceId: 'nope.home' } })).status).toBe(404);
    });
  });

  it('the fourth run in a minute is 429', async () => {
    await withAdmin('lr-admin-limit', async (token) => {
      for (let i = 0; i < 3; i++) expect((await call('POST', '/run', { token, body: { sourceId: 'axis.home' } })).status).toBe(200);
      expect((await call('POST', '/run', { token, body: { sourceId: 'axis.home' } })).status).toBe(429);
    });
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
