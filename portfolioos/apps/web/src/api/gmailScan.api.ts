import { api } from './client';
import type {
  ApiResponse,
  GmailScanJobDTO,
  GmailDiscoveredDocDTO,
  GmailAutoApproveRuleDTO,
  CreateScanJobInput,
  BulkApproveInput,
  BulkRejectInput,
  GmailDocStatus,
} from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export const gmailScanApi = {
  createScan: async (input: CreateScanJobInput): Promise<GmailScanJobDTO> => {
    const { data } = await api.post<ApiResponse<GmailScanJobDTO>>('/api/gmail/scan-jobs', input);
    return unwrap(data);
  },
  listScans: async (): Promise<GmailScanJobDTO[]> => {
    const { data } = await api.get<ApiResponse<GmailScanJobDTO[]>>('/api/gmail/scan-jobs');
    return unwrap(data);
  },
  getScan: async (id: string): Promise<GmailScanJobDTO> => {
    const { data } = await api.get<ApiResponse<GmailScanJobDTO>>(`/api/gmail/scan-jobs/${id}`);
    return unwrap(data);
  },
  cancelScan: async (id: string): Promise<GmailScanJobDTO> => {
    const { data } = await api.post<ApiResponse<GmailScanJobDTO>>(`/api/gmail/scan-jobs/${id}/cancel`);
    return unwrap(data);
  },
  resumeScan: async (id: string): Promise<GmailScanJobDTO> => {
    const { data } = await api.post<ApiResponse<GmailScanJobDTO>>(`/api/gmail/scan-jobs/${id}/resume`);
    return unwrap(data);
  },

  listDocs: async (
    params: {
      status?: GmailDocStatus;
      fromAddress?: string;
      docType?: string;
      scanJobId?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<GmailDiscoveredDocDTO[]> => {
    const { data } = await api.get<ApiResponse<GmailDiscoveredDocDTO[]>>(
      '/api/gmail/discovered-docs',
      { params },
    );
    return unwrap(data);
  },
  listSenders: async (): Promise<string[]> => {
    const { data } = await api.get<ApiResponse<string[]>>('/api/gmail/discovered-docs/senders');
    return unwrap(data);
  },
  getDoc: async (id: string): Promise<GmailDiscoveredDocDTO> => {
    const { data } = await api.get<ApiResponse<GmailDiscoveredDocDTO>>(
      `/api/gmail/discovered-docs/${id}`,
    );
    return unwrap(data);
  },
  getDocPreviewUrl: async (
    id: string,
  ): Promise<{ url: string; fileName: string; mimeType: string }> => {
    const { data } = await api.get<ApiResponse<{ url: string; fileName: string; mimeType: string }>>(
      `/api/gmail/discovered-docs/${id}/preview-url`,
    );
    return unwrap(data);
  },
  approveDoc: async (id: string, createAutoApproveRule = false): Promise<GmailDiscoveredDocDTO> => {
    const { data } = await api.post<ApiResponse<GmailDiscoveredDocDTO>>(
      `/api/gmail/discovered-docs/${id}/approve`,
      { createAutoApproveRule },
    );
    return unwrap(data);
  },
  rejectDoc: async (
    id: string,
    opts: { reason?: string; blocklist?: boolean } = {},
  ): Promise<GmailDiscoveredDocDTO> => {
    const { data } = await api.post<ApiResponse<GmailDiscoveredDocDTO>>(
      `/api/gmail/discovered-docs/${id}/reject`,
      opts,
    );
    return unwrap(data);
  },
  bulkApprove: async (input: BulkApproveInput) => {
    const { data } = await api.post<ApiResponse<unknown>>('/api/gmail/discovered-docs/bulk-approve', input);
    return unwrap(data);
  },
  bulkReject: async (input: BulkRejectInput) => {
    const { data } = await api.post<ApiResponse<unknown>>('/api/gmail/discovered-docs/bulk-reject', input);
    return unwrap(data);
  },

  listRules: async (): Promise<GmailAutoApproveRuleDTO[]> => {
    const { data } = await api.get<ApiResponse<GmailAutoApproveRuleDTO[]>>(
      '/api/gmail/auto-approve-rules',
    );
    return unwrap(data);
  },
  upsertRule: async (input: {
    fromAddress: string;
    docType?: string | null;
    enabled: boolean;
  }): Promise<GmailAutoApproveRuleDTO> => {
    const { data } = await api.post<ApiResponse<GmailAutoApproveRuleDTO>>(
      '/api/gmail/auto-approve-rules',
      input,
    );
    return unwrap(data);
  },
  deleteRule: async (id: string): Promise<void> => {
    await api.delete(`/api/gmail/auto-approve-rules/${id}`);
  },
};
