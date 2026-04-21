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
  // Money-dimension fields accept strings so parsers can forward the raw
  // cleaned representation from source documents through to the Decimal-based
  // ingestion path without a JS Number round-trip (§3.2, BUG-005/009).
  quantity: number | string;
  price: number | string;

  brokerage?: number | string;
  stt?: number | string;
  stampDuty?: number | string;
  exchangeCharges?: number | string;
  gst?: number | string;
  sebiCharges?: number | string;
  otherCharges?: number | string;

  broker?: string;
  orderNo?: string;
  tradeNo?: string;
  narration?: string;
  warnings?: string[];

  /**
   * Parser-supplied dedup key. Preferred path is for the parser to leave this
   * unset — the import service derives a deterministic hash from either the
   * natural key (broker+orderNo+tradeNo) or the file-bytes + row index. Only
   * set this when the source document carries a globally-unique identifier
   * that neither of those capture (e.g. a CAS folio/transaction-id pair).
   */
  sourceHash?: string;
}

export interface ParserResult {
  broker?: string;
  /**
   * Adapter identity for every row this parser emits. The import service
   * stamps these onto each Transaction (§3.4) so we can tell a re-parse
   * under a new format version apart from a historical row — critical when
   * a broker silently changes their PDF layout. Versioned as `<id>.v<N>`;
   * bump the version when the *extraction* changes, not when the source
   * document's boilerplate shifts.
   */
  adapter?: string;
  adapterVer?: string;
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
