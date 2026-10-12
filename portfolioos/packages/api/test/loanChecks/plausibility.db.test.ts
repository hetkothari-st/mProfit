import 'dotenv/config';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runLoanChecks } from '../../src/jobs/loanChecksJob.js';
import { findBenchmarkChanges } from '../../src/services/loanChecks/loanAlerts.service.js';
import { bestMarketRate } from '../../src/services/loanChecks/marketCheck.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/** 08:30 IST on 12/10/2026; the 7-day window starts 05/10/2026 03:00 UTC. */
const NOW = new Date('2026-10-12T03:00:00Z');
const HOUR = 3_600_000;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

interface Row { ratePct: string; effectiveDate: string; fetchedAt: string; kind?: 'REPO' | 'MCLR'; lender?: string }
async function benchmarks(rows: Row[]): Promise<void> {
  await sys(() => prisma.benchmarkRate.createMany({
    data: rows.map((r) => ({
      kind: r.kind ?? 'REPO',
      lender: r.kind === 'MCLR' ? (r.lender ?? 'SBI') : null,
      tenor: r.kind === 'MCLR' ? '1Y' : null,
      ratePct: r.ratePct,
      effectiveDate: day(r.effectiveDate),
      fetchedAt: new Date(r.fetchedAt),
    })),
  }));
}
/** The repo rate as it stood before the window. */
const BASELINE: Row = { ratePct: '5.50', effectiveDate: '2026-06-06', fetchedAt: '2026-06-06T04:00:00Z' };

const changes = () => sys(() => findBenchmarkChanges(NOW));

const scopes: TestScope[] = [];

beforeEach(async () => {
  await sys(() => ensureLoanRateSources(true));
  await clearLoanRateTables();
});

afterAll(async () => {
  await clearLoanRateTables();
  for (const s of scopes) await s.cleanup();
});

describe('findBenchmarkChanges: net change per series (final review I-1)', () => {
  it('a cut reversed within the window (flap): no change', async () => {
    await benchmarks([
      BASELINE,
      { ratePct: '5.25', effectiveDate: '2026-10-08', fetchedAt: '2026-10-08T02:00:00Z' },
      { ratePct: '5.50', effectiveDate: '2026-10-10', fetchedAt: '2026-10-10T02:00:00Z' },
    ]);
    expect(await changes()).toEqual([]);
  });

  it('two cuts in the window: exactly one change carrying the net delta and the latest date', async () => {
    await benchmarks([
      BASELINE,
      { ratePct: '5.25', effectiveDate: '2026-10-06', fetchedAt: '2026-10-06T02:00:00Z' },
      { ratePct: '5.00', effectiveDate: '2026-10-10', fetchedAt: '2026-10-10T02:00:00Z' },
    ]);
    const found = await changes();
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('REPO');
    expect(found[0]!.deltaPct.toFixed(2)).toBe('-0.50');
    expect(found[0]!.ratePct.toFixed(2)).toBe('5.00');
    expect(found[0]!.effectiveDate).toBe('2026-10-10');
  });

  it('series are netted separately: repo and one lender MCLR each give one change', async () => {
    await benchmarks([
      BASELINE,
      { ratePct: '5.25', effectiveDate: '2026-10-08', fetchedAt: '2026-10-08T02:00:00Z' },
      { kind: 'MCLR', ratePct: '8.75', effectiveDate: '2026-09-15', fetchedAt: '2026-09-15T02:00:00Z' },
      { kind: 'MCLR', ratePct: '8.65', effectiveDate: '2026-10-10', fetchedAt: '2026-10-10T02:00:00Z' },
    ]);
    const found = (await changes()).map((c) => [c.kind, c.lender, c.deltaPct.toFixed(2)]).sort();
    expect(found).toEqual([['MCLR', 'SBI', '-0.10'], ['REPO', null, '-0.25']]);
  });

  it('a 15% repo reading (net jump over 1.00 pp): no change', async () => {
    await benchmarks([BASELINE, { ratePct: '15.00', effectiveDate: '2026-10-10', fetchedAt: '2026-10-10T02:00:00Z' }]);
    expect(await changes()).toEqual([]);
  });

  it('a row dated more than 30 days ago (backdated override): no change', async () => {
    await benchmarks([BASELINE, { ratePct: '5.25', effectiveDate: '2026-09-01', fetchedAt: '2026-10-10T02:00:00Z' }]);
    expect(await changes()).toEqual([]);
  });

  it('a row dated after today (IST): no change', async () => {
    await benchmarks([BASELINE, { ratePct: '5.25', effectiveDate: '2026-10-20', fetchedAt: '2026-10-11T02:00:00Z' }]);
    expect(await changes()).toEqual([]);
  });
});

describe('implausible rates never alert (final review I-1)', () => {
  it('a 0.85% HOME override is ignored by bestMarketRate and the job; a 15% repo jump sends no benchmark alert', async () => {
    await sys(async () => {
      await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - HOUR) } });
      await prisma.loanRate.createMany({
        data: [
          { sourceId: 'sbi.home', basis: 'REPO_LINKED', minRatePct: '8.35', maxRatePct: '10.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 2 * HOUR) },
          { sourceId: 'hdfc.home', basis: 'REPO_LINKED', minRatePct: '0.85', maxRatePct: null, origin: 'MANUAL', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 2 * HOUR) },
        ],
      });
    });
    await benchmarks([BASELINE, { ratePct: '15.00', effectiveDate: '2026-10-10', fetchedAt: '2026-10-10T02:00:00Z' }]);

    const best = await sys(() => bestMarketRate('HOME', NOW));
    expect(best).toMatchObject({ sourceId: 'sbi.home', minRatePct: '8.35' });

    const s = await createTestScope('loan-checks-implausible');
    scopes.push(s);
    await sys(() => prisma.loan.create({
      data: {
        userId: s.userId, lenderName: 'HDFC Bank', loanType: 'HOME', borrowerName: 'Test Borrower',
        principalAmount: '3000000', interestRate: '8.60', tenureMonths: 180, emiAmount: '29719', emiDueDay: 5,
        disbursementDate: day('2026-10-01'), firstEmiDate: day('2026-11-05'),
        rateType: 'FLOATING', rateBenchmark: 'REPO', createdAt: day('2026-09-01'),
      },
    }));
    const result = await runLoanChecks({ now: NOW, userIds: [s.userId] });
    expect(result).toMatchObject({ users: 1, refinance: 0, benchmark: 0, changes: 0, failedLoans: 0 });
    const alerts = await sys(() => prisma.alert.findMany({ where: { userId: s.userId, type: { in: ['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE'] } } }));
    expect(alerts).toEqual([]);
  });

  it('only an implausible rate for the type: no market rate at all', async () => {
    await sys(() => prisma.loanRate.create({
      data: { sourceId: 'hdfc.home', basis: 'REPO_LINKED', minRatePct: '0.85', maxRatePct: null, origin: 'MANUAL', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 2 * HOUR) },
    }));
    expect(await sys(() => bestMarketRate('HOME', NOW))).toBeNull();
  });
});
