import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type IncomeType =
  | 'SALARY'
  | 'BUSINESS'
  | 'TRADING'
  | 'FREELANCE'
  | 'RENTAL'
  | 'INTEREST_DIVIDEND'
  | 'CAPITAL_GAINS'
  | 'OTHER';

export interface IncomeDTO {
  id: string;
  type: IncomeType;
  sourceName: string;
  monthlyAmount: string;
  payDay: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeInput {
  type?: IncomeType;
  sourceName: string;
  monthlyAmount: string | number;
  payDay?: number;
  isActive?: boolean;
  notes?: string | null;
}

export const incomeApi = {
  async list(): Promise<IncomeDTO[]> {
    const { data } = await api.get<ApiResponse<IncomeDTO[]>>('/api/income');
    return unwrap(data);
  },
  async get(id: string): Promise<IncomeDTO> {
    const { data } = await api.get<ApiResponse<IncomeDTO>>(`/api/income/${id}`);
    return unwrap(data);
  },
  async create(input: IncomeInput): Promise<IncomeDTO> {
    const { data } = await api.post<ApiResponse<IncomeDTO>>('/api/income', input);
    return unwrap(data);
  },
  async update(id: string, input: Partial<IncomeInput>): Promise<IncomeDTO> {
    const { data } = await api.patch<ApiResponse<IncomeDTO>>(`/api/income/${id}`, input);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/income/${id}`);
  },
};
