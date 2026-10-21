/**
 * Does the app agree with the investor's own statement?
 *
 * A CAS prints, per scheme, the units held at its closing date. That figure
 * comes from the registrar, not from us, so it is the one independent check
 * on whether every transaction made it in: if the transactions we hold add up
 * to a different number of units on that date, rows are missing (an earlier
 * statement never imported, a failed row) or doubled.
 *
 * The comparison is user-wide, not per app portfolio: a CAS covers every folio
 * under the PAN, however the user has split those folios across portfolios.
 * Transactions dated after the statement are excluded — they are not missing
 * from it, they happened later.
 *
 * Covers registrar CAS (CAMS/KFintech) and depository statements (NSDL/CDSL),
 * whose "holdings as on" table is the same kind of closing figure.
 */

import { Decimal } from 'decimal.js';
import { Prisma, type Transaction } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { replayTransactions } from '../holdings/holdingsProjection.js';
import { assetKeyFromTransaction } from '../holdings/assetKey.js';
import type {
  StatementHolding,
  StatementSnapshot,
} from '../../ingestion/fileImport/parsers/types.js';

/** CAS prints units to 3 places; anything inside that is print rounding. */
const UNITS_TOLERANCE = new Decimal('0.001');

/** Validates the JSON stored on ImportJob.statementSnapshot (or parser metadata). */
export function parseStatementSnapshot(raw: unknown): StatementSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { asOf?: unknown; holdings?: unknown };
  if (typeof r.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.asOf)) return null;
  if (!Array.isArray(r.holdings)) return null;
  const holdings: StatementHolding[] = [];
  for (const h of r.holdings) {
    if (!h || typeof h !== 'object') continue;
    const x = h as Record<string, unknown>;
    if (typeof x.isin !== 'string' || typeof x.units !== 'string') continue;
    try {
      new Decimal(x.units);
    } catch {
      continue;
    }
    holdings.push({
      isin: x.isin,
      folio: typeof x.folio === 'string' ? x.folio : null,
      schemeName: typeof x.schemeName === 'string' ? x.schemeName : null,
      units: x.units,
    });
  }
  return holdings.length > 0 ? { asOf: r.asOf, holdings } : null;
}

export interface UnitsGap {
  isin: string;
  schemeName: string | null;
  statementUnits: string;
  appUnits: string;
}

/**
 * A transaction with the ISIN of the stock or fund it points at: a trade from
 * a contract note often carries only the stock, not the ISIN, and must still
 * count against a statement that lists the ISIN.
 */
export type IsinTransaction = Transaction & {
  stock?: { isin: string | null } | null;
  fund?: { isin: string | null } | null;
};

const isinOf = (tx: IsinTransaction): string | null => tx.isin ?? tx.stock?.isin ?? tx.fund?.isin ?? null;

/** Every transaction of the user touching these ISINs, directly or through its stock or fund. */
export async function fetchIsinTransactions(userId: string, isins: string[]): Promise<IsinTransaction[]> {
  return prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      OR: [{ isin: { in: isins } }, { stock: { isin: { in: isins } } }, { fund: { isin: { in: isins } } }],
    },
    include: { stock: { select: { isin: true } }, fund: { select: { isin: true } } },
    orderBy: { tradeDate: 'asc' },
  });
}

/** Pure: the units `txs` add up to per ISIN at the end of `asOf` (YYYY-MM-DD). */
export function unitsHeldAt(txs: IsinTransaction[], isins: ReadonlySet<string>, asOf: string): Map<string, Decimal> {
  const cutoff = new Date(`${asOf}T23:59:59.999Z`).getTime();
  // Replay per (portfolio, asset) — the same unit a holding is — then sum.
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const isin = isinOf(tx);
    if (!isin || !isins.has(isin)) continue;
    if (tx.tradeDate.getTime() > cutoff) continue;
    const key = `${isin}|${tx.portfolioId}|${tx.assetKey ?? assetKeyFromTransaction(tx)}`;
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }
  const out = new Map<string, Decimal>();
  for (const [key, group] of groups) {
    const isin = key.slice(0, key.indexOf('|'));
    const qty = Decimal.max(replayTransactions(group).quantity, 0);
    out.set(isin, (out.get(isin) ?? new Decimal(0)).plus(qty));
  }
  return out;
}

/**
 * Pure: per ISIN, statement units vs the units `txs` add up to at the end of
 * `snapshot.asOf`. Folios of the same scheme are summed. Returns only the
 * schemes that disagree.
 */
export function reconcileSnapshot(snapshot: StatementSnapshot, txs: IsinTransaction[]): UnitsGap[] {

  const statementByIsin = new Map<string, { units: Decimal; schemeName: string | null }>();
  for (const h of snapshot.holdings) {
    const cur = statementByIsin.get(h.isin);
    statementByIsin.set(h.isin, {
      units: (cur?.units ?? new Decimal(0)).plus(h.units),
      schemeName: cur?.schemeName ?? h.schemeName,
    });
  }

  const appByIsin = unitsHeldAt(txs, new Set(statementByIsin.keys()), snapshot.asOf);

  const gaps: UnitsGap[] = [];
  for (const [isin, s] of statementByIsin) {
    const app = appByIsin.get(isin) ?? new Decimal(0);
    if (s.units.minus(app).abs().greaterThan(UNITS_TOLERANCE)) {
      gaps.push({ isin, schemeName: s.schemeName, statementUnits: s.units.toString(), appUnits: app.toString() });
    }
  }
  return gaps;
}

export interface StatementMismatch extends UnitsGap {
  importJobId: string;
  fileName: string;
  statementDate: string;
}

/**
 * Every scheme where the user's most recent statement disagrees with their
 * transactions. Only the newest statement per scheme counts — an older one is
 * superseded, not contradicted. Runs in the user's request context (RLS).
 */
export async function findStatementMismatches(userId: string): Promise<StatementMismatch[]> {
  const jobs = await prisma.importJob.findMany({
    where: {
      userId,
      status: { in: ['COMPLETED', 'COMPLETED_WITH_ERRORS'] },
      statementSnapshot: { not: Prisma.DbNull },
    },
    select: { id: true, fileName: true, statementSnapshot: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  // Newest statement date per ISIN wins; ties go to the latest upload.
  const latest = new Map<string, { job: (typeof jobs)[number]; snapshot: StatementSnapshot }>();
  for (const job of jobs) {
    const snapshot = parseStatementSnapshot(job.statementSnapshot);
    if (!snapshot) continue;
    for (const h of snapshot.holdings) {
      const cur = latest.get(h.isin);
      if (!cur || snapshot.asOf > cur.snapshot.asOf) latest.set(h.isin, { job, snapshot });
    }
  }
  if (latest.size === 0) return [];

  const txs = await fetchIsinTransactions(userId, [...latest.keys()]);

  // Reconcile each statement once, restricted to the schemes it is newest for.
  const byJob = new Map<string, { job: (typeof jobs)[number]; snapshot: StatementSnapshot; isins: Set<string> }>();
  for (const [isin, { job, snapshot }] of latest) {
    const entry = byJob.get(job.id) ?? { job, snapshot, isins: new Set<string>() };
    entry.isins.add(isin);
    byJob.set(job.id, entry);
  }
  const out: StatementMismatch[] = [];
  for (const { job, snapshot, isins } of byJob.values()) {
    const scoped = { asOf: snapshot.asOf, holdings: snapshot.holdings.filter((h) => isins.has(h.isin)) };
    for (const gap of reconcileSnapshot(scoped, txs)) {
      out.push({ ...gap, importJobId: job.id, fileName: job.fileName, statementDate: snapshot.asOf });
    }
  }
  return out;
}
