import { api } from './client';
import type { ApiResponse, ValuationQuoteResult } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface TrimDetail {
  trim: string;
  baseMsrp: string | null;
  fuelType: string | null;
  bodyType: string | null;
  seatingCap: number | null;
  displacement: number | null;
  category: string | null;
}

export interface QuoteInput {
  category?: string;
  make: string;
  model: string;
  year: number;
  trim: string;
  kms: number;
  txnType: 'BUY' | 'SELL';
  partyType: 'INDIVIDUAL' | 'DEALER';
}

export interface AutoValuationResult {
  quote: ValuationQuoteResult;
  resolved: {
    make: string;
    model: string;
    year: number;
    trim: string;
    category: string | null;
  };
}

export interface SaveValuationInput {
  cacheKey: string;
  sliderSnapshot: Record<string, string>;
  adjustedPrice: string;
  txnType: 'BUY' | 'SELL';
  partyType: 'INDIVIDUAL' | 'DEALER';
}

export const catalogApi = {
  async categories(): Promise<string[]> {
    const { data } = await api.get<ApiResponse<string[]>>('/api/catalog/categories');
    return unwrap(data);
  },
  async makes(category?: string): Promise<string[]> {
    const { data } = await api.get<ApiResponse<string[]>>('/api/catalog/makes', { params: { category } });
    return unwrap(data);
  },
  async models(make: string): Promise<string[]> {
    const { data } = await api.get<ApiResponse<string[]>>('/api/catalog/models', { params: { make } });
    return unwrap(data);
  },
  async years(make: string, model: string): Promise<number[]> {
    const { data } = await api.get<ApiResponse<number[]>>('/api/catalog/years', { params: { make, model } });
    return unwrap(data);
  },
  async trims(make: string, model: string, year: number): Promise<TrimDetail[]> {
    const { data } = await api.get<ApiResponse<TrimDetail[]>>('/api/catalog/trims', { params: { make, model, year } });
    return unwrap(data);
  },
};

export const valuationApi = {
  async quote(input: QuoteInput): Promise<ValuationQuoteResult> {
    const { data } = await api.post<ApiResponse<ValuationQuoteResult>>('/api/valuations/quote', input);
    return unwrap(data);
  },
  async autoValuate(vehicleId: string, txnType: 'BUY' | 'SELL' = 'SELL', partyType: 'INDIVIDUAL' | 'DEALER' = 'INDIVIDUAL'): Promise<AutoValuationResult> {
    const { data } = await api.get<ApiResponse<AutoValuationResult>>(
      `/api/valuations/vehicles/${vehicleId}/auto`,
      { params: { txnType, partyType } },
    );
    return unwrap(data);
  },
  async save(vehicleId: string, input: SaveValuationInput): Promise<{ log: { id: string } }> {
    const { data } = await api.post<ApiResponse<{ log: { id: string } }>>(
      `/api/valuations/vehicles/${vehicleId}/save`,
      input,
    );
    return unwrap(data);
  },
};
