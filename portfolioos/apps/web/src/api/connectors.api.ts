import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface BrokerAccountDTO {
  id: string;
  provider: string;
  label: string | null;
  publicUserId: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  portfolioId: string | null;
  createdAt: string;
}

export const connectorsApi = {
  async list(): Promise<BrokerAccountDTO[]> {
    const { data } = await api.get<ApiResponse<BrokerAccountDTO[]>>('/api/connectors');
    return unwrap(data);
  },
  async kiteLoginUrl(): Promise<{ url: string }> {
    const { data } = await api.get<ApiResponse<{ url: string }>>('/api/connectors/kite/login-url');
    return unwrap(data);
  },
  async kiteCallback(requestToken: string, portfolioId?: string | null): Promise<{ accountId: string; userName: string }> {
    const { data } = await api.post<ApiResponse<{ accountId: string; userName: string }>>(
      '/api/connectors/kite/callback',
      { requestToken, portfolioId: portfolioId ?? null },
    );
    return unwrap(data);
  },
  async sync(id: string): Promise<{ tradesImported: number; holdingsFetched: number }> {
    const { data } = await api.post<ApiResponse<{ tradesImported: number; holdingsFetched: number }>>(
      `/api/connectors/${id}/sync`,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/connectors/${id}`);
  },
};
