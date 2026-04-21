import { api } from './client';
import type {
  ApiResponse,
  CreatePortfolioRequest,
  HoldingRow,
  Portfolio,
  PortfolioSummary,
  UpdatePortfolioRequest,
  AssetAllocationSlice,
  HistoricalValuationPoint,
  CashFlowEntry,
} from '@portfolioos/shared';

export interface PortfolioListItem extends Portfolio {
  holdingCount: number;
  transactionCount: number;
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const portfoliosApi = {
  async list(): Promise<PortfolioListItem[]> {
    const { data } = await api.get<ApiResponse<PortfolioListItem[]>>('/api/portfolios');
    return unwrap(data);
  },
  async get(id: string): Promise<Portfolio> {
    const { data } = await api.get<ApiResponse<Portfolio>>(`/api/portfolios/${id}`);
    return unwrap(data);
  },
  async create(payload: CreatePortfolioRequest): Promise<Portfolio> {
    const { data } = await api.post<ApiResponse<Portfolio>>('/api/portfolios', payload);
    return unwrap(data);
  },
  async update(id: string, payload: UpdatePortfolioRequest): Promise<Portfolio> {
    const { data } = await api.patch<ApiResponse<Portfolio>>(`/api/portfolios/${id}`, payload);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/portfolios/${id}`);
  },
  async summary(id: string): Promise<PortfolioSummary> {
    const { data } = await api.get<ApiResponse<PortfolioSummary>>(
      `/api/portfolios/${id}/summary`,
    );
    return unwrap(data);
  },
  async holdings(id: string): Promise<HoldingRow[]> {
    const { data } = await api.get<ApiResponse<HoldingRow[]>>(`/api/portfolios/${id}/holdings`);
    return unwrap(data);
  },
  async allocation(id: string): Promise<AssetAllocationSlice[]> {
    const { data } = await api.get<ApiResponse<AssetAllocationSlice[]>>(
      `/api/portfolios/${id}/asset-allocation`,
    );
    return unwrap(data);
  },
  async historicalValuation(id: string): Promise<HistoricalValuationPoint[]> {
    const { data } = await api.get<ApiResponse<HistoricalValuationPoint[]>>(
      `/api/portfolios/${id}/historical-valuation`,
    );
    return unwrap(data);
  },
  async cashFlows(id: string): Promise<CashFlowEntry[]> {
    const { data } = await api.get<ApiResponse<CashFlowEntry[]>>(
      `/api/portfolios/${id}/cash-flows`,
    );
    return unwrap(data);
  },
};
