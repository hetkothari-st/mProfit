import { api } from './client';
import type {
  ApiResponse,
  IngestionFailureDTO,
  IngestionResolveAction,
} from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface ListIngestionFailuresParams {
  resolved?: boolean;
  limit?: number;
}

export const ingestionFailuresApi = {
  async list(params: ListIngestionFailuresParams = {}): Promise<IngestionFailureDTO[]> {
    const query: Record<string, string> = {};
    if (params.resolved !== undefined) query.resolved = String(params.resolved);
    if (params.limit !== undefined) query.limit = String(params.limit);
    const { data } = await api.get<ApiResponse<IngestionFailureDTO[]>>(
      '/api/ingestion-failures',
      { params: query },
    );
    return unwrap(data);
  },
  async get(id: string): Promise<IngestionFailureDTO> {
    const { data } = await api.get<ApiResponse<IngestionFailureDTO>>(
      `/api/ingestion-failures/${id}`,
    );
    return unwrap(data);
  },
  async resolve(id: string, action: IngestionResolveAction): Promise<IngestionFailureDTO> {
    const { data } = await api.post<ApiResponse<IngestionFailureDTO>>(
      `/api/ingestion-failures/${id}/resolve`,
      { action },
    );
    return unwrap(data);
  },
};
