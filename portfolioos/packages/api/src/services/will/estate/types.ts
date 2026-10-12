import type { WillAssetItem } from '@everypaisa/shared';

export interface EstateContext {
  userId: string;
  /** Indian calendar date, YYYY-MM-DD. */
  today: string;
}

/** What an adapter proposes. Review states the user owns (STALE, edits) are applied by reconcile. */
export type EstateCandidate = Omit<WillAssetItem, 'userEdited' | 'review'> & {
  review: 'CONFIRMED' | 'NEEDS_REVIEW' | 'EXCLUDED';
};

export interface EstateAdapter {
  id: string;
  version: string;
  collect(ctx: EstateContext): Promise<EstateCandidate[]>;
}

export const SOLE: EstateCandidate['ownership'] = { type: 'SOLE', sharePct: '100' };

/** Labels and refs are capped to the payload schema's limits. */
export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/** The sourceKey prefix each default adapter writes. */
export const ADAPTER_SOURCE_PREFIXES: Readonly<Record<string, string>> = {
  holdings: 'holdings:',
  bankAccounts: 'bank:',
  pfAccounts: 'pf:',
  ownedProperty: 'ownedProperty:',
  rentalProperty: 'rentalProperty:',
  vehicles: 'vehicle:',
  insurance: 'insurance:',
  loansGiven: 'loanGiven:',
  loans: 'loan:',
  creditCards: 'card:',
};

/** True when the item came from one of the given adapters (ids without a known prefix match nothing). */
export function sourceKeyFromAdapters(sourceKey: string, adapterIds: readonly string[]): boolean {
  return adapterIds.some((id) => {
    const prefix = ADAPTER_SOURCE_PREFIXES[id];
    return prefix !== undefined && sourceKey.startsWith(prefix);
  });
}

/** Entry in EstateCollection.failed when more candidates were found than fit and the rest were dropped. */
export const ESTATE_TRUNCATED = 'truncated';
