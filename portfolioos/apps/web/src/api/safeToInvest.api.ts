import { api } from './client';
import type { ApiResponse, SafeToInvestCreditView, SafeToInvestSummary } from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

/** Every write answers with the fresh summary, so callers just setQueryData. */
export const safeToInvestApi = {
  async summary(): Promise<SafeToInvestSummary> {
    const { data } = await api.get<ApiResponse<SafeToInvestSummary>>('/api/safe-to-invest');
    return unwrap(data);
  },
  async updatePlan(input: { topUpShare?: string; bufferOverride?: string | null }): Promise<SafeToInvestSummary> {
    const { data } = await api.put<ApiResponse<SafeToInvestSummary>>('/api/safe-to-invest/plan', input);
    return unwrap(data);
  },
  async savePlan(): Promise<SafeToInvestSummary> {
    const { data } = await api.post<ApiResponse<SafeToInvestSummary>>('/api/safe-to-invest/plan/save');
    return unwrap(data);
  },
  async setMonth(month: string, inflow: string | null): Promise<SafeToInvestSummary> {
    const { data } = await api.put<ApiResponse<SafeToInvestSummary>>(`/api/safe-to-invest/months/${month}`, { inflow });
    return unwrap(data);
  },
  async credits(month: string): Promise<SafeToInvestCreditView[]> {
    const { data } = await api.get<ApiResponse<SafeToInvestCreditView[]>>(`/api/safe-to-invest/months/${month}/credits`);
    return unwrap(data);
  },
  async decide(id: string, include: boolean | null): Promise<SafeToInvestSummary> {
    const { data } = await api.put<ApiResponse<SafeToInvestSummary>>(`/api/safe-to-invest/credits/${id}`, { include });
    return unwrap(data);
  },
};

export const SAFE_TO_INVEST_QUERY_KEY = ['safe-to-invest'] as const;
