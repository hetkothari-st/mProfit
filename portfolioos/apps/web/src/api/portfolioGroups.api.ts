import { api } from './client';
import type {
  ApiResponse,
  AssetAllocationSlice,
  CashFlowEntry,
  CreatePortfolioGroupRequest,
  HistoricalValuationPoint,
  HoldingRow,
  PortfolioGroup,
  PortfolioGroupListItem,
  PortfolioSummary,
  UpdatePortfolioGroupRequest,
} from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const portfolioGroupsApi = {
  async list(): Promise<PortfolioGroupListItem[]> {
    const { data } = await api.get<ApiResponse<PortfolioGroupListItem[]>>(
      '/api/portfolio-groups',
    );
    return unwrap(data);
  },
  async get(id: string): Promise<PortfolioGroup> {
    const { data } = await api.get<ApiResponse<PortfolioGroup>>(`/api/portfolio-groups/${id}`);
    return unwrap(data);
  },
  async create(payload: CreatePortfolioGroupRequest): Promise<PortfolioGroup> {
    const { data } = await api.post<ApiResponse<PortfolioGroup>>(
      '/api/portfolio-groups',
      payload,
    );
    return unwrap(data);
  },
  async update(id: string, payload: UpdatePortfolioGroupRequest): Promise<PortfolioGroup> {
    const { data } = await api.patch<ApiResponse<PortfolioGroup>>(
      `/api/portfolio-groups/${id}`,
      payload,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/portfolio-groups/${id}`);
  },
  async setMembers(id: string, memberIds: string[]): Promise<void> {
    await api.put(`/api/portfolio-groups/${id}/members`, { memberIds });
  },
  async summary(id: string): Promise<PortfolioSummary> {
    const { data } = await api.get<ApiResponse<PortfolioSummary>>(
      `/api/portfolio-groups/${id}/summary`,
    );
    return unwrap(data);
  },
  async holdings(id: string): Promise<HoldingRow[]> {
    const { data } = await api.get<ApiResponse<HoldingRow[]>>(
      `/api/portfolio-groups/${id}/holdings`,
    );
    return unwrap(data);
  },
  async allocation(id: string): Promise<AssetAllocationSlice[]> {
    const { data } = await api.get<ApiResponse<AssetAllocationSlice[]>>(
      `/api/portfolio-groups/${id}/asset-allocation`,
    );
    return unwrap(data);
  },
  async historicalValuation(id: string, days = 365): Promise<HistoricalValuationPoint[]> {
    const { data } = await api.get<ApiResponse<HistoricalValuationPoint[]>>(
      `/api/portfolio-groups/${id}/historical-valuation?days=${days}`,
    );
    return unwrap(data);
  },
  async cashFlows(id: string): Promise<CashFlowEntry[]> {
    const { data } = await api.get<ApiResponse<CashFlowEntry[]>>(
      `/api/portfolio-groups/${id}/cash-flows`,
    );
    return unwrap(data);
  },
};
