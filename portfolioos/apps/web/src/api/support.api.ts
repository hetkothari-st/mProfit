import { api } from './client';
import type {
  AdminSupportTicketDTO,
  ApiResponse,
  CreateSupportTicketRequest,
  SupportStatus,
  SupportTicketDTO,
} from '@everypaisa/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const supportApi = {
  async create(payload: CreateSupportTicketRequest): Promise<SupportTicketDTO> {
    const { data } = await api.post<ApiResponse<SupportTicketDTO>>('/api/support/tickets', payload);
    return unwrap(data);
  },
  async mine(): Promise<SupportTicketDTO[]> {
    const { data } = await api.get<ApiResponse<SupportTicketDTO[]>>('/api/support/tickets');
    return unwrap(data);
  },
};

export const supportAdminApi = {
  async list(status?: SupportStatus): Promise<AdminSupportTicketDTO[]> {
    const { data } = await api.get<ApiResponse<AdminSupportTicketDTO[]>>('/api/admin/support/tickets', {
      params: status ? { status } : {},
    });
    return unwrap(data);
  },
  async update(id: string, patch: { status?: SupportStatus; adminNote?: string | null }): Promise<AdminSupportTicketDTO> {
    const { data } = await api.patch<ApiResponse<AdminSupportTicketDTO>>(`/api/admin/support/tickets/${id}`, patch);
    return unwrap(data);
  },
};
