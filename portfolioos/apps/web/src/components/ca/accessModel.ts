import type { CaClient } from '@/api/ca.api';

import { formatDateIST } from '@everypaisa/shared';
/** Plain helpers behind the access components, kept apart so fast refresh stays whole. */

export const fmtDate = (iso: string | null): string =>
  iso
    ? formatDateIST(iso)
    : '';

/**
 * An invitation link's state in words. A link past its date is dead — the
 * server refuses to accept or resend it — so it must not read "Link expires"
 * under "Waiting to accept".
 */
export function inviteLinkStatus(
  iso: string | null,
  now: Date = new Date(),
): { expired: boolean; text: string } | null {
  if (!iso) return null;
  const expired = new Date(iso).getTime() < now.getTime();
  return { expired, text: `${expired ? 'Link expired' : 'Link expires'} ${fmtDate(iso)}` };
}

const SCOPE_FLAG_WORDS: Record<string, [string, string]> = {
  scopeAllPortfolios: ['all portfolios', 'chosen portfolios'],
  scopeAllAssetClasses: ['all asset classes', 'chosen asset classes'],
  scopeAllCategories: ['all categories', 'chosen categories'],
};

/**
 * The "Was …" line of an activity entry. New scope changes store a phrase;
 * older ones stored raw scope flags, which are put into words here rather than
 * shown as column names. Other corrections stay field by field.
 */
export function describeBefore(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value !== 'object') return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([k]) => k in SCOPE_FLAG_WORDS)) {
    const parts: string[] = [];
    for (const [k, v] of entries) {
      if (k in SCOPE_FLAG_WORDS) parts.push(SCOPE_FLAG_WORDS[k]![v ? 0 : 1]);
    }
    const from = (value as { accessFrom?: unknown }).accessFrom;
    const until = (value as { accessUntil?: unknown }).accessUntil;
    if (typeof from === 'string') parts.push(`access from ${fmtDate(from)}`);
    parts.push(typeof until === 'string' ? `access until ${fmtDate(until)}` : 'no end date');
    return parts.join(', ');
  }
  const parts = entries
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k} ${String(v)}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

export type EditMode = 'VIEW' | 'PARTIAL' | 'FULL';

export function editModeOfClient(c: CaClient): EditMode {
  const flags = [c.canEditBooks, c.canEditTransactions, c.canEditImports, c.canEditFmv];
  if (flags.every(Boolean)) return 'FULL';
  if (flags.some(Boolean)) return 'PARTIAL';
  return 'VIEW';
}

/** What a professional may do, in the words the account holder's page uses. */
export const EDIT_MODE_LABEL: Record<EditMode, string> = {
  FULL: 'Keep the books',
  PARTIAL: 'Make some changes',
  VIEW: 'View only',
};
