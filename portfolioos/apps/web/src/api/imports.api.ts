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
  password?: string;
}

export const importsApi = {
  async upload({ file, portfolioId, broker, password }: UploadImportParams): Promise<ImportCreateResponse> {
    const form = new FormData();
    form.append('file', file);
    if (portfolioId) form.append('portfolioId', portfolioId);
    if (broker) form.append('broker', broker);
    if (password) form.append('password', password);
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
  async reprocess(id: string, password?: string): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>(`/api/imports/${id}/reprocess`, password ? { password } : {});
    return unwrap(data);
  },
  async download(id: string, fileName: string): Promise<void> {
    const { data } = await api.get(`/api/imports/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};
