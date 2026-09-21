/**
 * Dead-letter queue for ingestion — §3.5, §5.1 task 8.
 *
 * A row appears here when any ingestion path (file import, Gmail, future
 * adapters) failed to produce a CanonicalEvent. The import job itself may
 * still have committed other rows; this row preserves the raw payload so
 * the user can review, retry, or manually correct.
 */

export const INGESTION_RESOLVE_ACTIONS = [
  'manual_entry',
  'retry_succeeded',
  'ignored',
  'fixed_externally',
  'data_corrected',
] as const;

export type IngestionResolveAction = (typeof INGESTION_RESOLVE_ACTIONS)[number];

export interface IngestionFailureDTO {
  id: string;
  userId: string;
  sourceAdapter: string;
  adapterVersion: string;
  sourceRef: string;
  errorMessage: string;
  errorStack: string | null;
  rawPayload: unknown;
  resolvedAt: string | null;
  resolvedAction: IngestionResolveAction | null;
  createdAt: string;
}

export const INGESTION_RESOLVE_ACTION_LABELS: Record<IngestionResolveAction, string> = {
  manual_entry: 'Entered manually',
  retry_succeeded: 'Retried successfully',
  ignored: 'Ignored',
  fixed_externally: 'Fixed externally',
  data_corrected: 'Data corrected & re-uploaded',
};

/**
 * A market-feed run that failed, from `FeedRunLog`.
 *
 * Shown on the same ops page as `IngestionFailureDTO` and deliberately NOT
 * merged into it. The two are different kinds of failure and want different
 * reactions:
 *
 *   IngestionFailure — one user's document or email did not parse. It has an
 *     owner, a raw payload, and a retry button.
 *   FeedRunLog       — a market feed returned less than it should have. It
 *     belongs to nobody, there is nothing to retry by hand, and the fix is
 *     either upstream or in our parser.
 *
 * Flattening them would put a "Retry" button on a row where retrying means
 * waiting for tomorrow's AMFI file, so the page labels them apart.
 */
export interface FeedRunFailureDTO {
  id: string;
  /**
   * FEED — a market feed came back thin or threw.
   * SCORING — the nightly fund-scoring run refused to write.
   *
   * The card labels the two apart rather than merging them: a feed failure is
   * upstream or in our parser, a scoring refusal is the engine declining to
   * rank on data it does not trust, and they are fixed in different places.
   */
  kind: 'FEED' | 'SCORING';
  /** Feed key, e.g. "amfi_nav", or "fund_scoring" for a scoring run. */
  feed: string;
  /** Which check reported: "canary", "calendar_integrity". */
  check: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** "FAILED" — the list only returns failures. */
  status: string;
  rowsParsed: number | null;
  rowsImported: number | null;
  parseFailures: number | null;
  /** Rows the last successful run imported, which is what this is judged against. */
  previousImported: number | null;
  /** The canary's own sentence, or the error the run threw. */
  reason: string | null;
  /** SCORING only: the weekday gap that caused the refusal. */
  gapWeekdays: number | null;
}

/** Human labels for the feed keys the canary writes. */
export const FEED_LABELS: Record<string, string> = {
  amfi_nav: 'AMFI mutual fund NAVs',
  yahoo_stock_eod: 'Stock closing prices',
  yahoo_stock_intraday: 'Stock intraday prices (held)',
  nse_equity_universe: 'NSE equity list',
  nse_etf_universe: 'NSE ETF list',
  bse_equity_universe: 'BSE scrip master',
  nse_corporate_actions: 'NSE corporate actions',
  commodity_prices: 'Gold and silver prices',
  crypto_prices: 'Crypto prices',
  fx_rates: 'Currency rates',
  nse_fo_master: 'F&O contract master',
  nse_fo_bhavcopy: 'F&O closing prices',
  fuel_prices: 'Fuel prices',
  fund_scoring: 'Fund scoring run',
};

/** The feed's label, or the raw key when it is one we have not named. */
export function feedLabel(feed: string): string {
  return FEED_LABELS[feed] ?? feed;
}
