import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

export interface HealthSubScore {
  score: number;
  insight: string;
  action: string;
}

export interface HealthScoreResult {
  overallScore: number;
  grade: string;
  subScores: {
    emergencyFund: HealthSubScore;
    investmentRate: HealthSubScore;
    debtBurden: HealthSubScore;
    diversification: HealthSubScore;
    insurance: HealthSubScore;
    goalProgress: HealthSubScore;
  };
  computedAt: string;
}

export type NetWorthHistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export interface NetWorthHistoryPoint {
  asOf: string;
  totalNetWorth: string;
  totalLiabilities: string;
  netWorthAfterLiabilities: string;
}

export interface NetWorthHistoryResponse {
  points: NetWorthHistoryPoint[];
  summary: {
    changeAbsolute: string;
    changePct: number | null;
    periodLabel: NetWorthHistoryPeriod;
  };
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const intelligenceApi = {
  async healthScore(force = false): Promise<HealthScoreResult> {
    const { data } = await api.get<ApiResponse<HealthScoreResult>>('/api/intelligence/health-score', {
      params: force ? { force: 'true' } : undefined,
    });
    return unwrap(data);
  },

  async netWorthHistory(period: NetWorthHistoryPeriod = '1Y'): Promise<NetWorthHistoryResponse> {
    const { data } = await api.get<ApiResponse<NetWorthHistoryResponse>>(
      '/api/intelligence/net-worth/history',
      { params: { period } },
    );
    return unwrap(data);
  },
};
