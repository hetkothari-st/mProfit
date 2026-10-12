import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import cron from 'node-cron';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  DLQ_EXCERPT_BYTES, runLoanRates as runLoanRatesRaw, sanitizedExcerpt, startLoanRatesJob, truncateUtf8, type SourceStateWriter,
} from '../../src/jobs/loanRatesJob.js';
import { FetchPageError } from '../../src/services/loanRates/fetchPage.js';
import { hdfcRatesReader } from '../../src/services/loanRates/sources/hdfc.js';
import { PAGE_READERS, readerById } from '../../src/services/loanRates/sources/index.js';
import { effectiveRates, rateKey } from '../../src/services/loanRates/store.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';
import { READER_FIXTURES, fixture } from '../loanRates/readerFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

/** Single-flight makes the raw result nullable; these tests never overlap runs unless they say so. */
const runLoanRates = async (...args: Parameters<typeof runLoanRatesRaw>) => (await runLoanRatesRaw(...args))!;

const NOW = new Date('2026-10-12T02:00:00Z');
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
/** url -> the first real capture listed for that reader. */
const PAGES = new Map(PAGE_READERS.map((r) => [r.url, fixture(READER_FIXTURES[r.id]![0]!)]));
const fromFixtures = async (url: string) => {
  const page = PAGES.get(url);
  if (page === undefined) throw new Error(`test asked for unexpected URL ${url}`);
  return page;
};

let ops: TestScope;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const failuresFor = (adapter: string) =>
  sys(() => prisma.ingestionFailure.findMany({ where: { userId: ops.userId, sourceAdapter: adapter } }));

beforeAll(async () => {
  ops = await createTestScope('loanrates-ops');
  await sys(() => prisma.user.update({ where: { id: ops.userId }, data: { role: 'ADMIN' } }));
});
beforeEach(async () => {
  await clearLoanRateTables();
  await sys(() => prisma.ingestionFailure.deleteMany({ where: { userId: ops.userId } }));
  await sys(() => prisma.alert.deleteMany({ where: { userId: ops.userId } }));
});
afterAll(async () => {
  await clearLoanRateTables();
  await ops.cleanup();
});

describe('runLoanRates', () => {
  it('reads all 15 real pages: 58 ACTIVE rows, 36 benchmark rows, nothing stale, no DLQ', async () => {
    const res = await runLoanRates({ now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    expect(res.pages).toHaveLength(15);
    expect(res.pages.filter((p) => p.status !== 'OK')).toEqual([]);
    expect(res.pages.reduce((n, p) => n + p.active, 0)).toBe(58);
    expect(res.dlqRows).toBe(0);
    expect(res.staleSources).toEqual([]);
    expect(await prisma.loanRate.count({ where: { status: 'ACTIVE', origin: 'AUTO' } })).toBe(58);
    expect(await prisma.benchmarkRate.count({ where: { kind: 'MCLR' } })).toBe(35);
    expect(await prisma.benchmarkRate.count({ where: { kind: 'REPO' } })).toBe(1);
    const auto = await prisma.loanRateSource.findMany({ where: { mode: 'AUTO' } });
    expect(auto).toHaveLength(30);
    expect(auto.every((s) => s.lastSuccessAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it('a second run on the same pages is a no-op', async () => {
    await runLoanRates({ now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    const again = await runLoanRates({ now: later(4), fetchHtml: fromFixtures, opsUserId: ops.userId });
    expect(again.pages.reduce((n, p) => n + p.unchanged, 0)).toBe(58);
    expect(again.pages.reduce((n, p) => n + p.active + p.suspect, 0)).toBe(0);
    expect(await prisma.loanRate.count()).toBe(58);
    expect(await prisma.benchmarkRate.count()).toBe(36);
  });

  it('partial page: the sources still on it update, the missing one gets lastError and one DLQ row, its last rate stays', async () => {
    await runLoanRates({ readerIds: ['sbi.rates'], now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    const eblr = fixture('sbi-eblr.html');
    const res = await runLoanRates({ readerIds: ['sbi.rates'], now: later(24), fetchHtml: async () => eblr, opsUserId: ops.userId });
    expect(res.pages[0]).toMatchObject({ readerId: 'sbi.rates', status: 'PARTIAL', missing: ['sbi.mclr'] });

    const mclr = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'sbi.mclr' } });
    expect(mclr.lastError).toContain('No reading for sbi.mclr');
    expect(mclr.lastSuccessAt?.getTime()).toBe(NOW.getTime());
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'sbi.home' } })).lastSuccessAt?.getTime()).toBe(later(24).getTime());
    expect((await effectiveRates(['sbi.mclr'])).get(rateKey('sbi.mclr', '1Y'))?.minRatePct.toString()).toBe('8.7');

    const dlq = await failuresFor('loanrates.sbi.rates');
    expect(dlq).toHaveLength(1);
    const payload = dlq[0]!.rawPayload as unknown as { url: string; sourceIds: string[]; htmlExcerpt: string };
    expect(payload.url).toBe(readerById('sbi.rates')!.url);
    expect(payload.sourceIds).toEqual(['sbi.mclr']);
    expect(Buffer.byteLength(payload.htmlExcerpt, 'utf8')).toBeLessThanOrEqual(DLQ_EXCERPT_BYTES);
    expect(payload.htmlExcerpt).not.toContain('<script');
    expect(payload.htmlExcerpt).not.toContain('<head');
  });

  it('a reader that returns only some of its sources: every expected source it dropped is failed, the rest update', async () => {
    const real = hdfcRatesReader.read.bind(hdfcRatesReader);
    const spy = vi.spyOn(hdfcRatesReader, 'read').mockImplementation((html: string) => real(html).filter((r) => r.sourceId !== 'hdfc.mclr'));
    try {
      const res = await runLoanRates({ readerIds: ['hdfc.rates'], now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
      expect(res.pages[0]).toMatchObject({ readerId: 'hdfc.rates', status: 'PARTIAL', missing: ['hdfc.mclr'] });
      expect(res.pages[0]!.active).toBeGreaterThan(0);
      expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'hdfc.mclr' } })).lastError).toContain('No reading for hdfc.mclr');
      expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'hdfc.personal' } })).lastSuccessAt?.getTime()).toBe(NOW.getTime());
      expect(await failuresFor('loanrates.hdfc.rates')).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('single-flight: a second concurrent run returns null and fetches nothing', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetched: string[] = [];
    const slow = async (url: string) => {
      fetched.push(url);
      await gate;
      return fromFixtures(url);
    };
    const first = runLoanRatesRaw({ readerIds: ['lic.home'], now: NOW, fetchHtml: slow, opsUserId: ops.userId });
    await vi.waitFor(() => expect(fetched).toHaveLength(1));
    const second = await runLoanRatesRaw({ readerIds: ['lic.home'], now: NOW, fetchHtml: slow, opsUserId: ops.userId });
    expect(second).toBeNull();
    release();
    expect((await first)?.pages[0]?.status).toBe('OK');
    expect(fetched).toHaveLength(1);
    expect(await runLoanRatesRaw({ readerIds: [], now: NOW, opsUserId: ops.userId })).not.toBeNull();
  });

  it('a DB error while recording a page failure does not stop the next page', async () => {
    const hdfc = readerById('hdfc.home')!.url;
    // Through the run's own seam, never by patching the shared Prisma delegate (that leaked into later files).
    let failNext = true;
    const updateSources: SourceStateWriter = async (ids, data) => {
      if (failNext) {
        failNext = false;
        throw new Error('db down');
      }
      return prisma.loanRateSource.updateMany({ where: { id: { in: ids } }, data });
    };
    const res = await runLoanRates({
      readerIds: ['hdfc.home', 'axis.home'],
      now: NOW,
      opsUserId: ops.userId,
      updateSources,
      fetchHtml: async (url) => {
        if (url === hdfc) throw new FetchPageError('HTTP_STATUS', 'HTTP 500');
        return fromFixtures(url);
      },
    });
    expect(failNext).toBe(false);
    expect(res.pages.map((p) => [p.readerId, p.status])).toEqual([
      ['hdfc.home', 'FAILED'],
      ['axis.home', 'OK'],
    ]);
    expect(await prisma.loanRate.count({ where: { sourceId: 'axis.home', status: 'ACTIVE' } })).toBe(1);
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'axis.home' } })).lastSuccessAt?.getTime()).toBe(NOW.getTime());
  });

  it('a reading that throws mid-page: the sources recorded before it still get lastSuccessAt', async () => {
    const real = hdfcRatesReader.read.bind(hdfcRatesReader);
    // hdfc.rates yields the five MCLR tenors, then personal, then car; the car reading cannot be stored.
    const spy = vi.spyOn(hdfcRatesReader, 'read').mockImplementation((html: string) =>
      real(html).map((r) => (r.sourceId === 'hdfc.car' ? { ...r, minRatePct: 'not-a-rate' } : r)),
    );
    try {
      const res = await runLoanRates({ readerIds: ['hdfc.rates'], now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
      expect(res.pages[0]).toMatchObject({ readerId: 'hdfc.rates', status: 'FAILED', missing: ['hdfc.car'] });
    } finally {
      spy.mockRestore();
    }
    for (const id of ['hdfc.mclr', 'hdfc.personal']) {
      expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id } })).lastSuccessAt?.getTime(), id).toBe(NOW.getTime());
    }
    const car = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'hdfc.car' } });
    expect(car.lastSuccessAt).toBeNull();
    expect(car.lastError).not.toBeNull();
  });

  it('a later successful reading clears lastError and lastErrorAt', async () => {
    await runLoanRates({
      readerIds: ['lic.home'],
      now: NOW,
      opsUserId: ops.userId,
      fetchHtml: async () => {
        throw new FetchPageError('TIMEOUT', 'Timed out');
      },
    });
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'lic.home' } })).lastError).toBe('Timed out');
    await runLoanRates({ readerIds: ['lic.home'], now: later(24), fetchHtml: fromFixtures, opsUserId: ops.userId });
    const src = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'lic.home' } });
    expect(src).toMatchObject({ lastError: null, lastErrorAt: null });
    expect(src.lastSuccessAt?.getTime()).toBe(later(24).getTime());
  });

  it('transient fetch errors set lastError only; structural ones also write a DLQ row', async () => {
    for (const code of ['TIMEOUT', 'NETWORK', 'ROBOTS_UNAVAILABLE'] as const) {
      const res = await runLoanRates({
        readerIds: ['lic.home'],
        now: NOW,
        opsUserId: ops.userId,
        fetchHtml: async () => {
          throw new FetchPageError(code, `transient ${code}`);
        },
      });
      expect(res.pages[0]?.status).toBe('FAILED');
      expect(res.dlqRows).toBe(0);
    }
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'lic.home' } })).lastError).toContain('transient');
    expect(await failuresFor('loanrates.lic.home')).toHaveLength(0);
    for (const code of ['ROBOTS_DISALLOWED', 'NOT_ALLOWED', 'TOO_MANY_REDIRECTS'] as const) {
      const res = await runLoanRates({
        readerIds: ['lic.home'],
        now: NOW,
        opsUserId: ops.userId,
        fetchHtml: async () => {
          throw new FetchPageError(code, `structural ${code}`);
        },
      });
      expect(res.dlqRows).toBe(1);
    }
    expect(await failuresFor('loanrates.lic.home')).toHaveLength(3);
  });

  it('a SUSPECT reading is not a success: lastSuccessAt stays, lastError says held for review', async () => {
    await runLoanRates({ readerIds: ['lic.home'], now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    const reader = readerById('lic.home')!;
    const real = reader.read.bind(reader);
    const spy = vi.spyOn(reader, 'read').mockImplementation((html: string) =>
      real(html).map((r) => ({ ...r, minRatePct: '29.00', maxRatePct: null })),
    );
    try {
      const res = await runLoanRates({ readerIds: ['lic.home'], now: later(24), fetchHtml: fromFixtures, opsUserId: ops.userId });
      expect(res.pages[0]?.suspect).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
    const src = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'lic.home' } });
    expect(src.lastSuccessAt?.getTime()).toBe(NOW.getTime());
    expect(src.lastError).toBe('reading held for review (SUSPECT)');
  });

  it('the same SUSPECT reading on a second run is still not a success, and adds no row', async () => {
    await runLoanRates({ readerIds: ['lic.home'], now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    const reader = readerById('lic.home')!;
    const real = reader.read.bind(reader);
    const spy = vi.spyOn(reader, 'read').mockImplementation((html: string) =>
      real(html).map((r) => ({ ...r, minRatePct: '29.00', maxRatePct: null })),
    );
    try {
      await runLoanRates({ readerIds: ['lic.home'], now: later(24), fetchHtml: fromFixtures, opsUserId: ops.userId });
      await sys(() => prisma.loanRateSource.update({ where: { id: 'lic.home' }, data: { lastError: null, lastErrorAt: null } }));
      const second = await runLoanRates({ readerIds: ['lic.home'], now: later(48), fetchHtml: fromFixtures, opsUserId: ops.userId });
      expect(second.pages[0]).toMatchObject({ status: 'OK', suspect: 1, unchanged: 0, active: 0 });
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.loanRate.count({ where: { sourceId: 'lic.home', status: 'SUSPECT' } })).toBe(1);
    const src = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'lic.home' } });
    expect(src.lastSuccessAt?.getTime()).toBe(NOW.getTime());
    expect(src.lastError).toBe('reading held for review (SUSPECT)');
    expect(src.lastErrorAt?.getTime()).toBe(later(48).getTime());
  });

  it('a failing page and a page with no readings are DLQ-ed while the other pages still run', async () => {
    const hdfc = readerById('hdfc.home')!.url;
    const icici = readerById('icici.home')!.url;
    const res = await runLoanRates({
      readerIds: ['hdfc.home', 'icici.home', 'axis.home'],
      now: NOW,
      opsUserId: ops.userId,
      fetchHtml: async (url) => {
        if (url === hdfc) throw new FetchPageError('HTTP_STATUS', `HTTP 403 for ${url}`);
        if (url === icici) return fixture('kotak-rates.html');
        return fromFixtures(url);
      },
    });
    expect(res.pages.map((p) => [p.readerId, p.status])).toEqual([
      ['hdfc.home', 'FAILED'],
      ['icici.home', 'FAILED'],
      ['axis.home', 'OK'],
    ]);
    expect(res.dlqRows).toBe(2);
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'hdfc.home' } })).lastError).toContain('HTTP 403');
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'icici.home' } })).lastError).toContain('No readings found');
    expect(await failuresFor('loanrates.hdfc.home')).toHaveLength(1);
    expect(await prisma.loanRate.count({ where: { sourceId: 'axis.home', status: 'ACTIVE' } })).toBe(1);
  });

  it('a source with no success for 7 days is stale and raises one ops alert per IST day', async () => {
    await sys(() => prisma.loanRateSource.update({ where: { id: 'lic.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - 8 * 86_400_000) } }));
    const first = await runLoanRates({ readerIds: [], now: NOW, opsUserId: ops.userId });
    expect(first.staleSources).toContain('lic.home');
    expect(first.alerted).toBe(true);
    await runLoanRates({ readerIds: [], now: later(3), opsUserId: ops.userId });
    const alerts = await sys(() => prisma.alert.findMany({ where: { userId: ops.userId, title: 'Loan rates stale: 2026-10-12' } }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'CUSTOM' });
    expect((alerts[0]!.metadata as unknown as { source: string }).source).toBe('loan-rates');
  });

  it('with no ADMIN to own them, failures are logged, not written', async () => {
    const res = await runLoanRates({
      readerIds: ['pnb.mclr'],
      now: NOW,
      opsUserId: null,
      fetchHtml: async () => {
        throw new FetchPageError('TIMEOUT', 'Timed out');
      },
    });
    expect(res.pages[0]?.status).toBe('FAILED');
    expect(res.dlqRows).toBe(0);
  });
});

describe('truncateUtf8', () => {
  it('cuts to the byte limit without leaving half a character', () => {
    const out = truncateUtf8('\u00e9'.repeat(5000), DLQ_EXCERPT_BYTES);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(DLQ_EXCERPT_BYTES);
    expect(out.endsWith('\uFFFD')).toBe(false);
    expect(truncateUtf8('short', DLQ_EXCERPT_BYTES)).toBe('short');
  });
});

describe('sanitizedExcerpt', () => {
  it('drops head, scripts and tags, and starts near the first % token', () => {
    const html = `<html><head><title>T</title><script>var secret=1</script></head><body>${'<p>intro</p>'.repeat(200)}<script>x()</script><table><tr><td>Rate 8.50%</td></tr></table></body></html>`;
    const out = sanitizedExcerpt(html);
    expect(out).toContain('8.50%');
    expect(out).not.toMatch(/<|secret|x\(\)/);
    expect(out.length).toBeLessThan(500);
    expect(sanitizedExcerpt('')).toBe('');
  });
});

describe('startLoanRatesJob', () => {
  const schedule = vi.mocked(cron.schedule);
  const saved = process.env.ENABLE_LOAN_RATES_CRON;
  afterAll(() => {
    if (saved === undefined) delete process.env.ENABLE_LOAN_RATES_CRON;
    else process.env.ENABLE_LOAN_RATES_CRON = saved;
  });

  it('schedules 07:30 IST when enabled', () => {
    schedule.mockClear();
    process.env.ENABLE_LOAN_RATES_CRON = 'true';
    startLoanRatesJob();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]![0]).toBe('30 7 * * *');
    expect(schedule.mock.calls[0]![2]).toEqual({ timezone: 'Asia/Kolkata' });
  });

  it('does not schedule when ENABLE_LOAN_RATES_CRON=false', () => {
    schedule.mockClear();
    process.env.ENABLE_LOAN_RATES_CRON = 'false';
    startLoanRatesJob();
    expect(schedule).not.toHaveBeenCalled();
  });
});
