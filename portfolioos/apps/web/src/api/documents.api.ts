import { api } from './client';
import type {
  ApiResponse,
  DocumentDTO,
  DocumentOwnerType,
  OnlyOfficeConfigResponse,
  UpdateDocumentRequest,
} from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const documentsApi = {
  async list(filter?: { ownerType?: DocumentOwnerType; ownerId?: string }): Promise<DocumentDTO[]> {
    const { data } = await api.get<ApiResponse<DocumentDTO[]>>('/api/documents', {
      params: filter,
    });
    return unwrap(data);
  },
  async upload(input: {
    file: File;
    ownerType: DocumentOwnerType;
    ownerId: string;
    category?: string;
  }): Promise<DocumentDTO> {
    const fd = new FormData();
    fd.append('file', input.file);
    fd.append('ownerType', input.ownerType);
    fd.append('ownerId', input.ownerId);
    if (input.category) fd.append('category', input.category);
    const { data } = await api.post<ApiResponse<DocumentDTO>>('/api/documents', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
  async update(id: string, payload: UpdateDocumentRequest): Promise<DocumentDTO> {
    const { data } = await api.patch<ApiResponse<DocumentDTO>>(`/api/documents/${id}`, payload);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/documents/${id}`);
  },
  downloadUrl(id: string): string {
    const base =
      (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    return `${base}/api/documents/${id}/download`;
  },
  async openDownload(id: string, fileName: string): Promise<void> {
    // Authed download: fetch via axios so the access token is sent, then
    // synthesise a download. Avoids relying on cookies.
    const res = await api.get(`/api/documents/${id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  async onlyofficeConfig(id: string): Promise<OnlyOfficeConfigResponse> {
    const { data } = await api.get<ApiResponse<OnlyOfficeConfigResponse>>(
      `/api/documents/${id}/onlyoffice-config`,
    );
    return unwrap(data);
  },
  async convertToPdf(id: string): Promise<DocumentDTO> {
    const { data } = await api.post<ApiResponse<DocumentDTO>>(
      `/api/documents/${id}/convert-pdf`,
    );
    return unwrap(data);
  },
};
