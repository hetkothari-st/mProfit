import { api } from './client';
import type {
  ApiResponse,
  FeedRunFailureDTO,
  IngestionFailureDTO,
  IngestionResolveAction,
} from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface ListIngestionFailuresParams {
  resolved?: boolean;
  adapter?: string;
  since?: string; // YYYY-MM-DD
  cursor?: string;
  limit?: number;
}

export interface ListIngestionFailuresResult {
  data: IngestionFailureDTO[];
  nextCursor: string | null;
}

export interface RetryIngestionFailureResult {
  eventsInserted: number;
  error?: string;
}

export interface ListFeedRunFailuresResult {
  items: FeedRunFailureDTO[];
}

export const ingestionFailuresApi = {
  /**
   * Market-feed runs that failed. Not user-scoped — a stale AMFI file is the
   * same fact for everyone — and there is nothing to retry by hand.
   */
  async listFeedFailures(limit = 25): Promise<ListFeedRunFailuresResult> {
    const { data } = await api.get<ApiResponse<ListFeedRunFailuresResult>>(
      '/api/ingestion-failures/feeds',
      { params: { limit: String(limit) } },
    );
    return unwrap(data);
  },

  async list(params: ListIngestionFailuresParams = {}): Promise<ListIngestionFailuresResult> {
    const query: Record<string, string> = {};
    if (params.resolved !== undefined) query.resolved = String(params.resolved);
    if (params.adapter) query.adapter = params.adapter;
    if (params.since) query.since = params.since;
    if (params.cursor) query.cursor = params.cursor;
    if (params.limit !== undefined) query.limit = String(params.limit);
    const { data } = await api.get<ApiResponse<ListIngestionFailuresResult>>(
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
  async retry(id: string): Promise<RetryIngestionFailureResult> {
    const { data } = await api.post<ApiResponse<RetryIngestionFailureResult>>(
      `/api/ingestion-failures/${id}/retry`,
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
