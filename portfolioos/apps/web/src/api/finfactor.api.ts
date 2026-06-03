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
};
