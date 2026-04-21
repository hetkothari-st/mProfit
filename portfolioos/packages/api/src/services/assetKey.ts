import { createHash } from 'node:crypto';
import type { Transaction } from '@prisma/client';

/**
 * Canonical identity of a holding's underlying instrument — the key Phase 4.5+
 * code uses to group Transactions into a HoldingProjection row. Mirrors the
 * precedence baked into migration `20260421120000_phase_4_5_hardening`
 * (§4.10 step 2), so that in-process writes produce the same key the DB
 * backfill produced for existing rows. Changing the precedence here without
 * a reconciling migration will silently split or merge holdings.
 *
 * Precedence:
 *   1. stockId  → "stock:<id>"
 *   2. fundId   → "fund:<id>"
 *   3. isin     → "isin:<ISIN>"  (non-empty)
 *   4. fallback → "name:<sha256(lower(trim(assetName||'')))>"
 *
 * The final fallback guarantees a non-null key for assets that live entirely
 * in the Transaction row (FDs, bonds, NPS, gold, insurance, etc.) — the class
 * of asset that made BUG-001 possible in the first place.
 */
export interface AssetKeyRefs {
  stockId?: string | null;
  fundId?: string | null;
  isin?: string | null;
  assetName?: string | null;
}

export function computeAssetKey(refs: AssetKeyRefs): string {
  if (refs.stockId) return `stock:${refs.stockId}`;
  if (refs.fundId) return `fund:${refs.fundId}`;
  if (refs.isin && refs.isin.trim() !== '') return `isin:${refs.isin}`;
  const normalized = (refs.assetName ?? '').trim().toLowerCase();
  return `name:${createHash('sha256').update(normalized).digest('hex')}`;
}

export function assetKeyFromTransaction(tx: Pick<Transaction, 'stockId' | 'fundId' | 'isin' | 'assetName'>): string {
  return computeAssetKey({
    stockId: tx.stockId,
    fundId: tx.fundId,
    isin: tx.isin,
    assetName: tx.assetName,
  });
}
