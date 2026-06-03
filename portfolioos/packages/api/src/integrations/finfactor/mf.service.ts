/**
 * Mutual Fund insights via Finfactor (Account Aggregator).
 *
 * Each function is a thin wrapper over the documented FIU endpoint. The
 * return value is whatever Finfactor sends back — we forward it to the
 * client verbatim so the UI can show the raw sandbox data without
 * coupling our types to Finfactor's evolving schema.
 *
 * Demo mode: when FINFACTOR_DEMO_MODE=true, each function returns the
 * documented sample payload from demo.ts instead of hitting Finfactor.
 * Useful when the channel token hasn't been issued yet but the panel
 * needs to render real-looking data for a screen-share.
 */

import { finfactorPost } from './client.js';
import {
  DEMO_BENCHMARK_POINT_TO_POINT,
  DEMO_BENCHMARK_TRAILING,
  DEMO_MF_ANALYSIS,
  DEMO_MF_HOLDING_BY_ISIN,
  DEMO_MF_INSIGHTS,
  DEMO_MF_INSIGHTS_NO_PII,
  DEMO_MF_LINKED_ACCOUNTS,
  DEMO_MF_LINKED_ACCOUNTS_HOLDING_FOLIO,
  DEMO_MF_STATEMENT,
  isFinfactorDemoMode,
} from './demo.js';
import type {
  BenchmarkPointToPointRequest,
  BenchmarkPointToPointResponse,
  BenchmarkTrailingRequest,
  BenchmarkTrailingResponse,
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
  if (isFinfactorDemoMode()) return Promise.resolve(DEMO_MF_INSIGHTS as MfInsightsResponse);
  return finfactorPost<MfInsightsRequest, MfInsightsResponse>(
    '/pfm/api/v2/mutual-fund/insights',
    body,
  );
}

export function fetchMfInsightsNoPii(body: MfInsightsRequest): Promise<MfInsightsResponse> {
  if (isFinfactorDemoMode()) return Promise.resolve(DEMO_MF_INSIGHTS_NO_PII as MfInsightsResponse);
  return finfactorPost<MfInsightsRequest, MfInsightsResponse>(
    '/pfm/api/v2/mutual-fund/insights-no-pii',
    body,
  );
}

export function fetchMfLinkedAccounts(
  body: MfLinkedAccountsRequest,
): Promise<MfLinkedAccountsResponse> {
  if (isFinfactorDemoMode()) return Promise.resolve(DEMO_MF_LINKED_ACCOUNTS as MfLinkedAccountsResponse);
  return finfactorPost<MfLinkedAccountsRequest, MfLinkedAccountsResponse>(
    '/pfm/api/v2/mutual-fund/user-linked-accounts',
    body,
  );
}

export function fetchMfLinkedAccountsHoldingFolio(
  body: MfLinkedAccountsRequest,
): Promise<MfLinkedAccountsResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_MF_LINKED_ACCOUNTS_HOLDING_FOLIO as MfLinkedAccountsResponse);
  }
  return finfactorPost<MfLinkedAccountsRequest, MfLinkedAccountsResponse>(
    '/pfm/api/v2/mutual-fund/user-linked-accounts/holding-folio',
    body,
  );
}

export function fetchMfStatement(body: MfStatementRequest): Promise<MfStatementResponse> {
  if (isFinfactorDemoMode()) return Promise.resolve(DEMO_MF_STATEMENT as MfStatementResponse);
  return finfactorPost<MfStatementRequest, MfStatementResponse>(
    '/pfm/api/v2/mutual-fund/user-account-statement',
    body,
  );
}

export function fetchMfAnalysis(body: MfAnalysisRequest): Promise<MfAnalysisResponse> {
  if (isFinfactorDemoMode()) return Promise.resolve(DEMO_MF_ANALYSIS as MfAnalysisResponse);
  return finfactorPost<MfAnalysisRequest, MfAnalysisResponse>(
    '/pfm/api/v2/mutual-fund/analysis',
    body,
  );
}

export function fetchMfHoldingsByIsin(
  isin: string,
  body: MfHoldingFolioRequest,
): Promise<MfHoldingFolioResponse> {
  if (isFinfactorDemoMode()) return Promise.resolve(DEMO_MF_HOLDING_BY_ISIN as MfHoldingFolioResponse);
  return finfactorPost<MfHoldingFolioRequest, MfHoldingFolioResponse>(
    `/pfm/api/v2/mutual-fund/holdings/isins/${encodeURIComponent(isin)}/insights`,
    body,
  );
}

export function fetchBenchmarkTrailing(
  body: BenchmarkTrailingRequest,
): Promise<BenchmarkTrailingResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_BENCHMARK_TRAILING as BenchmarkTrailingResponse);
  }
  return finfactorPost<BenchmarkTrailingRequest, BenchmarkTrailingResponse>(
    '/pfm/api/v2/mutual-fund/benchmark/comparison/trailing',
    body,
  );
}

export function fetchBenchmarkPointToPoint(
  body: BenchmarkPointToPointRequest,
): Promise<BenchmarkPointToPointResponse> {
  if (isFinfactorDemoMode()) {
    return Promise.resolve(DEMO_BENCHMARK_POINT_TO_POINT as BenchmarkPointToPointResponse);
  }
  return finfactorPost<BenchmarkPointToPointRequest, BenchmarkPointToPointResponse>(
    '/pfm/api/v2/mutual-fund/benchmark/comparison/point-to-point',
    body,
  );
}
