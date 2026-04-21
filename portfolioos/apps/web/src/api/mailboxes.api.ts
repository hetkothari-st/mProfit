import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type MailboxProvider = 'IMAP' | 'GMAIL_OAUTH';

export interface MailboxDTO {
  id: string;
  provider: MailboxProvider;
  label: string | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  googleEmail: string | null;
  folder: string;
  fromFilter: string | null;
  subjectFilter: string | null;
  isActive: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface MailboxCreateInput {
  label?: string;
  host: string;
  port?: number;
  secure?: boolean;
  username: string;
  password: string;
  folder?: string;
  fromFilter?: string | null;
  subjectFilter?: string | null;
  isActive?: boolean;
}

export const mailboxesApi = {
  async list(): Promise<MailboxDTO[]> {
    const { data } = await api.get<ApiResponse<MailboxDTO[]>>('/api/mailboxes');
    return unwrap(data);
  },
  async create(input: MailboxCreateInput): Promise<{ id: string }> {
    const { data } = await api.post<ApiResponse<{ id: string }>>('/api/mailboxes', input);
    return unwrap(data);
  },
  async update(id: string, input: Partial<MailboxCreateInput>): Promise<void> {
    await api.patch(`/api/mailboxes/${id}`, input);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/mailboxes/${id}`);
  },
  async test(input: Omit<MailboxCreateInput, 'label' | 'folder' | 'fromFilter' | 'subjectFilter' | 'isActive'>): Promise<{ ok: boolean; message?: string; hint?: string; responseText?: string; code?: string }> {
    const { data } = await api.post<ApiResponse<{ ok: boolean; message?: string; hint?: string; responseText?: string; code?: string }>>(
      '/api/mailboxes/test',
      input,
    );
    return unwrap(data);
  },
  async poll(id: string): Promise<{ processed: number; imported: number; errors: number }> {
    const { data } = await api.post<ApiResponse<{ processed: number; imported: number; errors: number }>>(
      `/api/mailboxes/${id}/poll`,
    );
    return unwrap(data);
  },
};
