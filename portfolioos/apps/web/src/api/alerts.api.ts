import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export type AlertType =
  | 'FD_MATURITY' | 'BOND_MATURITY' | 'MF_LOCK_IN_EXPIRY' | 'SIP_DUE'
  | 'INSURANCE_PREMIUM' | 'DIVIDEND_RECEIVED' | 'CORPORATE_ACTION'
  | 'PRICE_TARGET' | 'CUSTOM';

export interface AlertDTO {
  id: string;
  type: AlertType;
  title: string;
  description: string | null;
  triggerDate: string;
  isRead: boolean;
  metadata: unknown;
  createdAt: string;
}

export interface AlertsResult {
  alerts: AlertDTO[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export const alertsApi = {
  async list(params?: { unreadOnly?: boolean; type?: AlertType; page?: number; limit?: number }): Promise<AlertsResult> {
    const { data } = await api.get<ApiResponse<AlertsResult>>('/api/alerts', { params });
    return unwrap(data);
  },
  async getUnreadCount(): Promise<number> {
    const { data } = await api.get<ApiResponse<{ count: number }>>('/api/alerts/unread-count');
    return unwrap(data).count;
  },
  async markRead(id: string): Promise<void> {
    await api.patch(`/api/alerts/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await api.patch('/api/alerts/mark-all-read');
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/api/alerts/${id}`);
  },
  async createCustom(data: { title: string; description?: string; triggerDate: string; portfolioId?: string }): Promise<AlertDTO> {
    const { data: res } = await api.post<ApiResponse<AlertDTO>>('/api/alerts', data);
    return unwrap(res);
  },
  async triggerScan(): Promise<{ vehicle: number; rent: number }> {
    const { data } = await api.post<ApiResponse<{ vehicle: number; rent: number }>>('/api/alerts/scan');
    return unwrap(data);
  },
};
