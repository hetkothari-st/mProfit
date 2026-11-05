import { SOURCE_PRIORITY, type SpendSourceKind } from './spendTypes.js';

/**
 * Cross-source duplicates: the same payment reported by an email alert and
 * by a statement line. Pure; no DB.
 *
 * Two rows are the same payment when they come from different kinds of
 * source, share the account, direction and exact amount, and are at most
 * one day apart (alerts often carry the posting date, statements the value
 * date). Rows from the same kind of source are never merged: two ₹50 UPI
 * payments on one day are two payments, and the source's own ids already
 * stop a re-sync from duplicating anything. A row without an account is
 * never merged either, since it cannot be told apart from another account's
 * payment of the same amount.
 *
 * Each row is absorbed at most once, by the best-priority match nearest in
 * date, so two alerts and one statement line for two real payments leave one
 * alert standing.
 */

export interface DedupeRow {
  id: string;
  source: SpendSourceKind;
  accountKey: string | null;
  direction: string;
  /** Amount as a fixed 2-dp string, so equality is exact. */
  amount: string;
  txnDate: Date;
}

const DAY_MS = 86_400_000;
const MAX_GAP_DAYS = 1;

/** id → id of the row it duplicates. Rows that are kept are absent. */
export function findDuplicates(rows: readonly DedupeRow[]): Map<string, string> {
  const groups = new Map<string, DedupeRow[]>();
  for (const r of rows) {
    if (!r.accountKey) continue;
    const key = `${r.accountKey}|${r.direction}|${r.amount}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Best sources keep their rows; each claims at most one lower row per source kind.
    const ordered = [...group].sort(
      (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source] || a.txnDate.getTime() - b.txnDate.getTime() || a.id.localeCompare(b.id),
    );
    const claimed = new Set<string>();
    for (const keeper of ordered) {
      if (out.has(keeper.id)) continue;
      const takenKinds = new Set<SpendSourceKind>();
      const candidates = ordered
        .filter((r) => r !== keeper && !claimed.has(r.id) && !out.has(r.id))
        .filter((r) => SOURCE_PRIORITY[r.source] < SOURCE_PRIORITY[keeper.source])
        .filter((r) => Math.abs(r.txnDate.getTime() - keeper.txnDate.getTime()) <= MAX_GAP_DAYS * DAY_MS)
        .sort((a, b) => Math.abs(a.txnDate.getTime() - keeper.txnDate.getTime()) - Math.abs(b.txnDate.getTime() - keeper.txnDate.getTime()));
      for (const c of candidates) {
        if (takenKinds.has(c.source)) continue;
        takenKinds.add(c.source);
        claimed.add(c.id);
        out.set(c.id, keeper.id);
      }
      claimed.add(keeper.id);
    }
  }
  return out;
}
