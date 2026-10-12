import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { DLQ_EXCERPT_BYTES, runLoanRates, truncateUtf8 } from '../../src/jobs/loanRatesJob.js';
import { FetchPageError } from '../../src/services/loanRates/fetchPage.js';
import { hdfcRatesReader } from '../../src/services/loanRates/sources/hdfc.js';
import { PAGE_READERS, readerById } from '../../src/services/loanRates/sources/index.js';
import { effectiveRates, rateKey } from '../../src/services/loanRates/store.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';
import { READER_FIXTURES, fixture } from '../loanRates/readerFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

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
