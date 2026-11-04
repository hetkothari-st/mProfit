import { isInformationalAlert } from '@everypaisa/shared';

// Loan-check alerts are news, not deadlines (rule shared with the API).
export { INFORMATIONAL_ALERT_TYPES, isInformationalAlert } from '@everypaisa/shared';

/**
 * Where an alert opens: `/loans/<loanId>` for a loan-check alert (`/loans` when the id is missing), `/will`
 * for a will review reminder; null for every other type.
 */
export function alertLink(type: string, metadata: unknown): string | null {
  if (type === 'WILL_REVIEW_DUE') return '/will';
  if (!isInformationalAlert(type)) return null;
  const loanId = typeof metadata === 'object' && metadata !== null ? (metadata as { loanId?: unknown }).loanId : undefined;
  return typeof loanId === 'string' && loanId !== '' ? `/loans/${encodeURIComponent(loanId)}` : '/loans';
}
