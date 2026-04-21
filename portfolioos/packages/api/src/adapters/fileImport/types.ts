import type { AssetClass, Exchange, TransactionType } from '@prisma/client';
import type { Adapter, CanonicalEvent, ParseResult } from '../types.js';

export interface FileImportInput {
  userId: string;
  portfolioId: string | null;
  filePath: string;
  fileName: string;
}

/**
 * CanonicalEvent specialization for file-imported trades. The typed
 * `metadata` block carries everything Transaction needs that the generic
 * CanonicalEvent shape doesn't express (assetClass subdivision,
 * transactionType variants beyond BUY/SELL, charges, broker natural key).
 *
 * Projection reads these and maps back to CreateTransactionInput
 * (see fileImport/projection.ts).
 */
export interface TransactionEvent extends CanonicalEvent {
  metadata: TransactionEventMetadata;
}

export interface TransactionEventMetadata extends Record<string, unknown> {
  assetClass: AssetClass;
  transactionType: TransactionType;
  exchange?: Exchange;
  schemeCode?: string;
  schemeName?: string;
  amcName?: string;
  folioNumber?: string;

  brokerage?: string;
  stt?: string;
  stampDuty?: string;
  exchangeCharges?: string;
  gst?: string;
  sebiCharges?: string;
  otherCharges?: string;

  broker?: string;
  orderNo?: string;
  tradeNo?: string;
  narration?: string;
  settlementDate?: string;
}

export type FileImportAdapter = Adapter<FileImportInput, TransactionEvent>;
export type FileImportParseResult = ParseResult<TransactionEvent>;
