import { api } from './client';
import type { ApiResponse, InflationItemInput, PersonalInflationSummary, CpiSector } from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

/** Every write returns the fresh summary, so callers just setQueryData. */
export const personalInflationApi = {
  async summary(): Promise<PersonalInflationSummary> {
    const { data } = await api.get<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation');
    return unwrap(data);
  },
  async setProfile(input: { stateCode: number; sector: CpiSector }): Promise<PersonalInflationSummary> {
    const { data } = await api.put<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/profile', input);
    return unwrap(data);
  },
  async createItem(input: InflationItemInput): Promise<PersonalInflationSummary> {
    const { data } = await api.post<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/items', input);
    return unwrap(data);
  },
  async updateItem(id: string, input: Partial<InflationItemInput>): Promise<PersonalInflationSummary> {
    const { data } = await api.patch<ApiResponse<PersonalInflationSummary>>(`/api/personal-inflation/items/${id}`, input);
    return unwrap(data);
  },
  async deleteItem(id: string): Promise<PersonalInflationSummary> {
    const { data } = await api.delete<ApiResponse<PersonalInflationSummary>>(`/api/personal-inflation/items/${id}`);
    return unwrap(data);
  },
};

export const PERSONAL_INFLATION_QUERY_KEY = ['personal-inflation'] as const;
