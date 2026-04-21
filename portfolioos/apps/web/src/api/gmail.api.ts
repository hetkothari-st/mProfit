import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export const gmailApi = {
  async config(): Promise<{ configured: boolean }> {
    const { data } = await api.get<ApiResponse<{ configured: boolean }>>('/api/gmail/config');
    return unwrap(data);
  },
  async authUrl(): Promise<{ url: string }> {
    const { data } = await api.get<ApiResponse<{ url: string }>>('/api/gmail/auth-url');
    return unwrap(data);
  },
  async callback(code: string): Promise<{ id: string; email: string }> {
    const { data } = await api.post<ApiResponse<{ id: string; email: string }>>(
      '/api/gmail/callback',
      { code },
    );
    return unwrap(data);
  },
  async sync(id: string): Promise<{ processed: number; imported: number; errors: number }> {
    const { data } = await api.post<ApiResponse<{ processed: number; imported: number; errors: number }>>(
      `/api/gmail/${id}/sync`,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/gmail/${id}`);
  },
};
