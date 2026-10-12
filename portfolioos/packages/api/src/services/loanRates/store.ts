import type { BenchmarkRate, LoanRate, Prisma } from '@prisma/client';
import type { LoanRateReadingWire, MclrTenor, RateBasis, RateOrigin, RateStatus } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { checkReading, istDate, type SanityReason } from './sanity.js';
import { normPct } from './sources/parseUtil.js';
import type { PageReader, RateReading } from './types.js';

/** What a source looks like to the store: enough to name benchmark rows. */
export interface StoreSource {
  id: string;
  lender: string;
  loanType: string;
}

export type RecordOutcome = 'ACTIVE' | 'SUSPECT' | 'UNCHANGED';

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
 * (source, tenor) inserts nothing, so a second run on the same day is a no-op. Otherwise the sanity rules
 * decide ACTIVE or SUSPECT; an ACTIVE row supersedes earlier ACTIVE AUTO rows and updates the benchmark
 * series, a SUSPECT row changes nothing users see.
 */
export async function recordReading(
  source: StoreSource,
  reading: RateReading,
  reader: Pick<PageReader, 'id' | 'version'>,
  now: Date,
): Promise<{ outcome: RecordOutcome; rowId: string; reasons: SanityReason[] }> {
  const key = { sourceId: source.id, tenor: reading.tenor, origin: 'AUTO' };
  const latest = await prisma.loanRate.findFirst({
    where: { ...key, status: { in: ['ACTIVE', 'SUSPECT'] } },
    orderBy: { fetchedAt: 'desc' },
  });
  if (latest && sameValues(latest, reading)) return { outcome: 'UNCHANGED', rowId: latest.id, reasons: [] };

  const lastActive =
    latest?.status === 'ACTIVE'
      ? latest
      : await prisma.loanRate.findFirst({ where: { ...key, status: 'ACTIVE' }, orderBy: { fetchedAt: 'desc' } });
  const verdict = checkReading(reading, lastActive ? lastActive.minRatePct.toString() : null, istDate(now));
  const note = [reading.note, ...verdict.reasons].filter((x): x is string => Boolean(x)).join('; ') || null;

  const row = await runInTransaction(async (tx) => {
    const created = await tx.loanRate.create({
      data: {
        sourceId: source.id,
        basis: reading.basis,
        tenor: reading.tenor,
        minRatePct: reading.minRatePct,
        maxRatePct: reading.maxRatePct,
        effectiveDate: reading.effectiveDate === null ? null : dateOnly(reading.effectiveDate),
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
    }
    return created;
  });

  if (verdict.status === 'ACTIVE') {
    await writeBenchmark(source, reading.tenor, reading.minRatePct, reading.effectiveDate, now);
  }
  return { outcome: verdict.status, rowId: row.id, reasons: verdict.reasons };
}

/**
 * Admin approval of a SUSPECT AUTO reading: it becomes ACTIVE, supersedes the other ACTIVE AUTO rows for its
 * (source, tenor) and updates the benchmark series. Returns null when the row is missing or not SUSPECT.
 */
export async function activateSuspect(id: string, now: Date): Promise<LoanRate | null> {
  const row = await prisma.loanRate.findUnique({ where: { id }, include: { source: true } });
  if (!row || row.status !== 'SUSPECT' || row.origin !== 'AUTO') return null;
  const updated = await runInTransaction(async (tx) => {
    await tx.loanRate.updateMany({
      where: { sourceId: row.sourceId, tenor: row.tenor, origin: 'AUTO', status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    return tx.loanRate.update({ where: { id }, data: { status: 'ACTIVE' } });
  });
  await writeBenchmark(row.source, row.tenor, row.minRatePct.toString(), isoDate(row.effectiveDate), now);
  return updated;
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
): Promise<BenchmarkRate | null> {
  const kind = source.loanType === 'REPO' ? 'REPO' : source.loanType === 'MCLR' ? 'MCLR' : null;
  if (kind === null) return null;
  const lender = kind === 'REPO' ? null : source.lender;
  const benchTenor = kind === 'MCLR' ? tenor : null;
  const latest = await prisma.benchmarkRate.findFirst({
    where: { kind, lender, tenor: benchTenor },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
  });
  if (latest && latest.ratePct.equals(ratePct)) return null;
  const date = dateOnly(effectiveDate ?? istDate(now));
  const sameDay = await prisma.benchmarkRate.findFirst({ where: { kind, lender, tenor: benchTenor, effectiveDate: date } });
  if (sameDay) return prisma.benchmarkRate.update({ where: { id: sameDay.id }, data: { ratePct, fetchedAt: now } });
  return prisma.benchmarkRate.create({ data: { kind, lender, tenor: benchTenor, ratePct, effectiveDate: date, fetchedAt: now } });
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
