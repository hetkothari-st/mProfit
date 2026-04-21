import { api } from './client';
import type { ApiResponse, AssetSearchHit, LiveQuote } from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const assetsApi = {
  async search(q: string, kind: 'all' | 'stock' | 'mf' = 'all', limit = 15): Promise<AssetSearchHit[]> {
    const { data } = await api.get<ApiResponse<AssetSearchHit[]>>('/api/assets/search', {
      params: { q, kind, limit },
    });
    return unwrap(data);
  },
  async quote(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE'): Promise<LiveQuote> {
    const { data } = await api.get<ApiResponse<LiveQuote>>(`/api/assets/quote/${symbol}`, {
      params: { exchange },
    });
    return unwrap(data);
  },
  async refreshPortfolio(portfolioId: string): Promise<{ updated: number }> {
    const { data } = await api.post<ApiResponse<{ updated: number }>>(
      `/api/assets/portfolios/${portfolioId}/refresh-prices`,
    );
    return unwrap(data);
  },
  async refreshAll(): Promise<{ stocks: { updated: number; failed: number }; holdings: { updated: number } }> {
    const { data } = await api.post<ApiResponse<{ stocks: { updated: number; failed: number }; holdings: { updated: number } }>>(
      '/api/assets/refresh-prices',
    );
    return unwrap(data);
  },
  async amfiSync(): Promise<{ fetchedRows: number; mastersCreated: number; mastersUpdated: number; navsUpserted: number }> {
    const { data } = await api.post<ApiResponse<any>>('/api/assets/amfi/sync');
    return unwrap(data);
  },
};
