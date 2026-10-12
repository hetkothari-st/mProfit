import type { LoanRate } from '@prisma/client';
import { Decimal } from 'decimal.js';
import type {
  AdminLoanRateSourceWire, AdminRateKeyWire, LoanRateReadingWire, ManualRateInputWire, MclrTenor, RateSourceMode,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { runLoanRates, runLoanRatesJob, type LoanRatesRunResult } from '../../jobs/loanRatesJob.js';
import { isSourceStale } from './sanity.js';
import { ensureLoanRateSources } from './sourceList.js';
import { activateSuspect, dateOnly, isoDate, rateKey, toReadingWire, writeBenchmark } from './store.js';

const MANUAL_MIN = new Decimal('0.01');
const MANUAL_MAX = new Decimal(50);

/** 'YYYY-MM-DD' that names a real calendar day (no Feb 30 rolling into March). */
function isRealDate(iso: string): boolean {
  const d = dateOnly(iso);
  return !Number.isNaN(d.getTime()) && isoDate(d) === iso;
}

/**
 * Settings - Loan rates (spec s5.5): per source, mode, last success / error, the effective rate, the latest
 * AUTO reading beside any MANUAL override (`differs` when they disagree), and pending SUSPECT readings.
 */
export async function listAdminLoanRates(now: Date = new Date()): Promise<AdminLoanRateSourceWire[]> {
  await ensureLoanRateSources();
  const [sources, rows] = await Promise.all([
    prisma.loanRateSource.findMany({ orderBy: [{ lender: 'asc' }, { loanType: 'asc' }] }),
    prisma.loanRate.findMany({ where: { status: { in: ['ACTIVE', 'SUSPECT'] } }, orderBy: { fetchedAt: 'desc' } }),
  ]);
  const bySource = new Map<string, LoanRate[]>();
  for (const row of rows) bySource.set(row.sourceId, [...(bySource.get(row.sourceId) ?? []), row]);

  return sources.map((source) => {
    const own = bySource.get(source.id) ?? [];
    const active = own.filter((r) => r.status === 'ACTIVE');
    const tenors: (MclrTenor | null)[] = [...new Set(own.map((r) => r.tenor as MclrTenor | null))];
    const keys: AdminRateKeyWire[] = tenors
      .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
      .map((tenor) => {
        const forKey = active.filter((r) => rateKey(r.sourceId, r.tenor) === rateKey(source.id, tenor));
        const manual = forKey.find((r) => r.origin === 'MANUAL') ?? null;
        const latestAuto = forKey.find((r) => r.origin === 'AUTO') ?? null;
        const effective = manual ?? latestAuto;
        const differs =
          manual !== null &&
          latestAuto !== null &&
          (!manual.minRatePct.equals(latestAuto.minRatePct) ||
            (manual.maxRatePct?.toString() ?? null) !== (latestAuto.maxRatePct?.toString() ?? null));
        return {
          tenor,
          effective: effective ? toReadingWire(effective) : null,
          latestAuto: latestAuto ? toReadingWire(latestAuto) : null,
          manual: manual ? toReadingWire(manual) : null,
          differs,
        };
      })
      .filter((k) => k.effective !== null);
    return {
      id: source.id,
      lender: source.lender,
      loanType: source.loanType,
      url: source.url,
      mode: source.mode as RateSourceMode,
      adapter: source.adapter,
      adapterVer: source.adapterVer,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: source.lastErrorAt?.toISOString() ?? null,
      lastError: source.lastError,
      stale: isSourceStale(source, now),
      keys,
      suspects: own.filter((r) => r.status === 'SUSPECT').map(toReadingWire),
    };
  });
}

/**
 * Admin sets or corrects a rate: a MANUAL ACTIVE row that wins over AUTO until cleared. Validated, not
 * sanity-checked (plan ruling 9). On a REPO or MCLR source it also updates the benchmark series.
 */
export async function setManualRate(
  adminId: string,
  sourceId: string,
  input: ManualRateInputWire,
  now: Date = new Date(),
): Promise<LoanRateReadingWire> {
  const source = await prisma.loanRateSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError(`Unknown loan-rate source ${sourceId}`);
  const tenor = input.tenor ?? null;
  if (source.loanType === 'MCLR' && tenor === null) throw new BadRequestError('Choose the MCLR tenor', { field: 'tenor' });
  if (source.loanType !== 'MCLR' && tenor !== null) throw new BadRequestError('Only MCLR sources have a tenor', { field: 'tenor' });
  const min = new Decimal(input.minRatePct);
  if (min.lessThan(MANUAL_MIN) || min.greaterThan(MANUAL_MAX)) {
    throw new BadRequestError('Rate must be between 0.01 and 50', { field: 'minRatePct' });
  }
  const maxRaw = input.maxRatePct ?? null;
  if (maxRaw !== null) {
    const max = new Decimal(maxRaw);
    if (max.lessThan(min) || max.greaterThan(MANUAL_MAX)) {
      throw new BadRequestError('Upper rate must be at least the lower rate and at most 50', { field: 'maxRatePct' });
    }
  }
  const effectiveDate = input.effectiveDate ?? null;
  // The body schema only checks the shape; 2026-02-30 must be a 400, not a database error.
  if (effectiveDate !== null && !isRealDate(effectiveDate)) {
    throw new BadRequestError('Not a real date', { field: 'effectiveDate' });
  }

  // One transaction for the override and its benchmark row, under the same per-key advisory lock the store
  // takes, so two admins (or an admin and the job) cannot leave two ACTIVE MANUAL rows or a half-applied set.
  const row = await runInTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rateKey(sourceId, tenor)}))`;
    await tx.loanRate.updateMany({
      where: { sourceId, tenor, origin: 'MANUAL', status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    const createdRow = await tx.loanRate.create({
      data: {
        sourceId,
        basis: input.basis,
        tenor,
        minRatePct: input.minRatePct,
        maxRatePct: maxRaw,
        effectiveDate: effectiveDate === null ? null : dateOnly(effectiveDate),
        fetchedAt: now,
        origin: 'MANUAL',
        status: 'ACTIVE',
        note: input.note,
        createdById: adminId,
      },
    });
    await writeBenchmark(source, tenor, input.minRatePct, effectiveDate, now, tx);
    return createdRow;
  });
  return toReadingWire(row);
}

/** Clear the override for a source (optionally one tenor). Returns how many MANUAL rows were retired. */
export async function clearManualRate(sourceId: string, tenor: MclrTenor | null | undefined): Promise<number> {
  const source = await prisma.loanRateSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError(`Unknown loan-rate source ${sourceId}`);
  const { count } = await prisma.loanRate.updateMany({
    where: { sourceId, origin: 'MANUAL', status: 'ACTIVE', ...(tenor === undefined ? {} : { tenor }) },
    data: { status: 'SUPERSEDED' },
  });
  if (count === 0) throw new NotFoundError('No manual rate to clear');
  return count;
}

export async function approveSuspect(id: string, now: Date = new Date()): Promise<LoanRateReadingWire> {
  const row = await activateSuspect(id, now);
  if (!row) throw new ConflictError('Only a SUSPECT reading can be approved');
  return toReadingWire(row);
}

export async function rejectSuspect(id: string): Promise<LoanRateReadingWire> {
  const { count } = await prisma.loanRate.updateMany({ where: { id, status: 'SUSPECT' }, data: { status: 'REJECTED' } });
  if (count === 0) throw new ConflictError('Only a SUSPECT reading can be rejected');
  return toReadingWire(await prisma.loanRate.findUniqueOrThrow({ where: { id } }));
}

export type RunNowResult = { started: 'one'; result: LoanRatesRunResult } | { started: 'all' };

/**
 * "Run now". One source: run its page now and return what happened. All: start the job in the background
 * (single-flight with the cron) - fifteen pages at up to 15 s each is too long for a request.
 */
export async function runNow(sourceId: string | undefined): Promise<RunNowResult> {
  if (sourceId === undefined) {
    runLoanRatesJob().catch((err: unknown) => logger.error({ err }, '[loanRates] run-now (all) failed'));
    return { started: 'all' };
  }
  const source = await prisma.loanRateSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError(`Unknown loan-rate source ${sourceId}`);
  if (source.mode !== 'AUTO' || source.adapter === null) {
    throw new BadRequestError('This source is entered by hand; set its rate instead', { field: 'sourceId' });
  }
  // runLoanRates is single-flight (shared with the cron and run-now-all): null means a run is in progress.
  const result: LoanRatesRunResult | null = await runLoanRates({ readerIds: [source.adapter] });
  if (result === null) throw new AppError('A rates run is already in progress', 409, 'LOAN_RATES_BUSY');
  return { started: 'one', result };
}
