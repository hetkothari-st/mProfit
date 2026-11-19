import { api } from './client';
import { getApiBaseUrl } from './baseUrl';
import type { PriceCheckResult } from '@/pages/transactions/priceSanity';
import type {
  ApiResponse,
  CreateTransactionRequest,
  DuplicateScanResponse,
  TransactionDTO,
  TransactionListResponse,
  UpdateTransactionRequest,
} from '@everypaisa/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export interface ListTransactionsParams {
  portfolioId?: string;
  assetClass?: string;
  transactionType?: string;
  from?: string;
  to?: string;
  /** Free text; every word must match the asset name, symbol, scheme, AMC, ISIN or broker. */
  q?: string;
  sort?: 'date' | 'amount' | 'asset' | 'type' | 'quantity';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const transactionsApi = {
  async list(params: ListTransactionsParams = {}): Promise<TransactionListResponse> {
    const { data } = await api.get<ApiResponse<TransactionListResponse>>('/api/transactions', {
      params,
    });
    return unwrap(data);
  },
  /**
   * Advisory sanity check of a typed price against that instrument's close/NAV on the trade date.
   * Never blocks saving; "unknown" and "ok" both mean there is nothing to say.
   */
  async priceCheck(params: {
    assetClass: string;
    stockSymbol?: string;
    schemeCode?: string;
    isin?: string;
    tradeDate: string;
    price: string;
  }): Promise<PriceCheckResult> {
    const { data } = await api.get<ApiResponse<PriceCheckResult>>('/api/transactions/price-check', { params });
    return unwrap(data);
  },
  /** Downloads every transaction matching the filters (not just the visible page) as a CSV. */
  async exportCsv(params: Omit<ListTransactionsParams, 'page' | 'pageSize'> = {}): Promise<void> {
    const res = await api.get('/api/transactions/export', { params, responseType: 'blob' });
    saveBlob(res.data as Blob, `transactions-${new Date().toISOString().slice(0, 10)}.csv`);
  },
  async get(id: string): Promise<TransactionDTO> {
    const { data } = await api.get<ApiResponse<TransactionDTO>>(`/api/transactions/${id}`);
    return unwrap(data);
  },
  async create(payload: CreateTransactionRequest): Promise<TransactionDTO> {
    const { data } = await api.post<ApiResponse<TransactionDTO>>('/api/transactions', payload);
    return unwrap(data);
  },
  async update(id: string, payload: UpdateTransactionRequest): Promise<TransactionDTO> {
    const { data } = await api.patch<ApiResponse<TransactionDTO>>(
      `/api/transactions/${id}`,
      payload,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/transactions/${id}`);
  },
  async duplicates(): Promise<DuplicateScanResponse> {
    const { data } = await api.get<ApiResponse<DuplicateScanResponse>>(
      '/api/transactions/duplicates',
    );
    return unwrap(data);
  },
  async removeDuplicates(ids: {
    transactionIds?: string[];
    rentEntryIds?: string[];
  }): Promise<{ removedTransactions: number; removedRentEntries: number }> {
    const { data } = await api.post<
      ApiResponse<{ removedTransactions: number; removedRentEntries: number }>
    >('/api/transactions/duplicates/remove', ids);
    return unwrap(data);
  },
  async uploadPhoto(txnId: string, file: File): Promise<{ id: string; fileName: string }> {
    const form = new FormData();
    form.append('photo', file);
    const { data } = await api.post<ApiResponse<{ id: string; fileName: string }>>(
      `/api/transactions/${txnId}/photos`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(data);
  },
  async deletePhoto(txnId: string, photoId: string): Promise<void> {
    await api.delete(`/api/transactions/${txnId}/photos/${photoId}`);
  },
  photoUrl(txnId: string, photoId: string): string {
    const base = getApiBaseUrl();
    return `${base}/api/transactions/${txnId}/photos/${photoId}`;
  },
};
