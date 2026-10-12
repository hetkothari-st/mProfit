import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { ensureLoanRateSources, LOAN_RATE_SOURCES } from '../../src/services/loanRates/sourceList.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

describe('ensureLoanRateSources', () => {
  it('upserts all 92 rows idempotently, readable with no user context (no RLS)', async () => {
    await ensureLoanRateSources(true);
    await ensureLoanRateSources(true);
    const rows = await prisma.loanRateSource.findMany({ where: { id: { in: LOAN_RATE_SOURCES.map((s) => s.id) } } });
    expect(rows).toHaveLength(92);
    expect(rows.find((r) => r.id === 'kotak.lap')).toMatchObject({ mode: 'AUTO', adapter: 'kotak.rates', adapterVer: '1', lender: 'Kotak', loanType: 'LAP' });
    expect(rows.find((r) => r.id === 'pnb.home')).toMatchObject({ mode: 'MANUAL', adapter: null });
    expect(rows.every((r) => r.createdAt instanceof Date)).toBe(true);
  });

  it('a re-run leaves fetch state alone (lastSuccessAt, lastError, createdAt)', async () => {
    await ensureLoanRateSources(true);
    const stamp = new Date('2026-10-01T05:30:00.000Z');
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: stamp, lastErrorAt: stamp, lastError: 'boom' } });
    const before = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'sbi.home' } });
    await ensureLoanRateSources(true);
    const after = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'sbi.home' } });
    expect(after.lastSuccessAt?.toISOString()).toBe(stamp.toISOString());
    expect(after.lastErrorAt?.toISOString()).toBe(stamp.toISOString());
    expect(after.lastError).toBe('boom');
    expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString());
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: null, lastErrorAt: null, lastError: null } });
  });
});
