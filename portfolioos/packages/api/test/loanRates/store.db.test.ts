import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import {
  activateSuspect, effectiveRates, rateKey, recordReading, writeBenchmark, type StoreSource,
} from '../../src/services/loanRates/store.js';
import type { RateReading } from '../../src/services/loanRates/types.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const NOW = new Date('2026-10-12T02:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const READER = { id: 'test.reader', version: '1' };
const HOME: StoreSource = { id: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME' };
const MCLR: StoreSource = { id: 'sbi.mclr', lender: 'SBI', loanType: 'MCLR' };
const REPO: StoreSource = { id: 'rbi.repo', lender: 'RBI', loanType: 'REPO' };
const home = (min: string, max: string | null = '13.45'): RateReading => ({
  sourceId: 'hdfc.home', basis: 'REPO_LINKED', tenor: null, minRatePct: min, maxRatePct: max, effectiveDate: null,
});
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);

beforeAll(async () => {
  await sys(() => ensureLoanRateSources(true));
});
beforeEach(clearLoanRateTables);
afterAll(clearLoanRateTables);

describe('recordReading', () => {
  it('first reading is ACTIVE and carries the reader id and version', async () => {
    const res = await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    expect(res.outcome).toBe('ACTIVE');
    const row = await prisma.loanRate.findUniqueOrThrow({ where: { id: res.rowId } });
    expect(row).toMatchObject({ origin: 'AUTO', status: 'ACTIVE', sourceAdapter: 'test.reader', sourceAdapterVer: '1', tenor: null });
    expect(row.minRatePct.toString()).toBe('8');
  });

  it('an identical reading inserts nothing (two runs in one day)', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const again = await sys(() => recordReading(HOME, home('8.00'), READER, later(60)));
    expect(again.outcome).toBe('UNCHANGED');
    expect(await prisma.loanRate.count({ where: { sourceId: 'hdfc.home' } })).toBe(1);
  });

  it('a changed reading supersedes the previous ACTIVE row', async () => {
    const first = await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const second = await sys(() => recordReading(HOME, home('8.25'), READER, later(1)));
    expect(second.outcome).toBe('ACTIVE');
    expect((await prisma.loanRate.findUniqueOrThrow({ where: { id: first.rowId } })).status).toBe('SUPERSEDED');
  });

  it('a jump of more than 2 pp is SUSPECT and the old rate stays effective', async () => {
    const first = await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const jump = await sys(() => recordReading(HOME, home('11.00'), READER, later(1)));
    expect(jump).toMatchObject({ outcome: 'SUSPECT', reasons: ['JUMP'] });
    const eff = await effectiveRates(['hdfc.home']);
    expect(eff.get(rateKey('hdfc.home', null))?.id).toBe(first.rowId);
    expect((await prisma.loanRate.findUniqueOrThrow({ where: { id: jump.rowId } })).note).toBe('JUMP');
  });

  it('approving a SUSPECT reading makes it the effective one', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const jump = await sys(() => recordReading(HOME, home('11.00'), READER, later(1)));
    const approved = await sys(() => activateSuspect(jump.rowId, later(2)));
    expect(approved?.status).toBe('ACTIVE');
    expect((await effectiveRates(['hdfc.home'])).get(rateKey('hdfc.home', null))?.id).toBe(jump.rowId);
    expect(await sys(() => activateSuspect(jump.rowId, later(3)))).toBeNull();
  });
});

describe('benchmarks', () => {
  const mclr1y = (rate: string, date: string): RateReading => ({
    sourceId: 'sbi.mclr', basis: 'MCLR', tenor: '1Y', minRatePct: rate, maxRatePct: null, effectiveDate: date,
  });

  it('an ACTIVE MCLR reading writes one BenchmarkRate per change, dated from the page', async () => {
    await sys(() => recordReading(MCLR, mclr1y('8.70', '2026-09-15'), READER, NOW));
    await sys(() => recordReading(MCLR, mclr1y('8.70', '2026-09-15'), READER, later(1)));
    await sys(() => recordReading(MCLR, mclr1y('8.60', '2026-10-15'), READER, later(2)));
    const rows = await prisma.benchmarkRate.findMany({ where: { kind: 'MCLR', lender: 'SBI', tenor: '1Y' }, orderBy: { effectiveDate: 'asc' } });
    expect(rows.map((b) => [b.ratePct.toString(), b.effectiveDate.toISOString().slice(0, 10)])).toEqual([
      ['8.7', '2026-09-15'],
      ['8.6', '2026-10-15'],
    ]);
  });

  it('the repo rate has no page date, so a change is dated the IST day it was first seen', async () => {
    const repo = (rate: string): RateReading => ({ sourceId: 'rbi.repo', basis: 'OTHER', tenor: null, minRatePct: rate, maxRatePct: null, effectiveDate: null });
    await sys(() => recordReading(REPO, repo('5.50'), READER, NOW));
    await sys(() => recordReading(REPO, repo('5.50'), READER, later(600)));
    const rows = await prisma.benchmarkRate.findMany({ where: { kind: 'REPO' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lender: null, tenor: null });
    expect(rows[0]!.effectiveDate.toISOString().slice(0, 10)).toBe('2026-10-12');
  });

  it('a product reading never writes a benchmark', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    expect(await prisma.benchmarkRate.count()).toBe(0);
  });
});

describe('effectiveRates', () => {
  it('MANUAL wins over a newer AUTO row, per (source, tenor)', async () => {
    await sys(() => prisma.loanRate.create({
      data: { sourceId: 'hdfc.home', basis: 'REPO_LINKED', minRatePct: '7.95', origin: 'MANUAL', status: 'ACTIVE', fetchedAt: NOW, note: 'bank confirmed' },
    }));
    const auto = await sys(() => recordReading(HOME, home('8.00'), READER, later(5)));
    await sys(() => recordReading(MCLR, { sourceId: 'sbi.mclr', basis: 'MCLR', tenor: 'ON', minRatePct: '7.85', maxRatePct: null, effectiveDate: '2026-09-15' }, READER, NOW));
    const eff = await effectiveRates(['hdfc.home', 'sbi.mclr']);
    expect(eff.get(rateKey('hdfc.home', null))?.origin).toBe('MANUAL');
    expect(eff.get(rateKey('hdfc.home', null))?.id).not.toBe(auto.rowId);
    expect(eff.get(rateKey('sbi.mclr', 'ON'))?.minRatePct.toString()).toBe('7.85');
    expect(eff.has(rateKey('sbi.mclr', '1Y'))).toBe(false);
  });
});

describe('bad dates', () => {
  it('an impossible as-of date is stored SUSPECT with a null date and the raw text in the note', async () => {
    const res = await sys(() => recordReading(HOME, { ...home('8.00'), effectiveDate: '2026-13-45' }, READER, NOW));
    expect(res).toMatchObject({ outcome: 'SUSPECT', reasons: ['BAD_DATE'] });
    const row = await prisma.loanRate.findUniqueOrThrow({ where: { id: res.rowId } });
    expect(row.effectiveDate).toBeNull();
    expect(row.note).toContain('bad as-of date: 2026-13-45');
  });
});

describe('concurrency', () => {
  it('two concurrent recordReading calls for one key leave exactly one ACTIVE AUTO row', async () => {
    await Promise.all([
      sys(() => recordReading(HOME, home('8.00'), READER, NOW)),
      sys(() => recordReading(HOME, home('8.25'), READER, later(1))),
    ]);
    expect(await prisma.loanRate.count({ where: { sourceId: 'hdfc.home', origin: 'AUTO', status: 'ACTIVE' } })).toBe(1);
  });

  it('two concurrent approvals of one SUSPECT row give one success and one null', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const jump = await sys(() => recordReading(HOME, home('11.00'), READER, later(1)));
    const res = await Promise.all([
      sys(() => activateSuspect(jump.rowId, later(2))),
      sys(() => activateSuspect(jump.rowId, later(2))),
    ]);
    expect(res.filter((x) => x !== null)).toHaveLength(1);
    expect(await prisma.loanRate.count({ where: { sourceId: 'hdfc.home', status: 'ACTIVE' } })).toBe(1);
  });

  it('two concurrent REPO writes with the same value and date give one BenchmarkRate row', async () => {
    await Promise.all([
      sys(() => writeBenchmark(REPO, null, '5.50', '2026-10-12', NOW)),
      sys(() => writeBenchmark(REPO, null, '5.50', '2026-10-12', NOW)),
    ]);
    expect(await prisma.benchmarkRate.count({ where: { kind: 'REPO' } })).toBe(1);
  });
});
