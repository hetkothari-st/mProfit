import { api } from './client';
import type {
  ApiResponse,
  CreateOwnedPropertyInput,
  MarkSoldInput,
  OwnedPropertyDTO,
  PropertyCapitalGainDTO,
  RefreshValueInput,
  UpdateOwnedPropertyInput,
} from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface RealEstateSummaryDTO {
  totalProperties: number;
  activeProperties: number;
  totalCurrentValue: string;
  totalCostBasis: string;
  unrealisedGain: string;
}

export const realEstateApi = {
  async listProperties(): Promise<OwnedPropertyDTO[]> {
    const { data } = await api.get<ApiResponse<OwnedPropertyDTO[]>>(
      '/api/real-estate/properties',
    );
    return unwrap(data);
  },
  async getProperty(id: string): Promise<OwnedPropertyDTO> {
    const { data } = await api.get<ApiResponse<OwnedPropertyDTO>>(
      `/api/real-estate/properties/${id}`,
    );
    return unwrap(data);
  },
  async createProperty(input: CreateOwnedPropertyInput): Promise<OwnedPropertyDTO> {
    const { data } = await api.post<ApiResponse<OwnedPropertyDTO>>(
      '/api/real-estate/properties',
      input,
    );
    return unwrap(data);
  },
  async updateProperty(
    id: string,
    input: UpdateOwnedPropertyInput,
  ): Promise<OwnedPropertyDTO> {
    const { data } = await api.patch<ApiResponse<OwnedPropertyDTO>>(
      `/api/real-estate/properties/${id}`,
      input,
    );
    return unwrap(data);
  },
  async deleteProperty(id: string): Promise<void> {
    await api.delete(`/api/real-estate/properties/${id}`);
  },
  async markSold(id: string, input: MarkSoldInput): Promise<OwnedPropertyDTO> {
    const { data } = await api.post<ApiResponse<OwnedPropertyDTO>>(
      `/api/real-estate/properties/${id}/mark-sold`,
      input,
    );
    return unwrap(data);
  },
  async refreshValue(id: string, input: RefreshValueInput): Promise<OwnedPropertyDTO> {
    const { data } = await api.post<ApiResponse<OwnedPropertyDTO>>(
      `/api/real-estate/properties/${id}/refresh-value`,
      input,
    );
    return unwrap(data);
  },
  async getCapitalGain(id: string): Promise<PropertyCapitalGainDTO | null> {
    const { data } = await api.get<ApiResponse<PropertyCapitalGainDTO | null>>(
      `/api/real-estate/properties/${id}/capital-gain`,
    );
    return unwrap(data);
  },
  async getSummary(): Promise<RealEstateSummaryDTO> {
    const { data } = await api.get<ApiResponse<RealEstateSummaryDTO>>(
      '/api/real-estate/summary',
    );
    return unwrap(data);
  },
};
