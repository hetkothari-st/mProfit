/**
 * How an alert is filed by date — shared by the API (which counts and filters
 * the whole inbox) and the Alerts page (which draws the bands), so the counts
 * on the filter chips and the rows under them are decided by one rule.
 */

/**
 * Loan-check alerts (EMI calculator spec s6.3) are news, not deadlines: their
 * trigger date is the day the check ran, so they are never "overdue".
 */
export const INFORMATIONAL_ALERT_TYPES: ReadonlySet<string> = new Set(['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE']);

export function isInformationalAlert(type: string): boolean {
  return INFORMATIONAL_ALERT_TYPES.has(type);
}

/** The Alerts page's filter chips. */
export type AlertLens = 'all' | 'overdue' | 'soon' | 'unread';
export const ALERT_LENSES: readonly AlertLens[] = ['all', 'overdue', 'soon', 'unread'];

/** "Due soon" reaches this many days ahead, today included. */
export const ALERT_SOON_DAYS = 7;

export type AlertBand = 'overdue' | 'week' | 'month' | 'later';

/** `days` = trigger date minus today, in whole calendar days. */
export function alertBandOf(days: number, informational = false): AlertBand {
  // Informational alerts are dated when they were raised: past means recent, never overdue.
  if (days < 0) return informational ? 'week' : 'overdue';
  if (days <= ALERT_SOON_DAYS) return 'week';
  if (days <= 30) return 'month';
  return 'later';
}
