import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface CashFlowDTO {
  id: string;
  portfolioId: string;
  portfolioName: string;
  date: string;
  type: 'INFLOW' | 'OUTFLOW';
  amount: string;
  description: string | null;
  createdAt: string;
}

export interface CashFlowListResult {
  items: CashFlowDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListCashFlowsParams {
  portfolioId?: string;
  type?: 'INFLOW' | 'OUTFLOW';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const cashflowsApi = {
  async list(params: ListCashFlowsParams = {}): Promise<CashFlowListResult> {
    const query: Record<string, string> = {};
    if (params.portfolioId) query.portfolioId = params.portfolioId;
    if (params.type) query.type = params.type;
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    if (params.page !== undefined) query.page = String(params.page);
    if (params.pageSize !== undefined) query.pageSize = String(params.pageSize);
    const { data } = await api.get<ApiResponse<CashFlowListResult>>('/api/cashflows', {
      params: query,
    });
    return unwrap(data);
  },
};
