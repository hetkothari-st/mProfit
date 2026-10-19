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

  // F&O fields — populated when assetClass is FUTURES or OPTIONS. The
  // import service stamps these onto the Transaction row so derivative
  // position recompute and assetKey both work.
  strikePrice?: number | string;
  expiryDate?: string; // YYYY-MM-DD
  optionType?: 'CALL' | 'PUT';
  lotSize?: number;
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
  /**
   * What the statement itself says was held at its closing date, when the
   * format prints it (CAS "Closing Unit Balance"). Stored on the ImportJob
   * and reconciled against the app's own transactions — see
   * services/integrity/statementReconciliation.service.ts.
   */
  statement?: StatementSnapshot;
  /**
   * Set by parsers that read the document with a language model: the text
   * the model was given. Every figure it returned is checked against this
   * (ingestion/verify/sourceVerification) and a transaction whose figures are
   * not in the document is not imported.
   */
  sourceText?: string;
}

export interface StatementHolding {
  isin: string;
  folio: string | null;
  schemeName: string | null;
  /** Units as printed, decimal string. */
  units: string;
}

export interface StatementSnapshot {
  /** Closing date of the statement, YYYY-MM-DD. */
  asOf: string;
  holdings: StatementHolding[];
}

export interface ParserContext {
  filePath: string;
  fileName: string;
  portfolioId: string | null;
  userId: string;
  /** User-supplied PDF passwords to try before falling back to PAN/DOB. */
  extraPasswords?: string[];
}

export interface Parser {
  name: string;
  canHandle(ctx: ParserContext, sample: string | Buffer): boolean | Promise<boolean>;
  parse(ctx: ParserContext): Promise<ParserResult>;
}
