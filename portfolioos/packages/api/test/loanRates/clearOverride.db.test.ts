import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { clearManualRate, setManualRate } from '../../src/services/loanRates/admin.service.js';
import { repoSummary } from '../../src/services/loanRates/loanRates.service.js';
import { recordReading, type StoreSource } from '../../src/services/loanRates/store.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const at = (iso: string) => new Date(iso);
const MCLR: StoreSource = { id: 'sbi.mclr', lender: 'SBI', loanType: 'MCLR' };
const REPO: StoreSource = { id: 'rbi.repo', lender: 'RBI', loanType: 'REPO' };
const ADMIN = 'test-admin-id';

const bench = (kind: 'MCLR' | 'REPO') =>
  prisma.benchmarkRate.findMany({
    where: { kind, ...(kind === 'MCLR' ? { lender: 'SBI', tenor: '1Y' } : { lender: null, tenor: null }) },
    orderBy: [{ effectiveDate: 'asc' }, { fetchedAt: 'asc' }],
  });
const rows = async (kind: 'MCLR' | 'REPO') =>
  (await bench(kind)).map((b) => [b.ratePct.toString(), b.effectiveDate.toISOString().slice(0, 10)]);

beforeAll(async () => {
  await sys(() => ensureLoanRateSources(true));
});
beforeEach(clearLoanRateTables);
afterAll(clearLoanRateTables);

describe('clearing a corrected override restores the AUTO benchmark', () => {
  it('MCLR: manual 9.10, corrected to 9.20, cleared -> latest benchmark 8.70, no 9.10/9.20 rows', async () => {
    await sys(() => recordReading(MCLR, { sourceId: 'sbi.mclr', basis: 'MCLR', tenor: '1Y', minRatePct: '8.70', maxRatePct: null, effectiveDate: '2026-10-01' }, { id: 'sbi.rates', version: '1' }, at('2026-10-01T04:00:00Z')));
    await sys(() => setManualRate(ADMIN, 'sbi.mclr', { basis: 'MCLR', tenor: '1Y', minRatePct: '9.10', note: 'branch circular' }, at('2026-10-09T04:00:00Z')));
    await sys(() => setManualRate(ADMIN, 'sbi.mclr', { basis: 'MCLR', tenor: '1Y', minRatePct: '9.20', note: 'corrected' }, at('2026-10-10T04:00:00Z')));
    expect(await rows('MCLR')).toEqual([['8.7', '2026-10-01'], ['9.1', '2026-10-09'], ['9.2', '2026-10-10']]);
    expect(await sys(() => clearManualRate('sbi.mclr', '1Y'))).toBe(1);
    expect(await rows('MCLR')).toEqual([['8.7', '2026-10-01']]);
  });

  it('REPO: manual 6.00, corrected to 6.10, cleared -> 5.50 with the real last change, no false cut', async () => {
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.75', effectiveDate: at('2026-06-06T00:00:00Z'), fetchedAt: at('2026-06-06T04:00:00Z') } }));
    await sys(() => recordReading(REPO, { sourceId: 'rbi.repo', basis: 'OTHER', tenor: null, minRatePct: '5.50', maxRatePct: null, effectiveDate: null }, { id: 'rbi.home', version: '1' }, at('2026-10-01T04:00:00Z')));
    await sys(() => setManualRate(ADMIN, 'rbi.repo', { basis: 'OTHER', minRatePct: '6.00', note: 'typo' }, at('2026-10-09T04:00:00Z')));
    await sys(() => setManualRate(ADMIN, 'rbi.repo', { basis: 'OTHER', minRatePct: '6.10', note: 'typo again' }, at('2026-10-10T04:00:00Z')));
    await sys(() => clearManualRate('rbi.repo', undefined));
    expect(await rows('REPO')).toEqual([['5.75', '2026-06-06'], ['5.5', '2026-10-01']]);
    expect(await sys(() => repoSummary())).toEqual({
      ratePct: '5.50', effectiveDate: '2026-10-01', lastChange: { deltaPct: '-0.25', date: '2026-10-01' },
    });
  });

  it('a repo override entered the same IST day as the AUTO change and cleared later keeps the AUTO day', async () => {
    await sys(() => recordReading(REPO, { sourceId: 'rbi.repo', basis: 'OTHER', tenor: null, minRatePct: '5.50', maxRatePct: null, effectiveDate: null }, { id: 'rbi.home', version: '1' }, at('2026-10-01T04:00:00Z')));
    await sys(() => setManualRate(ADMIN, 'rbi.repo', { basis: 'OTHER', minRatePct: '6.00', note: 'same day' }, at('2026-10-01T09:00:00Z')));
    expect(await rows('REPO')).toEqual([['6', '2026-10-01']]);
    await sys(() => clearManualRate('rbi.repo', undefined)); // the real clock: a later day than 2026-10-01
    expect(await rows('REPO')).toEqual([['5.5', '2026-10-01']]);
    expect((await sys(() => repoSummary()))?.lastChange).toBeNull();
  });

  it('never removes a benchmark row that an AUTO reading wrote', async () => {
    await sys(() => recordReading(MCLR, { sourceId: 'sbi.mclr', basis: 'MCLR', tenor: '1Y', minRatePct: '8.70', maxRatePct: null, effectiveDate: '2026-09-15' }, { id: 'sbi.rates', version: '1' }, at('2026-09-15T04:00:00Z')));
    await sys(() => recordReading(MCLR, { sourceId: 'sbi.mclr', basis: 'MCLR', tenor: '1Y', minRatePct: '8.60', maxRatePct: null, effectiveDate: '2026-10-01' }, { id: 'sbi.rates', version: '1' }, at('2026-10-01T04:00:00Z')));
    await sys(() => setManualRate(ADMIN, 'sbi.mclr', { basis: 'MCLR', tenor: '1Y', minRatePct: '8.65', note: 'manual' }, at('2026-10-05T04:00:00Z')));
    await sys(() => clearManualRate('sbi.mclr', '1Y'));
    expect(await rows('MCLR')).toEqual([['8.7', '2026-09-15'], ['8.6', '2026-10-01']]);
  });
});
