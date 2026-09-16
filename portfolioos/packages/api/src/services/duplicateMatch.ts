// What counts as the same money twice.
//
// sourceHash (§3.3) only catches the same row arriving twice from the same
// source. It cannot catch one trade arriving from a CAS, again from a contract
// note, and again typed in by hand — three source hashes, one economic event.
// This module matches on the event itself instead, and is used in two places:
// as a guard before a Transaction is written, and by the finder that lists
// duplicates already on the books (duplicates.service.ts).
//
// Everything here except findDuplicateTransaction is pure.

import type { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/** A row that could be one half of a duplicate pair. */
export interface DuplicateTxnRow {
  id: string;
  portfolioId: string;
  portfolioName: string;
  assetClass: string;
  assetKey: string;
  assetName: string;
  transactionType: string;
  /** YYYY-MM-DD */
  tradeDate: string;
  quantity: string;
  price: string;
  netAmount: string;
  broker: string | null;
  orderNo: string | null;
  tradeNo: string | null;
  importJobId: string | null;
  importFileName: string | null;
  sourceAdapter: string | null;
  /** ISO timestamp; the earliest-created row in a group is the one we keep. */
  createdAt: string;
}

export interface DuplicateRentRow {
  id: string;
  tenancyId: string;
  property: string;
  tenant: string;
  entryType: string;
  /** YYYY-MM-DD */
  entryDate: string;
  amount: string;
  forMonth: string | null;
  note: string | null;
  createdAt: string;
}

export type DuplicateRow =
  | ({ kind: 'TRANSACTION' } & DuplicateTxnRow)
  | ({ kind: 'RENT_ENTRY' } & DuplicateRentRow);

export interface DuplicateGroup {
  kind: 'TRANSACTION' | 'RENT_ENTRY';
  fingerprint: string;
  /** Human summary of what the rows have in common. */
  label: string;
  rows: DuplicateRow[];
  /** The row we would keep — always the oldest. */
  keepId: string;
  /** Ids we suggest removing. Empty when the repeat looks deliberate. */
  suggestedRemovalIds: string[];
  /** 'high' → almost certainly a duplicate. 'low' → shown, but not pre-ticked. */
  confidence: 'high' | 'low';
  reason: string;
}

// ---------------------------------------------------------------- fingerprints

/**
 * What makes two rows the same economic event: the same asset, in the same
 * portfolio, the same kind of trade, on the same day, for the same quantity at
 * the same price. Charges are deliberately left out — a CAS carries none and a
 * contract note carries all of them, and that difference must not hide a
 * duplicate.
 */
export function transactionFingerprint(t: {
  portfolioId: string;
  assetKey: string;
  transactionType: string;
  tradeDate: string;
  quantity: string;
  price: string;
}): string {
  return [
    t.portfolioId,
    t.assetKey,
    t.transactionType,
    t.tradeDate,
    normaliseNumber(t.quantity),
    normaliseNumber(t.price),
  ].join('|');
}

export function rentFingerprint(e: {
  tenancyId: string;
  entryType: string;
  entryDate: string;
  amount: string;
  forMonth: string | null;
}): string {
  return [e.tenancyId, e.entryType, e.entryDate, normaliseNumber(e.amount), e.forMonth ?? ''].join('|');
}

/** 10.000000 and 10 are the same quantity. Trailing zeros must not split a group. */
function normaliseNumber(v: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(v)) return v;
  const trimmed = v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
  return trimmed === '-0' ? '0' : trimmed;
}

// ------------------------------------------------------------------- grouping

/**
 * Two trades of the same size on the same day are not always a mistake: a
 * broker can fill one order in two parts, and the contract note then carries
 * two trade numbers. So a repeat only counts as a duplicate when we cannot
 * find a reason for it.
 */
export function classifyTransactionGroup(rows: DuplicateTxnRow[]): {
  confidence: 'high' | 'low';
  reason: string;
} {
  const tradeKeys = rows.map((r) =>
    r.orderNo && r.tradeNo ? `${r.broker ?? ''}|${r.orderNo}|${r.tradeNo}` : null,
  );
  if (tradeKeys.every((k) => k !== null) && new Set(tradeKeys).size === rows.length) {
    return {
      confidence: 'low',
      reason: 'Each row carries its own trade number, so the broker filled the order in parts.',
    };
  }

  const jobs = new Set(rows.map((r) => r.importJobId));
  if (jobs.size === 1 && !jobs.has(null)) {
    return {
      confidence: 'low',
      reason: 'All of these came from one imported file, which lists them as separate rows.',
    };
  }

  const sources = new Set(rows.map((r) => r.importFileName ?? r.sourceAdapter ?? 'entered by hand'));
  return {
    confidence: 'high',
    reason:
      sources.size > 1
        ? `The same trade reached the books from ${sources.size} places: ${[...sources].join(', ')}.`
        : 'The same trade was recorded more than once from the same place.',
  };
}

function oldestFirst<T extends { createdAt: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function groupTransactionDuplicates(rows: DuplicateTxnRow[]): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateTxnRow[]>();
  for (const row of rows) {
    const fp = transactionFingerprint(row);
    const bucket = buckets.get(fp);
    if (bucket) bucket.push(row);
    else buckets.set(fp, [row]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [fingerprint, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const sorted = oldestFirst(bucket);
    const { confidence, reason } = classifyTransactionGroup(sorted);
    const keep = sorted[0]!;
    groups.push({
      kind: 'TRANSACTION',
      fingerprint,
      label: `${sorted.length} × ${keep.transactionType} ${keep.quantity} ${keep.assetName} on ${keep.tradeDate} (${keep.portfolioName})`,
      rows: sorted.map((r) => ({ kind: 'TRANSACTION' as const, ...r })),
      keepId: keep.id,
      suggestedRemovalIds: confidence === 'high' ? sorted.slice(1).map((r) => r.id) : [],
      confidence,
      reason,
    });
  }
  return sortGroups(groups);
}

export function groupRentDuplicates(rows: DuplicateRentRow[]): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateRentRow[]>();
  for (const row of rows) {
    const fp = rentFingerprint(row);
    const bucket = buckets.get(fp);
    if (bucket) bucket.push(row);
    else buckets.set(fp, [row]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [fingerprint, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const sorted = oldestFirst(bucket);
    const keep = sorted[0]!;
    groups.push({
      kind: 'RENT_ENTRY',
      fingerprint,
      label: `${sorted.length} × ${keep.entryType.toLowerCase()} of ${keep.amount} on ${keep.entryDate} — ${keep.property} / ${keep.tenant}`,
      rows: sorted.map((r) => ({ kind: 'RENT_ENTRY' as const, ...r })),
      keepId: keep.id,
      suggestedRemovalIds: sorted.slice(1).map((r) => r.id),
      confidence: 'high',
      reason:
        'The same amount was recorded against the same month on the same day — usually the "mark received" button pressed twice.',
    });
  }
  return sortGroups(groups);
}

function sortGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
  return groups.sort(
    (a, b) =>
      (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1) ||
      b.rows.length - a.rows.length ||
      a.label.localeCompare(b.label),
  );
}

// ------------------------------------------------------------- the write guard

/** What the guard hands back about the row it matched. */
export interface DuplicateTwin {
  id: string;
  tradeDate: Date;
  importJobId: string | null;
  broker: string | null;
  orderNo: string | null;
  tradeNo: string | null;
}

/**
 * Two rows that both carry a broker's order and trade numbers, and carry
 * different ones, are two fills of one order — the contract note says so. That
 * is the one case where identical size, price and day is not a duplicate.
 */
export function isSeparateFill(
  incoming: { broker?: string | null; orderNo?: string | null; tradeNo?: string | null } | undefined,
  existing: DuplicateTwin,
): boolean {
  if (!incoming?.orderNo || !incoming.tradeNo) return false;
  if (!existing.orderNo || !existing.tradeNo) return false;
  return existing.orderNo !== incoming.orderNo || existing.tradeNo !== incoming.tradeNo;
}

/**
 * Returns the row a new transaction would duplicate, or null.
 *
 * `ignoreImportJobId` exempts rows already written by the import that is
 * running right now: two identical lines inside one file are two real trades,
 * and the file itself is the authority on that. `excludeId` exempts the row
 * being edited, which is otherwise its own twin. `naturalKey` lets a caller
 * that knows its order and trade numbers keep a second fill of one order.
 */
export async function findDuplicateTransaction(
  input: {
    portfolioId: string;
    assetKey: string;
    transactionType: TransactionType | string;
    tradeDate: Date;
    quantity: string;
    price: string;
  },
  opts: {
    ignoreImportJobId?: string;
    excludeId?: string;
    naturalKey?: { broker?: string | null; orderNo?: string | null; tradeNo?: string | null };
  } = {},
): Promise<DuplicateTwin | null> {
  const where: Prisma.TransactionWhereInput = {
    portfolioId: input.portfolioId,
    assetKey: input.assetKey,
    transactionType: input.transactionType as TransactionType,
    tradeDate: input.tradeDate,
    quantity: input.quantity,
    price: input.price,
  };
  if (opts.ignoreImportJobId) {
    where.NOT = { importJobId: opts.ignoreImportJobId };
  }
  if (opts.excludeId) {
    where.id = { not: opts.excludeId };
  }
  const rows = await prisma.transaction.findMany({
    where,
    select: { id: true, tradeDate: true, importJobId: true, broker: true, orderNo: true, tradeNo: true },
    orderBy: { createdAt: 'asc' },
    // A handful is plenty: we only need one row that is not a separate fill.
    take: 25,
  });
  return rows.find((row) => !isSeparateFill(opts.naturalKey, row)) ?? null;
}
