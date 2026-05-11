import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ForexBalanceDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  currency: string;
  balance: string;
  accountLabel: string | null;
  accountLast4: string | null;
  bankName: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateForexBalanceInput {
  portfolioId?: string | null;
  currency: string;
  balance: string;
  accountLabel?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  country?: string | null;
  notes?: string | null;
}

export type UpdateForexBalanceInput = Partial<CreateForexBalanceInput>;

export interface LrsRemittanceDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  remittanceDate: string;
  currency: string;
  foreignAmount: string;
  inrEquivalent: string;
  fxRate: string;
  purpose: string;
  bankName: string | null;
  remittanceRef: string | null;
  tcsDeducted: string;
  tcsCreditId: string | null;
  tcsCredit: TcsCreditDTO | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateLrsRemittanceInput {
  portfolioId?: string | null;
  remittanceDate: string;
  currency: string;
  foreignAmount: string;
  fxRate?: string | null;
  purpose: 'INVESTMENT' | 'EDUCATION' | 'TRAVEL' | 'GIFT' | 'MAINTENANCE' | 'MEDICAL' | 'OTHER';
  bankName?: string | null;
  remittanceRef?: string | null;
  tcsDeducted?: string | null;
  tcsCreditId?: string | null;
  notes?: string | null;
  forceConfirmed?: boolean;
}

export interface LrsUtilisationDTO {
  fy: string;
  usedInr: string;
  usedUsd: string;
  limitUsd: string;
  remainingUsd: string;
  pctUsed: number;
  tcsThresholdInr: string;
  tcsLikelyOnNextInr: string;
  warning: boolean;
}

export interface TcsCreditDTO {
  id: string;
  userId: string;
  financialYear: string;
  tcsAmount: string;
  usedAmount: string;
  tan: string | null;
  collectorName: string | null;
  form27eqRef: string | null;
  createdAt: string;
  remittances?: Array<{ id: string; remittanceDate: string; foreignAmount: string; currency: string }>;
}

export interface CreateTcsCreditInput {
  financialYear: string;
  tcsAmount: string;
  tan?: string | null;
  collectorName?: string | null;
  form27eqRef?: string | null;
}

export interface TickerRow {
  base: string;
  quote: string;
  rate: string;
  source: string;
  date: string;
}

export interface ForexPairPnlRow {
  portfolioId: string;
  pair: string;
  financialYear: string;
  buyQty: string;
  sellQty: string;
  buyCost: string;
  sellProceeds: string;
  realisedPnl: string;
  unrealisedPosition: string;
}

// ─── API client ─────────────────────────────────────────────────────

export const forexApi = {
  // Balances
  async listBalances(): Promise<ForexBalanceDTO[]> {
    const { data } = await api.get<ApiResponse<ForexBalanceDTO[]>>('/api/forex/balances');
    return unwrap(data);
  },
  async getBalance(id: string): Promise<ForexBalanceDTO> {
    const { data } = await api.get<ApiResponse<ForexBalanceDTO>>(`/api/forex/balances/${id}`);
    return unwrap(data);
  },
  async createBalance(input: CreateForexBalanceInput): Promise<ForexBalanceDTO> {
    const { data } = await api.post<ApiResponse<ForexBalanceDTO>>('/api/forex/balances', input);
    return unwrap(data);
  },
  async updateBalance(id: string, input: UpdateForexBalanceInput): Promise<ForexBalanceDTO> {
    const { data } = await api.patch<ApiResponse<ForexBalanceDTO>>(
      `/api/forex/balances/${id}`,
      input,
    );
    return unwrap(data);
  },
  async deleteBalance(id: string): Promise<void> {
    await api.delete(`/api/forex/balances/${id}`);
  },
  async revealAccount(id: string): Promise<{ accountNumber: string | null }> {
    const { data } = await api.post<ApiResponse<{ accountNumber: string | null }>>(
      `/api/forex/balances/${id}/reveal`,
    );
    return unwrap(data);
  },

  // LRS
  async listLrs(fy?: string): Promise<LrsRemittanceDTO[]> {
    const { data } = await api.get<ApiResponse<LrsRemittanceDTO[]>>('/api/forex/lrs', {
      params: fy ? { fy } : {},
    });
    return unwrap(data);
  },
  async createLrs(input: CreateLrsRemittanceInput): Promise<LrsRemittanceDTO> {
    const { data } = await api.post<ApiResponse<LrsRemittanceDTO>>('/api/forex/lrs', input);
    return unwrap(data);
  },
  async deleteLrs(id: string): Promise<void> {
    await api.delete(`/api/forex/lrs/${id}`);
  },
  async lrsUtilisation(fy?: string): Promise<LrsUtilisationDTO> {
    const { data } = await api.get<ApiResponse<LrsUtilisationDTO>>('/api/forex/lrs/utilisation', {
      params: fy ? { fy } : {},
    });
    return unwrap(data);
  },

  // TCS
  async listTcs(fy?: string): Promise<TcsCreditDTO[]> {
    const { data } = await api.get<ApiResponse<TcsCreditDTO[]>>('/api/forex/tcs', {
      params: fy ? { fy } : {},
    });
    return unwrap(data);
  },
  async createTcs(input: CreateTcsCreditInput): Promise<TcsCreditDTO> {
    const { data } = await api.post<ApiResponse<TcsCreditDTO>>('/api/forex/tcs', input);
    return unwrap(data);
  },
  async deleteTcs(id: string): Promise<void> {
    await api.delete(`/api/forex/tcs/${id}`);
  },

  // Ticker
  async ticker(pairs?: string[]): Promise<TickerRow[]> {
    const { data } = await api.get<ApiResponse<TickerRow[]>>('/api/forex/ticker', {
      params: pairs && pairs.length > 0 ? { pairs: pairs.join(',') } : {},
    });
    return unwrap(data);
  },
  async refreshTicker(): Promise<{ updated: number; skipped: number; bySource: Record<string, number> }> {
    const { data } = await api.post<ApiResponse<{ updated: number; skipped: number; bySource: Record<string, number> }>>(
      '/api/forex/ticker/refresh',
    );
    return unwrap(data);
  },
  async supportedCurrencies(): Promise<string[]> {
    const { data } = await api.get<ApiResponse<string[]>>('/api/forex/currencies');
    return unwrap(data);
  },

  // Forex pair P&L
  async pairPnl(portfolioId: string): Promise<ForexPairPnlRow[]> {
    const { data } = await api.get<ApiResponse<ForexPairPnlRow[]>>(
      `/api/forex/pairs/${portfolioId}/pnl`,
    );
    return unwrap(data);
  },
};
