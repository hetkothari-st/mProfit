import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type CorporateActionType =
  | 'DIVIDEND' | 'BONUS' | 'SPLIT' | 'MERGER' | 'DEMERGER' | 'RIGHTS' | 'BUYBACK';

export type CorporateActionStatus = 'APPLIED' | 'UPCOMING' | 'PENDING' | 'NEEDS_ACTION';

export interface CorporateActionRow {
  caId: string;
  holdingId: string;
  stockId: string;
  stockSymbol: string | null;
  stockName: string | null;
  assetName: string | null;
  portfolioId: string;
  portfolioName: string;
  type: CorporateActionType;
  exDate: string;
  ratio: string | null;
  amount: string | null;
  qtyHeld: string;
  qtyDelta: string | null;
  cashImpact: string | null;
  status: CorporateActionStatus;
  appliedTxId: string | null;
}

export interface CorporateActionReport {
  rows: CorporateActionRow[];
  summary: {
    total: number;
    applied: number;
    pending: number;
    upcoming: number;
    needsAction: number;
    dividendIncome: string;
    byType: Array<{ type: CorporateActionType; count: number }>;
  };
  dividendByMonth: Array<{ month: string; amount: string }>;
}

export interface CorporateActionQuery {
  portfolioId?: string;
  type?: CorporateActionType;
  status?: CorporateActionStatus;
}

export const corporateActionsApi = {
  async list(q: CorporateActionQuery = {}): Promise<CorporateActionReport> {
    const params = new URLSearchParams();
    if (q.portfolioId) params.set('portfolioId', q.portfolioId);
    if (q.type) params.set('type', q.type);
    if (q.status) params.set('status', q.status);
    const qs = params.toString();
    const { data } = await api.get<ApiResponse<CorporateActionReport>>(
      `/api/corporate-actions${qs ? `?${qs}` : ''}`,
    );
    return unwrap(data);
  },
  async sync(): Promise<unknown> {
    const { data } = await api.post<ApiResponse<unknown>>('/api/corporate-actions/sync');
    return unwrap(data);
  },
  async apply(): Promise<{ applied: number }> {
    const { data } = await api.post<ApiResponse<{ applied: number }>>('/api/corporate-actions/apply');
    return unwrap(data);
  },
};
