import { api } from './client';
import type { ApiResponse, ImportJobDTO, ImportCreateResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface UploadImportParams {
  file: File;
  portfolioId?: string | null;
  broker?: string;
}

export const importsApi = {
  async upload({ file, portfolioId, broker }: UploadImportParams): Promise<ImportCreateResponse> {
    const form = new FormData();
    form.append('file', file);
    if (portfolioId) form.append('portfolioId', portfolioId);
    if (broker) form.append('broker', broker);
    const { data } = await api.post<ApiResponse<ImportCreateResponse>>('/api/imports', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
  async list(): Promise<ImportJobDTO[]> {
    const { data } = await api.get<ApiResponse<ImportJobDTO[]>>('/api/imports');
    return unwrap(data);
  },
  async get(id: string): Promise<ImportJobDTO> {
    const { data } = await api.get<ApiResponse<ImportJobDTO>>(`/api/imports/${id}`);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/imports/${id}`);
  },
  async reprocess(id: string): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>(`/api/imports/${id}/reprocess`);
    return unwrap(data);
  },
};
