import { api, unwrap } from './client';
import { getApiBaseUrl } from './baseUrl';
import type { ApiResponse } from '@everypaisa/shared';

export type DocumentRequestStatus = 'OPEN' | 'UPLOADED' | 'NOT_APPLICABLE' | 'ACCEPTED' | 'CANCELLED';

export const DOCUMENT_REQUEST_STATUS_LABEL: Record<DocumentRequestStatus, string> = {
  OPEN: 'Waiting for the client',
  UPLOADED: 'Sent',
  NOT_APPLICABLE: "Doesn't apply",
  ACCEPTED: 'Accepted',
  CANCELLED: 'Withdrawn',
};

/** The CA's view of a request. */
export interface CaDocumentRequest {
  id: string;
  clientId: string;
  title: string;
  note: string | null;
  financialYear: string | null;
  /** UTC midnight of the due day, or null. */
  dueDate: string | null;
  status: DocumentRequestStatus;
  documentId: string | null;
  clientNote: string | null;
  respondedAt: string | null;
  createdAt: string;
}

/** The account holder's view: what they were asked for and by whom. */
export interface MyDocumentRequest {
  id: string;
  title: string;
  note: string | null;
  financialYear: string | null;
  dueDate: string | null;
  status: DocumentRequestStatus;
  clientNote: string | null;
  documentId: string | null;
  createdAt: string;
  askedBy: string;
}

export interface AskInput {
  title: string;
  note?: string | null;
  financialYear?: string | null;
  dueDate?: string | null;
}

export const caDocumentRequestsApi = {
  // The CA
  async list(clientId: string): Promise<CaDocumentRequest[]> {
    const { data } = await api.get<ApiResponse<CaDocumentRequest[]>>(`/api/ca/clients/${clientId}/document-requests`);
    return unwrap(data);
  },
  async ask(clientId: string, input: AskInput): Promise<CaDocumentRequest> {
    const { data } = await api.post<ApiResponse<CaDocumentRequest>>(`/api/ca/clients/${clientId}/document-requests`, input);
    return unwrap(data);
  },
  async close(clientId: string, id: string, outcome: 'ACCEPTED' | 'CANCELLED'): Promise<void> {
    await api.post(`/api/ca/clients/${clientId}/document-requests/${id}/close`, { outcome });
  },
  /** One client document, through the same scoped bulk download the Documents tab uses. */
  async downloadDocument(clientId: string, documentId: string, accessToken: string | null): Promise<void> {
    const r = await fetch(`${getApiBaseUrl()}/api/documents/bulk-download?clientId=${encodeURIComponent(clientId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [documentId] }),
    });
    if (!r.ok) throw new Error('Download failed');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // The account holder
  async mine(): Promise<MyDocumentRequest[]> {
    const { data } = await api.get<ApiResponse<MyDocumentRequest[]>>('/api/me/professional-access/document-requests');
    return unwrap(data);
  },
  async upload(id: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await api.post(`/api/me/professional-access/document-requests/${id}/upload`, form);
  },
  async notApplicable(id: string, reason: string): Promise<void> {
    await api.post(`/api/me/professional-access/document-requests/${id}/not-applicable`, { reason });
  },
};
