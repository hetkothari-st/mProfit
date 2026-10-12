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

/**
 * Note set by reconcile itself when a source's ownership changed under an unedited item.
 * It marks the NEEDS_REVIEW as reconcile's own flag, so it stays until the user acts.
 */
export const OWNERSHIP_CHANGED_NOTE = 'The ownership recorded for this has changed since you last reviewed it - check it.';

/**
 * Review state and note for an item seen again. The note doubles as the reason for a
 * suggestion, so an adapter suggestion is re-applied only when its reason is new.
 */
function nextReview(prev: WillAssetItem, c: EstateCandidate): Pick<WillAssetItem, 'review' | 'note'> {
  const ownershipChanged = !prev.userEdited && !sameOwnership(prev.ownership, c.ownership);
  switch (prev.review) {
    case 'STALE':
      return { review: c.review, note: c.note };
    case 'EXCLUDED':
      // The user's (or an accepted) exclusion wins; the new ownership is still adopted by the caller.
      return { review: 'EXCLUDED', note: c.note };
    case 'NEEDS_REVIEW':
      // Reconcile's own flag is sticky until the user confirms, excludes or edits (userEdited).
      if (ownershipChanged || (prev.note === OWNERSHIP_CHANGED_NOTE && !prev.userEdited)) {
        return { review: 'NEEDS_REVIEW', note: OWNERSHIP_CHANGED_NOTE };
      }
      return { review: c.review, note: c.note };
    case 'CONFIRMED':
      if (ownershipChanged) return { review: 'NEEDS_REVIEW', note: OWNERSHIP_CHANGED_NOTE };
      // A new adapter exclusion (for example CASH once a bank account exists) applies to an
      // unedited item; one the user already saw and overrode (same note) does not.
      if (c.review === 'EXCLUDED' && !prev.userEdited && prev.note !== c.note) {
        return { review: 'EXCLUDED', note: c.note };
      }
      return { review: 'CONFIRMED', note: c.note };
  }
}

export function candidateToItem(c: EstateCandidate): WillAssetItem {
  return { ...c, userEdited: false };
}

export function candidatesToItems(cs: readonly EstateCandidate[]): WillAssetItem[] {
  return cs.map(candidateToItem);
}

/**
 * Merge a fresh fetch into the draft's list without losing the user's work:
 *  - EXCLUDED stays EXCLUDED (new ownership is still adopted);
 *  - CONFIRMED stays, unless the source's ownership changed on an item the user did
 *    not edit (then NEEDS_REVIEW with OWNERSHIP_CHANGED_NOTE, sticky until the user
 *    acts) or the adapter newly excludes an unedited item (then EXCLUDED);
 *  - an adapter's NEEDS_REVIEW follows the adapter's latest suggestion;
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
    const { review, note } = nextReview(prev, c);
    out.push({
      ...prev,
      side: c.side,
      kind: c.kind,
      label: c.label,
      ref: c.ref,
      note,
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
