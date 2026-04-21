import type { AssetClass, Exchange, TransactionType } from '@prisma/client';

/** Canonical row produced by any parser — later turned into a Transaction. */
export interface ParsedTransaction {
  assetClass: AssetClass;
  transactionType: TransactionType;

  // Stock identifiers
  symbol?: string;
  isin?: string;
  exchange?: Exchange;
  stockName?: string;

  // MF identifiers
  schemeCode?: string;
  schemeName?: string;
  amcName?: string;
  folioNumber?: string;

  // Generic
  assetName?: string;

  tradeDate: string; // YYYY-MM-DD
  settlementDate?: string;
  quantity: number;
  price: number;

  brokerage?: number;
  stt?: number;
  stampDuty?: number;
  exchangeCharges?: number;
  gst?: number;
  sebiCharges?: number;
  otherCharges?: number;

  broker?: string;
  orderNo?: string;
  tradeNo?: string;
  narration?: string;
  warnings?: string[];
}

export interface ParserResult {
  broker?: string;
  transactions: ParsedTransaction[];
  warnings: string[];
}

export interface ParserContext {
  filePath: string;
  fileName: string;
  portfolioId: string | null;
  userId: string;
}

export interface Parser {
  name: string;
  canHandle(ctx: ParserContext, sample: string | Buffer): boolean | Promise<boolean>;
  parse(ctx: ParserContext): Promise<ParserResult>;
}
