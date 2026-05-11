import { api } from './client';
import type { ApiResponse, AssetSearchHit, LiveQuote } from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export interface LiveCommodityPrices {
  GOLD: string | null;
  SILVER: string | null;
  /** NSE gold/silver ETF NAVs keyed by ticker (e.g. `GOLDBEES`, `SILVERBEES`). */
  etfNavs: Record<string, string>;
  fetchedAt: string;
}

export interface CryptoSearchHit {
  id: string;
  coinGeckoId: string;
  symbol: string;
  name: string;
}

export interface LiveCryptoCoin {
  coinGeckoId: string;
  symbol: string;
  name: string;
  priceInr: string | null;
  priceUsd: string | null;
  change24h: number | null;
}

export interface LiveCryptoPrices {
  coins: LiveCryptoCoin[];
  fetchedAt: string;
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
  async commoditiesLive(): Promise<LiveCommodityPrices> {
    const { data } = await api.get<ApiResponse<LiveCommodityPrices>>('/api/assets/commodities/live');
    return unwrap(data);
  },
  async cryptoSearch(q: string, limit = 15): Promise<CryptoSearchHit[]> {
    const { data } = await api.get<ApiResponse<CryptoSearchHit[]>>('/api/assets/crypto/search', {
      params: { q, limit },
    });
    return unwrap(data);
  },
  async cryptoLive(): Promise<LiveCryptoPrices> {
    const { data } = await api.get<ApiResponse<LiveCryptoPrices>>('/api/assets/crypto/live');
    return unwrap(data);
  },
};
