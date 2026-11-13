<<<<<<< HEAD
import { isInformationalAlert } from '@everypaisa/shared';

// Loan-check alerts are news, not deadlines (rule shared with the API).
export { INFORMATIONAL_ALERT_TYPES, isInformationalAlert } from '@everypaisa/shared';

/**
 * Where an alert opens: `/loans/<loanId>` for a loan-check alert (`/loans` when the id is missing), `/will`
 * for a will review reminder, the fund page for a fund rating change; null for every other type.
 */
export function alertLink(type: string, metadata: unknown): string | null {
  if (type === 'WILL_REVIEW_DUE') return '/will';
  if (type === 'ADVICE') return '/act-on-it';
  if (type === 'MF_RATING_CHANGE') {
    const code = typeof metadata === 'object' && metadata !== null ? (metadata as { schemeCode?: unknown }).schemeCode : undefined;
    return typeof code === 'string' && code !== '' ? `/mutual-funds/${encodeURIComponent(code)}` : '/mutual-funds/analysis';
  }
=======
/**
 * Loan-check alerts (EMI calculator spec s6.3) are news, not deadlines: their trigger date is the day the
 * check ran, so they are never "overdue". They link to the loan they are about (metadata.loanId).
 */
export const INFORMATIONAL_ALERT_TYPES: ReadonlySet<string> = new Set(['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE']);

export function isInformationalAlert(type: string): boolean {
  return INFORMATIONAL_ALERT_TYPES.has(type);
}

/** `/loans/<loanId>` for a loan-check alert (`/loans` when the id is missing); null for every other type. */
export function alertLink(type: string, metadata: unknown): string | null {
>>>>>>> feat/emi-loan-checks
  if (!isInformationalAlert(type)) return null;
  const loanId = typeof metadata === 'object' && metadata !== null ? (metadata as { loanId?: unknown }).loanId : undefined;
  return typeof loanId === 'string' && loanId !== '' ? `/loans/${encodeURIComponent(loanId)}` : '/loans';
}
