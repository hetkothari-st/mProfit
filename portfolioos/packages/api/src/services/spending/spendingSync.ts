import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import { isOwnTransfer, nameTokens } from '../safeToInvest/creditClassifier.js';
import { findDuplicates } from './dedupe.js';
import { canonicalEventSource } from './sources/canonicalEventSource.js';
import type { NormalisedTxn, SpendExcludeReason, SpendSource } from './spendTypes.js';

/**
 * Rebuild one user's SpendTxn rows from every registered source.
 *
 * Idempotent: rows are keyed by (source, sourceRef), so a re-run with nothing
 * new writes nothing. Each source returns its full current set; rows it no
 * longer returns are removed. Cross-source duplicates are marked (not
 * deleted) so the choice is visible and reversible. Must run inside the
 * user's request context (runAsUser) or as system.
 */

/** Sources the store is built from. Statements, manual and Finvu join here later. */
export const SPEND_SOURCES: readonly SpendSource[] = [canonicalEventSource];

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  duplicates: number;
}

const amount2 = (d: Decimal | { toString(): string }) => new Decimal(d.toString()).toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);

function excludeReason(t: NormalisedTxn, tokens: readonly string[]): SpendExcludeReason | null {
  return isOwnTransfer({ counterparty: t.counterparty, parserNotes: t.narration, instrumentName: null, currency: t.currency }, tokens)
    ? 'self_transfer'
    : null;
}

export async function syncSpending(userId: string, sources: readonly SpendSource[] = SPEND_SOURCES): Promise<SyncResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const tokens = nameTokens(user?.name);
  const result: SyncResult = { created: 0, updated: 0, removed: 0, duplicates: 0 };

  for (const source of sources) {
    const incoming = await source.fetch(userId);
    const existing = await prisma.spendTxn.findMany({ where: { userId, source: source.kind } });
    const byRef = new Map(existing.map((r) => [r.sourceRef, r]));
    const seen = new Set<string>();

    const toCreate = [];
    for (const t of incoming) {
      seen.add(t.sourceRef);
      const data = {
        sourceAdapter: t.sourceAdapter,
        accountKey: t.accountKey,
        txnDate: t.txnDate,
        amount: amount2(t.amount),
        direction: t.direction,
        mode: t.mode,
        narration: t.narration,
        counterparty: t.counterparty,
        currency: t.currency,
        excludeReason: excludeReason(t, tokens),
      };
      const row = byRef.get(t.sourceRef);
      if (!row) {
        toCreate.push({ userId, source: source.kind, sourceRef: t.sourceRef, ...data });
        continue;
      }
      const changed =
        row.sourceAdapter !== data.sourceAdapter ||
        row.accountKey !== data.accountKey ||
        day(row.txnDate) !== day(data.txnDate) ||
        amount2(row.amount) !== data.amount ||
        row.direction !== data.direction ||
        row.mode !== data.mode ||
        row.narration !== data.narration ||
        row.counterparty !== data.counterparty ||
        row.currency !== data.currency ||
        row.excludeReason !== data.excludeReason;
      if (changed) {
        await prisma.spendTxn.update({ where: { id: row.id }, data });
        result.updated += 1;
      }
    }
    if (toCreate.length > 0) {
      const res = await prisma.spendTxn.createMany({ data: toCreate, skipDuplicates: true });
      result.created += res.count;
    }
    const gone = existing.filter((r) => !seen.has(r.sourceRef)).map((r) => r.id);
    if (gone.length > 0) {
      // Rows that pointed at a removed row stop being duplicates of it.
      await prisma.spendTxn.updateMany({ where: { userId, duplicateOfId: { in: gone } }, data: { duplicateOfId: null } });
      const res = await prisma.spendTxn.deleteMany({ where: { userId, id: { in: gone } } });
      result.removed += res.count;
    }
  }

  // Cross-source duplicates, over everything the user has.
  const all = await prisma.spendTxn.findMany({
    where: { userId },
    select: { id: true, source: true, accountKey: true, direction: true, amount: true, txnDate: true, duplicateOfId: true },
  });
  const dupes = findDuplicates(
    all.map((r) => ({ ...r, source: r.source as NormalisedTxn['source'], amount: amount2(r.amount) })),
  );
  for (const r of all) {
    const want = dupes.get(r.id) ?? null;
    if (r.duplicateOfId !== want) {
      await prisma.spendTxn.update({ where: { id: r.id }, data: { duplicateOfId: want } });
    }
  }
  result.duplicates = dupes.size;
  return result;
}

export interface SpendRow {
  id: string;
  source: string;
  txnDate: Date;
  amount: Decimal;
  direction: string;
  mode: string;
  counterparty: string | null;
  narration: string | null;
  excludeReason: string | null;
}

/** The user's movements in [from, to): duplicates left out, exclusions kept and labelled. */
export async function listSpending(userId: string, from: Date, to: Date): Promise<SpendRow[]> {
  const rows = await prisma.spendTxn.findMany({
    where: { userId, duplicateOfId: null, txnDate: { gte: from, lt: to } },
    select: {
      id: true, source: true, txnDate: true, amount: true, direction: true, mode: true,
      counterparty: true, narration: true, excludeReason: true,
    },
    orderBy: [{ txnDate: 'asc' }, { id: 'asc' }],
  });
  return rows.map((r) => ({ ...r, amount: new Decimal(r.amount.toString()) }));
}
