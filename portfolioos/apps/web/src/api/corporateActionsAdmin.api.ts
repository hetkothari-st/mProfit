import { api } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export type ManualCorporateActionInput =
  | { type: 'SPLIT'; stock: string; exDate: string; fromFaceValue: string; toFaceValue: string; applyNow: boolean }
  | { type: 'BONUS'; stock: string; exDate: string; bonusShares: string; heldShares: string; applyNow: boolean };

export interface ManualCorporateActionResult {
  corporateActionId: string;
  symbol: string;
  type: 'SPLIT' | 'BONUS';
  exDate: string;
  ratio: string;
  created: boolean;
  portfoliosApplied: number;
  transactionsBooked: number;
}

export interface ManualCorporateActionRow {
  id: string;
  symbol: string | null;
  name: string | null;
  type: string;
  exDate: string;
  ratio: string | null;
  createdAt: string;
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const corporateActionsAdminApi = {
  async list(): Promise<ManualCorporateActionRow[]> {
    const { data } = await api.get<ApiResponse<ManualCorporateActionRow[]>>('/api/corporate-actions/manual');
    return unwrap(data);
  },
  async add(input: ManualCorporateActionInput): Promise<ManualCorporateActionResult> {
    const { data } = await api.post<ApiResponse<ManualCorporateActionResult>>('/api/corporate-actions/manual', input);
    return unwrap(data);
  },
};
