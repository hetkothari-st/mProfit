/**
 * Mutual Fund insights via Finfactor (Account Aggregator).
 *
 * Each function is a thin wrapper over the documented FIU endpoint. The
 * return value is whatever Finfactor sends back — we forward it to the
 * client verbatim so the UI can show the raw sandbox data without
 * coupling our types to Finfactor's evolving schema. A future commit
 * will add a mapper that projects Finfactor holdings into PortfolioOS
 * Transaction / HoldingProjection rows with proper idempotency, but for
 * the v1 sandbox loop we focus on round-trip correctness only.
 */

import { finfactorPost } from './client.js';
import type {
  MfAnalysisRequest,
  MfAnalysisResponse,
  MfHoldingFolioRequest,
  MfHoldingFolioResponse,
  MfInsightsRequest,
  MfInsightsResponse,
  MfLinkedAccountsRequest,
  MfLinkedAccountsResponse,
  MfStatementRequest,
  MfStatementResponse,
} from './types.js';

export function fetchMfInsights(body: MfInsightsRequest): Promise<MfInsightsResponse> {
  return finfactorPost<MfInsightsRequest, MfInsightsResponse>(
    '/pfm/api/v2/mutual-fund/insights',
    body,
  );
}

export function fetchMfInsightsNoPii(body: MfInsightsRequest): Promise<MfInsightsResponse> {
  return finfactorPost<MfInsightsRequest, MfInsightsResponse>(
    '/pfm/api/v2/mutual-fund/insights-no-pii',
    body,
  );
}

export function fetchMfLinkedAccounts(
  body: MfLinkedAccountsRequest,
): Promise<MfLinkedAccountsResponse> {
  return finfactorPost<MfLinkedAccountsRequest, MfLinkedAccountsResponse>(
    '/pfm/api/v2/mutual-fund/user-linked-accounts',
    body,
  );
}

export function fetchMfLinkedAccountsHoldingFolio(
  body: MfLinkedAccountsRequest,
): Promise<MfLinkedAccountsResponse> {
  return finfactorPost<MfLinkedAccountsRequest, MfLinkedAccountsResponse>(
    '/pfm/api/v2/mutual-fund/user-linked-accounts/holding-folio',
    body,
  );
}

export function fetchMfStatement(body: MfStatementRequest): Promise<MfStatementResponse> {
  return finfactorPost<MfStatementRequest, MfStatementResponse>(
    '/pfm/api/v2/mutual-fund/user-account-statement',
    body,
  );
}

export function fetchMfAnalysis(body: MfAnalysisRequest): Promise<MfAnalysisResponse> {
  return finfactorPost<MfAnalysisRequest, MfAnalysisResponse>(
    '/pfm/api/v2/mutual-fund/analysis',
    body,
  );
}

export function fetchMfHoldingsByIsin(
  isin: string,
  body: MfHoldingFolioRequest,
): Promise<MfHoldingFolioResponse> {
  return finfactorPost<MfHoldingFolioRequest, MfHoldingFolioResponse>(
    `/pfm/api/v2/mutual-fund/holdings/isins/${encodeURIComponent(isin)}/insights`,
    body,
  );
}
