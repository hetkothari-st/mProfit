import type { ApiResponse, SorterFileDTO, SorterPersonDTO, SorterTreeDTO, SortDocType, SortStatus } from '@everypaisa/shared';
import { api, decodeBlobError } from './client';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export interface UploadAck {
  id: string;
  duplicateOf?: string;
  status: SortStatus;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const documentSorterApi = {
  async upload(files: File[], onProgress?: (fraction: number) => void): Promise<UploadAck[]> {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const { data } = await api.post<ApiResponse<UploadAck[]>>('/api/documents-sorter/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total);
      },
    });
    return unwrap(data);
  },
  async tree(): Promise<SorterTreeDTO> {
    const { data } = await api.get<ApiResponse<SorterTreeDTO>>('/api/documents-sorter/tree');
    return unwrap(data);
  },
  async patchFile(id: string, patch: { personId?: string; docType?: SortDocType; docDate?: string }): Promise<SorterFileDTO> {
    const { data } = await api.patch<ApiResponse<SorterFileDTO>>(`/api/documents-sorter/files/${id}`, patch);
    return unwrap(data);
  },
  async submitPassword(id: string, password: string): Promise<void> {
    await api.post(`/api/documents-sorter/files/${id}/password`, { password });
  },
  async renamePerson(id: string, displayName: string): Promise<SorterPersonDTO> {
    const { data } = await api.patch<ApiResponse<SorterPersonDTO>>(`/api/documents-sorter/people/${id}`, { displayName });
    return unwrap(data);
  },
  async merge(fromId: string, intoId: string): Promise<void> {
    await api.post('/api/documents-sorter/people/merge', { fromId, intoId });
  },
  /** Zip of one folder (person, or person + type); with no filter, everything filed. */
  async downloadZip(filter: { personId?: string; docType?: SortDocType }, fileName: string): Promise<void> {
    try {
      const res = await api.get('/api/documents-sorter/folder-zip', { params: filter, responseType: 'blob' });
      saveBlob(res.data as Blob, fileName);
    } catch (err) {
      throw await decodeBlobError(err);
    }
  },
};
