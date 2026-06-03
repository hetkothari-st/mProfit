/**
 * Finfactor WealthScape request / response payloads.
 *
 * Types are intentionally permissive — Finfactor's sandbox returns
 * fields with mixed casing and occasional missing keys, so we type the
 * known-good shape and accept anything extra. The full schemas live in
 * docs.finfactor.in/wealth-scape.
 */

export interface BaseIdentifier {
  uniqueIdentifier: string;
}

export interface MfInsightsRequest extends BaseIdentifier {
  filterZeroValueAccounts?: boolean;
  filterZeroValueHoldings?: boolean;
}

export interface MfLinkedAccountsRequest extends BaseIdentifier {
  filterCdslNsdl?: boolean;
  filterZeroValueAccounts?: boolean;
  filterZeroValueHoldings?: boolean;
}

export interface MfStatementRequest extends BaseIdentifier {
  txnOrder?: 'ASC' | 'DESC';
  dateRangeFrom?: string;
  dateRangeTo?: string;
  isins?: string[];
  accountIds?: string[];
  maskedFolioNos?: string[];
  filterCdslNsdl?: boolean;
}

export interface MfAnalysisRequest extends BaseIdentifier {
  filterCdslNsdl?: boolean;
  filterZeroValueAccounts?: boolean;
  filterZeroValueHoldings?: boolean;
}

export interface MfHoldingFolioRequest extends BaseIdentifier {
  filterCdslNsdl?: boolean;
  filterZeroValueAccounts?: boolean;
  filterZeroValueHoldings?: boolean;
}

// Response shape highlights — full Finfactor responses include far more
// keys, all preserved as `Record<string, unknown>` so the UI can render
// the raw JSON without the type system getting in the way.

export interface MfInsightsResponse {
  overallSummary?: {
    pan?: string;
    mobile?: number | string;
    totalHoldings?: number;
    foliosCount?: number;
    currentValue?: number;
    investedValue?: number;
    absoluteReturn?: number;
    absoluteReturnPercentage?: number;
    xirr?: number;
    dailyReturns?: number;
    dailyReturnsPercent?: number;
    [k: string]: unknown;
  };
  holdings?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface MfLinkedAccountsResponse {
  totalFiData?: number;
  totalFiDataToBeFetched?: number;
  currentValue?: number;
  costValue?: number;
  fipData?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export type MfStatementResponse = Array<Record<string, unknown>>;

export type MfAnalysisResponse = Record<string, unknown>;

export type MfHoldingFolioResponse = Record<string, unknown>;
