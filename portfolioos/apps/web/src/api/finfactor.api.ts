/**
 * Finfactor (Wealthscape / Account Aggregator) — client wrapper.
 *
 * The backend proxies every Finfactor call so the channel-token never
 * leaves the API container. Each method posts to
 * /api/integrations/finfactor/* and returns the raw upstream JSON so the
 * UI can render it as-is for the sandbox panel.
 */

import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export interface FinfactorStatus {
  configured: boolean;
  demoMode: boolean;
  baseUrl: string;
}

export interface MfInsightsBody {
  uniqueIdentifier: string;
  filterZeroValueAccounts?: boolean;
  filterZeroValueHoldings?: boolean;
}

export interface MfLinkedAccountsBody {
  uniqueIdentifier: string;
  filterCdslNsdl?: boolean;
  filterZeroValueAccounts?: boolean;
  filterZeroValueHoldings?: boolean;
}

export interface MfStatementBody {
  uniqueIdentifier: string;
  txnOrder?: 'ASC' | 'DESC';
  dateRangeFrom?: string;
  dateRangeTo?: string;
  isins?: string[];
  accountIds?: string[];
  maskedFolioNos?: string[];
  filterCdslNsdl?: boolean;
}

export interface BenchmarkTrailingBody {
  benchmarks: string;
  from: string;
  ranges: string;
}

export interface BenchmarkPointToPointBody {
  benchmarks: string;
  point_1: string;
  point_2: string;
}

export interface ConsentInitiateBody {
  fiTypes?: string[];
  fipIds?: string[];
  purposeCode?: string;
  purposeText?: string;
  durationDays?: number;
  customerIdentifier?: string;
}

export interface AaConsentDTO {
  id: string;
  userId: string;
  provider: string;
  consentHandle: string | null;
  consentId: string | null;
  status: string;
  fiTypes: string[];
  fipIds: string[];
  purposeCode: string | null;
  purposeText: string | null;
  redirectUrl: string | null;
  initiatedAt: string;
  approvedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastSyncedAt: string | null;
}

export interface ConsentInitiateResult {
  consent: AaConsentDTO;
  upstream: unknown;
  demoMode: boolean;
}

export interface SyncBody {
  uniqueIdentifier: string;
  portfolioId?: string;
}

export interface SyncResult {
  insightsHoldings: number;
  statementRows: number;
  fundsUpserted: number;
  transactionsCreated: number;
  transactionsSkipped: number;
  portfolioId: string;
  portfolioName: string;
  durationMs: number;
}

export const finfactorApi = {
  async status(): Promise<FinfactorStatus> {
    const { data } = await api.get<ApiResponse<FinfactorStatus>>('/api/integrations/finfactor/status');
    return unwrap(data);
  },
  async mfInsights(body: MfInsightsBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/integrations/finfactor/mf/insights', body);
    return unwrap(data);
  },
  async mfInsightsNoPii(body: MfInsightsBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/integrations/finfactor/mf/insights-no-pii', body);
    return unwrap(data);
  },
  async mfLinkedAccounts(body: MfLinkedAccountsBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/integrations/finfactor/mf/linked-accounts', body);
    return unwrap(data);
  },
  async mfLinkedAccountsHoldingFolio(body: MfLinkedAccountsBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/integrations/finfactor/mf/linked-accounts/holding-folio', body);
    return unwrap(data);
  },
  async mfStatement(body: MfStatementBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/integrations/finfactor/mf/statement', body);
    return unwrap(data);
  },
  async mfAnalysis(body: MfLinkedAccountsBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/integrations/finfactor/mf/analysis', body);
    return unwrap(data);
  },
  async mfHoldingByIsin(isin: string, body: MfLinkedAccountsBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>(
      `/api/integrations/finfactor/mf/holdings/${encodeURIComponent(isin)}`,
      body,
    );
    return unwrap(data);
  },
  async benchmarkTrailing(body: BenchmarkTrailingBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>(
      '/api/integrations/finfactor/mf/benchmark/trailing',
      body,
    );
    return unwrap(data);
  },
  async benchmarkPointToPoint(body: BenchmarkPointToPointBody): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>(
      '/api/integrations/finfactor/mf/benchmark/point-to-point',
      body,
    );
    return unwrap(data);
  },
  async consentInitiate(body: ConsentInitiateBody): Promise<ConsentInitiateResult> {
    const { data } = await api.post<ApiResponse<ConsentInitiateResult>>(
      '/api/integrations/finfactor/consent/initiate',
      body,
    );
    return unwrap(data);
  },
  async listConsents(): Promise<AaConsentDTO[]> {
    const { data } = await api.get<ApiResponse<AaConsentDTO[]>>(
      '/api/integrations/finfactor/consent',
    );
    return unwrap(data);
  },
  async revokeConsent(handle: string): Promise<AaConsentDTO> {
    const { data } = await api.post<ApiResponse<AaConsentDTO>>(
      `/api/integrations/finfactor/consent/${encodeURIComponent(handle)}/revoke`,
    );
    return unwrap(data);
  },
  async approveConsentDemo(handle: string): Promise<AaConsentDTO> {
    const { data } = await api.post<ApiResponse<AaConsentDTO>>(
      `/api/integrations/finfactor/consent/${encodeURIComponent(handle)}/approve-demo`,
    );
    return unwrap(data);
  },
  async syncMutualFunds(body: SyncBody): Promise<SyncResult> {
    const { data } = await api.post<ApiResponse<SyncResult>>(
      '/api/integrations/finfactor/sync/mf',
      body,
    );
    return unwrap(data);
  },
};
