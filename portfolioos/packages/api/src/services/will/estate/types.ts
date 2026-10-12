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
