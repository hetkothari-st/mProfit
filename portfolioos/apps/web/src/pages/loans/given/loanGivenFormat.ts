import type { LoanGivenEntryKind, Relationship } from '@/api/loansGiven.api';

import { formatDateOnly } from '@everypaisa/shared';
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDateOnly(iso);
}

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  FRIEND: 'Friend',
  FAMILY: 'Family',
  COLLEAGUE: 'Colleague',
  BUSINESS: 'Business',
  OTHER: 'Other',
};

export function relationshipLabel(r: Relationship | null): string | null {
  return r ? RELATIONSHIP_LABELS[r] : null;
}

export const ENTRY_KIND_LABELS: Record<LoanGivenEntryKind, string> = {
  REPAYMENT: 'Repayment received',
  INTEREST_RECEIVED: 'Interest received',
  ADDITIONAL_LENT: 'Lent more',
  WAIVER: 'Forgiven',
};
