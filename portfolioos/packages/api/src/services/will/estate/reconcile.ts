import { WILL_MANUAL_ITEM_PREFIX, type WillAssetItem } from '@everypaisa/shared';
import type { EstateCandidate } from './types.js';

export function candidateToItem(c: EstateCandidate): WillAssetItem {
  return { ...c, userEdited: false };
}

export function candidatesToItems(cs: readonly EstateCandidate[]): WillAssetItem[] {
  return cs.map(candidateToItem);
}

/**
 * Merge a fresh fetch into the draft's list without losing the user's work:
 *  - CONFIRMED / EXCLUDED stay as the user left them;
 *  - value and ownership the user edited (`userEdited`) are kept;
 *  - an item that vanished is kept as STALE, so gifts naming it stay valid;
 *  - a STALE item that reappears takes the adapter's suggestion;
 *  - manual items are never touched.
 */
export function reconcileEstate(
  existing: readonly WillAssetItem[],
  candidates: readonly EstateCandidate[],
): WillAssetItem[] {
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
    out.push({
      ...prev,
      side: c.side,
      kind: c.kind,
      label: c.label,
      ref: c.ref,
      note: c.note,
      value: prev.userEdited ? prev.value : c.value,
      valueAsOf: prev.userEdited ? prev.valueAsOf : c.valueAsOf,
      ownership: prev.userEdited ? prev.ownership : c.ownership,
      review: prev.review === 'STALE' ? c.review : prev.review,
    });
  }
  for (const prev of existing) {
    if (seen.has(prev.sourceKey)) continue;
    if (prev.sourceKey.startsWith(WILL_MANUAL_ITEM_PREFIX) || prev.review === 'EXCLUDED') {
      out.push(prev);
      continue;
    }
    out.push({ ...prev, review: 'STALE' });
  }
  return out;
}
