import type { AssetClass, Exchange, TransactionType } from './enums.js';
import type { Money, Quantity } from '../decimal.js';

// Money-dimension fields are serialized as strings at the API boundary per
// §3.2 — IEEE-754 must never touch monetary values in transit. Consumers
// should `toDecimal` before arithmetic and `formatINR` (string-tolerant)
// for display.
export interface TransactionDTO {
  id: string;
  portfolioId: string;
  assetClass: AssetClass;
  transactionType: TransactionType;
  stockId: string | null;
  fundId: string | null;
  assetName: string | null;
  symbol: string | null;
  schemeCode: string | null;
  amcName: string | null;
  isin: string | null;
  exchange: Exchange | null;
  tradeDate: string;
  settlementDate: string | null;
  quantity: Quantity;
  price: Money;
  grossAmount: Money;
  brokerage: Money;
  stt: Money;
  stampDuty: Money;
  exchangeCharges: Money;
  gst: Money;
  sebiCharges: Money;
  otherCharges: Money;
  netAmount: Money;
  strikePrice: Money | null;
  expiryDate: string | null;
  optionType: 'CALL' | 'PUT' | null;
  lotSize: number | null;
  maturityDate: string | null;
  interestRate: string | null;
  interestFrequency: string | null;
  broker: string | null;
  orderNo: string | null;
  tradeNo: string | null;
  narration: string | null;
  photos: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionRequest {
  portfolioId: string;
  transactionType: TransactionType;
  assetClass: AssetClass;
  stockSymbol?: string;
  stockName?: string;
  exchange?: Exchange;
  schemeCode?: string;
  schemeName?: string;
  amcName?: string;
  assetName?: string;
  isin?: string;
  tradeDate: string;
  settlementDate?: string;
  quantity: number | string;
  price: number | string;
  brokerage?: number | string;
  stt?: number | string;
  stampDuty?: number | string;
  exchangeCharges?: number | string;
  gst?: number | string;
  sebiCharges?: number | string;
  otherCharges?: number | string;
  strikePrice?: number | string;
  expiryDate?: string;
  optionType?: 'CALL' | 'PUT';
  lotSize?: number;
  maturityDate?: string;
  interestRate?: number | string;
  interestFrequency?: string;
  broker?: string;
  orderNo?: string;
  tradeNo?: string;
  narration?: string;
}

export type UpdateTransactionRequest = Partial<CreateTransactionRequest>;

export interface TransactionListResponse {
  items: TransactionDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AssetSearchHit {
  kind: 'STOCK' | 'MUTUAL_FUND';
  id: string | null;
  symbol: string | null;
  name: string;
  exchange?: Exchange | null;
  schemeCode?: string | null;
  amcName?: string | null;
  isin?: string | null;
  source: 'LOCAL' | 'YAHOO';
}

export interface LiveQuote {
  symbol: string;
  name: string | null;
  price: Money;
  previousClose: Money | null;
  dayChange: Money | null;
  // percentage is dimensionless — fine as a number for display.
  dayChangePct: number | null;
  currency: string;
  exchange: string;
}
