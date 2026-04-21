import { createHash } from 'node:crypto';

/**
 * Deterministic source-hash helpers for Transaction idempotency (§3.3, §4.5,
 * §6.2, §5.1 task 5). Every ingestion path must produce the same hash for
 * the same logical event — a retry, a re-upload, or a Gmail resync of the
 * same message MUST NOT create a new row.
 *
 * A hash is *scope-prefixed* (`natural:`, `file:`, `gmail:`, …) so that two
 * different sources that happen to share a value (e.g. a file-byte hash
 * collides with an order number — astronomically unlikely but trivially
 * dodged here) can never produce the same Transaction.sourceHash.
 *
 * If a path has no deterministic identity (manual UI entry), the row is
 * stored with `sourceHash = NULL` and the partial unique index (see the
 * phase-4.5 migration) exempts it from dedup — we simply can't tell a
 * user-retry from a genuine second trade on manual entry.
 */

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Broker-provided natural key. Zerodha/Kite/etc. assign a globally-unique
 * `tradeNo` to each execution and `orderNo` to each order, so the triplet
 * `(broker, orderNo, tradeNo)` uniquely identifies a fill. We scope by
 * userId so two users whose brokers happen to reuse an orderNo never
 * collide on the global `sourceHash @unique` index.
 */
export function naturalKeyHash(opts: {
  userId: string;
  broker: string;
  orderNo: string;
  tradeNo: string;
}): string {
  return sha256Hex(
    `natural:${opts.userId}:${opts.broker}:${opts.orderNo}:${opts.tradeNo}`,
  );
}

/**
 * Positional hash for statement-style documents (CAS PDFs, generic CSV/Excel)
 * where individual rows lack a natural key. The `fileHash` pins the hash to
 * the exact byte content of the file, so re-uploading the SAME file = dedup,
 * but uploading a later statement (different bytes) = new rows.
 *
 * `rowIndex` must be stable across re-runs of the same parser on the same
 * bytes — every parser sorts or emits in a deterministic order.
 */
export function positionalHash(opts: {
  adapterId: string;
  fileHash: string;
  rowIndex: number;
}): string {
  return sha256Hex(`file:${opts.adapterId}:${opts.fileHash}:${opts.rowIndex}`);
}

/** sha256 of raw file bytes, used as the `fileHash` input to `positionalHash`. */
export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
