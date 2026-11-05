import type { Decimal } from 'decimal.js';

/**
 * The one shape every spending source produces. Personal Inflation and
 * Safe-to-Invest read only these rows (via SpendTxn), never a source's raw
 * data, so adding a source (statements, Finvu) changes nothing downstream.
 */

export type SpendSourceKind = 'canonical_event' | 'statement' | 'manual' | 'finvu';
export type SpendDirection = 'DEBIT' | 'CREDIT';
export type SpendMode = 'UPI' | 'CARD' | 'NEFT' | 'IMPS' | 'ATM' | 'ECS' | 'CHEQUE' | 'OTHER';
export type SpendExcludeReason = 'self_transfer';

export interface NormalisedTxn {
  source: SpendSourceKind;
  sourceAdapter: string;
  /** Stable id within the source; re-syncing the same row updates it in place. */
  sourceRef: string;
  /** Last 4 digits of the account or card, when the source knows them. */
  accountKey: string | null;
  /** UTC midnight of the transaction's calendar date. */
  txnDate: Date;
  /** Always positive; `direction` carries the sign. */
  amount: Decimal;
  direction: SpendDirection;
  mode: SpendMode;
  narration: string | null;
  counterparty: string | null;
  currency: string;
  /** The CanonicalEvent type the row came from (EMI_DEBIT, CARD_PURCHASE...), or null. */
  eventType: string | null;
}

/**
 * A spending source. `fetch` returns the source's complete current set of
 * rows for the user: rows it no longer returns are removed from the store,
 * so a rejected or deleted event disappears from spending too.
 */
export interface SpendSource {
  kind: SpendSourceKind;
  fetch(userId: string): Promise<NormalisedTxn[]>;
}

/**
 * When the same payment arrives from two kinds of source, the more complete
 * one is kept: a statement line (full ledger, exact narration) or a Finvu
 * record beats an email alert. Higher wins.
 */
export const SOURCE_PRIORITY: Record<SpendSourceKind, number> = {
  finvu: 4,
  statement: 3,
  canonical_event: 2,
  manual: 1,
};
