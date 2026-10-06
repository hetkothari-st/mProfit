import type { CaClient } from '@/api/ca.api';

/** Plain helpers behind the access components, kept apart so fast refresh stays whole. */

export const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

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
