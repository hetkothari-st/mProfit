import type { BenchmarkRate, LoanRate, Prisma } from '@prisma/client';
import type { LoanRateReadingWire, MclrTenor, RateBasis, RateOrigin, RateStatus } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { checkReading, istDate, type SanityReason } from './sanity.js';
import { normPct } from './sources/parseUtil.js';
import type { PageReader, RateReading } from './types.js';

/** What a source looks like to the store: enough to name benchmark rows. */
export interface StoreSource {
  id: string;
  lender: string;
  loanType: string;
}

/**
 * UNCHANGED_SUSPECT: the reading repeats the latest row and that row is SUSPECT (held for review). Nothing is
 * inserted, but it is not a success either: callers treat it exactly like SUSPECT.
 */
export type RecordOutcome = 'ACTIVE' | 'SUSPECT' | 'UNCHANGED' | 'UNCHANGED_SUSPECT';

export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoDate(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10);
}

/** Prisma Decimal -> wire string with at least two decimals ("8.50", "8.125", "-0.25"). */
export function pctString(d: Prisma.Decimal): string {
  return normPct(d.toString());
}

/** Override key: basis is an attribute of the rate, not part of the key (plan ruling: effective per source + tenor). */
export function rateKey(sourceId: string, tenor: string | null): string {
  return `${sourceId}|${tenor ?? ''}`;
}

export function toReadingWire(r: LoanRate): LoanRateReadingWire {
  return {
    id: r.id,
    sourceId: r.sourceId,
    basis: r.basis as RateBasis,
    tenor: r.tenor as MclrTenor | null,
    minRatePct: pctString(r.minRatePct),
    maxRatePct: r.maxRatePct === null ? null : pctString(r.maxRatePct),
    effectiveDate: isoDate(r.effectiveDate),
    fetchedAt: r.fetchedAt.toISOString(),
    origin: r.origin as RateOrigin,
    status: r.status as RateStatus,
    note: r.note,
    sourceAdapter: r.sourceAdapter,
    sourceAdapterVer: r.sourceAdapterVer,
  };
}

function sameValues(row: LoanRate, r: RateReading): boolean {
  const sameMax = row.maxRatePct === null ? r.maxRatePct === null : r.maxRatePct !== null && row.maxRatePct.equals(r.maxRatePct);
  return row.basis === r.basis && row.minRatePct.equals(r.minRatePct) && sameMax && isoDate(row.effectiveDate) === r.effectiveDate;
}

/**
 * Append one AUTO reading (spec s5.3/s5.4). A reading identical to the latest AUTO row for the same
 * (source, tenor) inserts nothing, so a second run on the same day is a no-op (UNCHANGED, or
 * UNCHANGED_SUSPECT when that row is held for review). A bad-date reading is stored with a null date and the
 * raw text in its note, so a repeat of it is matched on the stored values and note instead. Otherwise the
 * sanity rules decide ACTIVE or SUSPECT; an ACTIVE row supersedes earlier ACTIVE AUTO rows and updates the
 * benchmark series, a SUSPECT row changes nothing users see.
 */
export async function recordReading(
  source: StoreSource,
  reading: RateReading,
  reader: Pick<PageReader, 'id' | 'version'>,
  now: Date,
): Promise<{ outcome: RecordOutcome; rowId: string; reasons: SanityReason[] }> {
  const key = { sourceId: source.id, tenor: reading.tenor, origin: 'AUTO' };
  return runInTransaction(async (tx) => {
    await lockKey(tx, rateKey(source.id, reading.tenor));
    const latest = await tx.loanRate.findFirst({
      where: { ...key, status: { in: ['ACTIVE', 'SUSPECT'] } },
      orderBy: { fetchedAt: 'desc' },
    });
    if (latest && sameValues(latest, reading)) {
      const outcome: RecordOutcome = latest.status === 'SUSPECT' ? 'UNCHANGED_SUSPECT' : 'UNCHANGED';
      return { outcome, rowId: latest.id, reasons: [] as SanityReason[] };
    }
    const lastActive =
      latest?.status === 'ACTIVE'
        ? latest
        : await tx.loanRate.findFirst({ where: { ...key, status: 'ACTIVE' }, orderBy: { fetchedAt: 'desc' } });
    const verdict = checkReading(reading, lastActive ? lastActive.minRatePct.toString() : null, istDate(now));
    const badDate = verdict.reasons.includes('BAD_DATE') && reading.effectiveDate !== null;
    const note = [reading.note, ...verdict.reasons, badDate ? `bad as-of date: ${reading.effectiveDate?.slice(0, 40)}` : null].filter((x): x is string => Boolean(x)).join('; ') || null;
    if (
      verdict.status === 'SUSPECT' &&
      latest?.status === 'SUSPECT' &&
      latest.note === note &&
      sameValues(latest, { ...reading, effectiveDate: badDate ? null : reading.effectiveDate })
    ) {
      return { outcome: 'UNCHANGED_SUSPECT' as RecordOutcome, rowId: latest.id, reasons: verdict.reasons };
    }
    const created = await tx.loanRate.create({
      data: {
        sourceId: source.id,
        basis: reading.basis,
        tenor: reading.tenor,
        minRatePct: reading.minRatePct,
        maxRatePct: reading.maxRatePct,
        effectiveDate: reading.effectiveDate === null || badDate ? null : dateOnly(reading.effectiveDate),
        fetchedAt: now,
        origin: 'AUTO',
        status: verdict.status,
        note,
        sourceAdapter: reader.id,
        sourceAdapterVer: reader.version,
      },
    });
    if (verdict.status === 'ACTIVE') {
      await tx.loanRate.updateMany({
        where: { ...key, status: 'ACTIVE', id: { not: created.id } },
        data: { status: 'SUPERSEDED' },
      });
      await writeBenchmark(source, reading.tenor, reading.minRatePct, reading.effectiveDate, now, tx);
    }
    return { outcome: verdict.status as RecordOutcome, rowId: created.id, reasons: verdict.reasons };
  });
}

/** Serialise writers on one logical key for the rest of the transaction (the tables have no usable unique key for this). */
export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Admin approval of a SUSPECT AUTO reading: it becomes ACTIVE, supersedes the other ACTIVE AUTO rows for its
 * (source, tenor) and updates the benchmark series. Returns null when the row is missing or not SUSPECT.
 * Refuses (409 LOAN_RATES_STALE_SUSPECT) when a newer ACTIVE AUTO reading exists for the key: approving the
 * older one would roll the rate back.
 */
export async function activateSuspect(id: string, now: Date): Promise<LoanRate | null> {
  const head = await prisma.loanRate.findUnique({ where: { id }, select: { sourceId: true, tenor: true } });
  if (!head) return null;
  return runInTransaction(async (tx) => {
    await lockKey(tx, rateKey(head.sourceId, head.tenor));
    const row = await tx.loanRate.findUnique({ where: { id }, include: { source: true } });
    if (!row || row.status !== 'SUSPECT' || row.origin !== 'AUTO') return null;
    const newer = await tx.loanRate.findFirst({
      where: { sourceId: row.sourceId, tenor: row.tenor, origin: 'AUTO', status: 'ACTIVE', fetchedAt: { gt: row.fetchedAt } },
      select: { id: true },
    });
    if (newer) throw new AppError('A newer reading exists - reject this one', 409, 'LOAN_RATES_STALE_SUSPECT');
    const flipped = await tx.loanRate.updateMany({ where: { id, status: 'SUSPECT' }, data: { status: 'ACTIVE' } });
    if (flipped.count === 0) return null;
    await tx.loanRate.updateMany({
      where: { sourceId: row.sourceId, tenor: row.tenor, origin: 'AUTO', status: 'ACTIVE', id: { not: id } },
      data: { status: 'SUPERSEDED' },
    });
    await writeBenchmark(row.source, row.tenor, row.minRatePct.toString(), isoDate(row.effectiveDate), now, tx);
    return tx.loanRate.findUniqueOrThrow({ where: { id } });
  });
}

/**
 * Keep BenchmarkRate (spec s5.3) in step with REPO and MCLR sources: one row per change. The date is the
 * page's as-of date, or the IST day the change was first seen when the page gives none (RBI).
 */
export async function writeBenchmark(
  source: StoreSource,
  tenor: string | null,
  ratePct: string,
  effectiveDate: string | null,
  now: Date,
  tx?: Prisma.TransactionClient,
): Promise<BenchmarkRate | null> {
  if (!tx) return runInTransaction((t) => writeBenchmark(source, tenor, ratePct, effectiveDate, now, t));
  const kind = source.loanType === 'REPO' ? 'REPO' : source.loanType === 'MCLR' ? 'MCLR' : null;
  if (kind === null) return null;
  const lender = kind === 'REPO' ? null : source.lender;
  const benchTenor = kind === 'MCLR' ? tenor : null;
  await lockKey(tx, `bench|${kind}|${lender ?? ''}|${benchTenor ?? ''}`);
  const latest = await tx.benchmarkRate.findFirst({
    where: { kind, lender, tenor: benchTenor },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
  });
  if (latest && latest.ratePct.equals(ratePct)) return null;
  const date = dateOnly(effectiveDate ?? istDate(now));
  const sameDay = await tx.benchmarkRate.findFirst({ where: { kind, lender, tenor: benchTenor, effectiveDate: date } });
  if (sameDay) return tx.benchmarkRate.update({ where: { id: sameDay.id }, data: { ratePct, fetchedAt: now } });
  return tx.benchmarkRate.create({ data: { kind, lender, tenor: benchTenor, ratePct, effectiveDate: date, fetchedAt: now } });
}

/**
 * After a MANUAL override on a REPO or MCLR source is cleared (caller holds the per-key lock in `tx`): every
 * benchmark row an override wrote since the effective AUTO reading (each MANUAL row for the key, any status,
 * fetched after that AUTO row - so a corrected-then-cleared override leaves nothing behind) is removed, then
 * the series is put back on the effective AUTO rate. A benchmark row is recognised as an override's by the
 * same value and the override's fetchedAt; a row that matches an AUTO reading the same way is never touched.
 * The restored row is dated from the AUTO reading itself (its as-of date, else the IST day it was fetched),
 * never from the clear. With no ACTIVE AUTO row the series keeps whatever is left.
 */
export async function restoreBenchmarkAfterClear(
  tx: Prisma.TransactionClient,
  source: StoreSource,
  tenor: string | null,
): Promise<void> {
  const kind = source.loanType === 'REPO' ? 'REPO' : source.loanType === 'MCLR' ? 'MCLR' : null;
  if (kind === null) return;
  const lender = kind === 'REPO' ? null : source.lender;
  const benchTenor = kind === 'MCLR' ? tenor : null;
  await lockKey(tx, `bench|${kind}|${lender ?? ''}|${benchTenor ?? ''}`);
  const auto = await tx.loanRate.findFirst({
    where: { sourceId: source.id, tenor, origin: 'AUTO', status: 'ACTIVE' },
    orderBy: { fetchedAt: 'desc' },
  });
  const [manuals, autos, bench] = await Promise.all([
    tx.loanRate.findMany({
      where: { sourceId: source.id, tenor, origin: 'MANUAL', ...(auto ? { fetchedAt: { gt: auto.fetchedAt } } : {}) },
    }),
    tx.loanRate.findMany({ where: { sourceId: source.id, tenor, origin: 'AUTO' }, select: { fetchedAt: true, minRatePct: true } }),
    tx.benchmarkRate.findMany({ where: { kind, lender, tenor: benchTenor } }),
  ]);
  const wrote = (r: { fetchedAt: Date; minRatePct: Prisma.Decimal }, b: BenchmarkRate) =>
    r.fetchedAt.getTime() === b.fetchedAt.getTime() && r.minRatePct.equals(b.ratePct);
  const stale = bench.filter((b) => manuals.some((m) => wrote(m, b)) && !autos.some((a) => wrote(a, b)));
  if (stale.length > 0) await tx.benchmarkRate.deleteMany({ where: { id: { in: stale.map((b) => b.id) } } });
  if (auto) await writeBenchmark(source, tenor, auto.minRatePct.toString(), isoDate(auto.effectiveDate), auto.fetchedAt, tx);
}

/**
 * Effective rate per (source, tenor) for the given sources: the latest MANUAL ACTIVE row if there is one
 * (manual wins until cleared), else the latest AUTO ACTIVE row. SUSPECT, REJECTED and SUPERSEDED rows are
 * never effective.
 */
export async function effectiveRates(sourceIds: string[]): Promise<Map<string, LoanRate>> {
  const rows = await prisma.loanRate.findMany({
    where: { sourceId: { in: sourceIds }, status: 'ACTIVE' },
    orderBy: { fetchedAt: 'desc' },
  });
  const out = new Map<string, LoanRate>();
  for (const row of rows) {
    const k = rateKey(row.sourceId, row.tenor);
    const current = out.get(k);
    if (!current || (current.origin === 'AUTO' && row.origin === 'MANUAL')) out.set(k, row);
  }
  return out;
}
