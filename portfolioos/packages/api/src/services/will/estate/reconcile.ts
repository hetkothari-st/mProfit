import { Decimal, WILL_MANUAL_ITEM_PREFIX, type WillAssetItem } from '@everypaisa/shared';
import { ESTATE_TRUNCATED, sourceKeyFromAdapters, type EstateCandidate } from './types.js';

export interface ReconcileOptions {
  /**
   * EstateCollection.failed from this fetch: existing items of an adapter that threw are left
   * exactly as they were; with ESTATE_TRUNCATED no auto item is marked STALE (it may just have been cut).
   */
  failedAdapterIds?: readonly string[];
}

function sameOwnership(a: WillAssetItem['ownership'], b: WillAssetItem['ownership']): boolean {
  return a.type === b.type && new Decimal(a.sharePct).equals(b.sharePct);
}

export function candidateToItem(c: EstateCandidate): WillAssetItem {
  return { ...c, userEdited: false };
}

export function candidatesToItems(cs: readonly EstateCandidate[]): WillAssetItem[] {
  return cs.map(candidateToItem);
}

/**
 * Merge a fresh fetch into the draft's list without losing the user's work:
 *  - CONFIRMED / EXCLUDED stay as the user left them, unless the source's
 *    ownership changed on an item the user did not edit (then NEEDS_REVIEW);
 *  - a NEEDS_REVIEW item follows the adapter's suggestion;
 *  - value and ownership the user edited (`userEdited`) are kept;
 *  - an item that vanished is kept as STALE, so gifts naming it stay valid;
 *  - a STALE item that reappears takes the adapter's suggestion;
 *  - manual items, and items of an adapter that failed this time, are never touched;
 *  - nothing goes STALE when the fetch was truncated.
 */
export function reconcileEstate(
  existing: readonly WillAssetItem[],
  candidates: readonly EstateCandidate[],
  opts: ReconcileOptions = {},
): WillAssetItem[] {
  const failed = opts.failedAdapterIds ?? [];
  const truncated = failed.includes(ESTATE_TRUNCATED);
  const byKey = new Map(existing.map((i) => [i.sourceKey, i]));
  const seen = new Set<string>();
  const out: WillAssetItem[] = [];
  for (const c of candidates) {
    seen.add(c.sourceKey);
    const prev = byKey.get(c.sourceKey);
    if (!prev) {
      out.push(candidateToItem(c));
      continue;
    }
    const ownership = prev.userEdited ? prev.ownership : c.ownership;
    let review: WillAssetItem['review'];
    if (prev.review === 'STALE' || prev.review === 'NEEDS_REVIEW') review = c.review;
    else if (!prev.userEdited && !sameOwnership(prev.ownership, c.ownership)) review = 'NEEDS_REVIEW';
    else review = prev.review;
    out.push({
      ...prev,
      side: c.side,
      kind: c.kind,
      label: c.label,
      ref: c.ref,
      note: c.note,
      value: prev.userEdited ? prev.value : c.value,
      valueAsOf: prev.userEdited ? prev.valueAsOf : c.valueAsOf,
      ownership,
      review,
    });
  }
  for (const prev of existing) {
    if (seen.has(prev.sourceKey)) continue;
    if (
      prev.sourceKey.startsWith(WILL_MANUAL_ITEM_PREFIX) ||
      prev.review === 'EXCLUDED' ||
      truncated ||
      sourceKeyFromAdapters(prev.sourceKey, failed)
    ) {
      out.push(prev);
      continue;
    }
    out.push({ ...prev, review: 'STALE' });
  }
  return out;
}
