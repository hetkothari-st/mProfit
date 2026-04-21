import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface MonitoredSenderDTO {
  id: string;
  userId: string;
  address: string;
  displayLabel: string | null;
  isActive: boolean;
  autoCommitAfter: number;
  autoCommitEnabled: boolean;
  confirmedEventCount: number;
  currentTemplateId: string | null;
  firstSeenAt: string;
  lastFetchedAt: string | null;
}

export interface CreateMonitoredSenderInput {
  address: string;
  displayLabel?: string | null;
  autoCommitAfter?: number;
}

export interface UpdateMonitoredSenderInput {
  displayLabel?: string | null;
  autoCommitAfter?: number;
  isActive?: boolean;
  autoCommitEnabled?: boolean;
}

export const monitoredSendersApi = {
  async list(): Promise<MonitoredSenderDTO[]> {
    const { data } = await api.get<ApiResponse<MonitoredSenderDTO[]>>(
      '/api/monitored-senders',
    );
    return unwrap(data);
  },
  async create(input: CreateMonitoredSenderInput): Promise<MonitoredSenderDTO> {
    const { data } = await api.post<ApiResponse<MonitoredSenderDTO>>(
      '/api/monitored-senders',
      input,
    );
    return unwrap(data);
  },
  async update(id: string, input: UpdateMonitoredSenderInput): Promise<MonitoredSenderDTO> {
    const { data } = await api.patch<ApiResponse<MonitoredSenderDTO>>(
      `/api/monitored-senders/${id}`,
      input,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/monitored-senders/${id}`);
  },
};
