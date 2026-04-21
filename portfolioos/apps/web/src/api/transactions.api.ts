import { api } from './client';
import type {
  ApiResponse,
  CreateTransactionRequest,
  TransactionDTO,
  TransactionListResponse,
  UpdateTransactionRequest,
} from '@portfolioos/shared';

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
  page?: number;
  pageSize?: number;
}

export const transactionsApi = {
  async list(params: ListTransactionsParams = {}): Promise<TransactionListResponse> {
    const { data } = await api.get<ApiResponse<TransactionListResponse>>('/api/transactions', {
      params,
    });
    return unwrap(data);
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
};
