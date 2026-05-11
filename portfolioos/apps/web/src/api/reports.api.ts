import { api } from './client';
import { getApiBaseUrl } from './baseUrl';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface CapitalGainRow {
  sellTransactionId: string;
  buyTransactionId: string;
  assetClass: string;
  assetName: string;
  isin: string | null;
  buyDate: string;
  sellDate: string;
  quantity: string;
  buyPrice: string;
  sellPrice: string;
  buyAmount: string;
  sellAmount: string;
  indexedCostOfAcquisition: string | null;
  capitalGainType: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM';
  gainLoss: string;
  taxableGain: string;
  financialYear: string;
}

export interface GainsReport {
  rows: CapitalGainRow[];
  totalGain: string;
  taxable?: string;
  exemptionLimit?: string;
  count: number;
}

export interface IncomeReport {
  rows: Array<{
    id: string;
    date: string;
    type: string;
    assetName: string;
    amount: string;
    narration: string | null;
  }>;
  dividend: string;
  interest: string;
  maturity: string;
  total: string;
  count: number;
}

export interface UnrealisedReport {
  rows: Array<{
    id: string;
    assetClass: string;
    assetName: string | null;
    isin: string | null;
    quantity: string;
    avgCostPrice: string;
    currentPrice: string | null;
    totalCost: string;
    currentValue: string;
    unrealisedPnL: string;
    pctReturn: string;
  }>;
  totalCost: string;
  totalValue: string;
  unrealisedPnL: string;
  count: number;
}

export interface XirrBlock {
  // XIRR rate is dimensionless — fine as a JS number.
  xirr: number | null;
  cashflowCount: number;
  // Money fields arrive as strings (§3.2); display via fmt() (Decimal-backed).
  totalInvested: string;
  terminalValue: string;
}

export interface XirrReport {
  overall: XirrBlock;
  oneYear: XirrBlock;
  threeYear: XirrBlock;
  fiveYear: XirrBlock;
}

export interface HistoricalPoint {
  date: string;
  cost: string;
  value: string;
  holdings: number;
}

export interface PortfolioSummary {
  portfolio: { id: string; name: string; currency: string };
  counts: { transactions: number; holdings: number };
  unrealised: { totalCost: string; totalValue: string; unrealisedPnL: string };
  capitalGainsByFy: Record<
    string,
    { intraday: string; stcg: string; ltcg: string; taxable: string }
  >;
  xirr: {
    overall: number | null;
    oneYear: number | null;
    threeYear: number | null;
    fiveYear: number | null;
  };
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

export const reportsApi = {
  summary: async (portfolioId: string): Promise<PortfolioSummary> => {
    const { data } = await api.get<ApiResponse<PortfolioSummary>>(
      '/api/reports/summary' + qs({ portfolioId }),
    );
    return unwrap(data);
  },
  intraday: async (portfolioId: string, fy?: string): Promise<GainsReport> => {
    const { data } = await api.get<ApiResponse<GainsReport>>(
      '/api/reports/intraday' + qs({ portfolioId, fy }),
    );
    return unwrap(data);
  },
  stcg: async (portfolioId: string, fy?: string): Promise<GainsReport> => {
    const { data } = await api.get<ApiResponse<GainsReport>>(
      '/api/reports/stcg' + qs({ portfolioId, fy }),
    );
    return unwrap(data);
  },
  ltcg: async (portfolioId: string, fy?: string): Promise<GainsReport> => {
    const { data } = await api.get<ApiResponse<GainsReport>>(
      '/api/reports/ltcg' + qs({ portfolioId, fy }),
    );
    return unwrap(data);
  },
  schedule112a: async (portfolioId: string, fy?: string): Promise<GainsReport> => {
    const { data } = await api.get<ApiResponse<GainsReport>>(
      '/api/reports/schedule-112a' + qs({ portfolioId, fy }),
    );
    return unwrap(data);
  },
  income: async (portfolioId: string, fy?: string): Promise<IncomeReport> => {
    const { data } = await api.get<ApiResponse<IncomeReport>>(
      '/api/reports/income' + qs({ portfolioId, fy }),
    );
    return unwrap(data);
  },
  unrealised: async (portfolioId: string): Promise<UnrealisedReport> => {
    const { data } = await api.get<ApiResponse<UnrealisedReport>>(
      '/api/reports/unrealised' + qs({ portfolioId }),
    );
    return unwrap(data);
  },
  xirr: async (portfolioId: string): Promise<XirrReport> => {
    const { data } = await api.get<ApiResponse<XirrReport>>(
      '/api/reports/xirr' + qs({ portfolioId }),
    );
    return unwrap(data);
  },
  historical: async (
    portfolioId: string,
    granularity: 'MONTHLY' | 'QUARTERLY' = 'MONTHLY',
  ): Promise<{ points: HistoricalPoint[] }> => {
    const { data } = await api.get<ApiResponse<{ points: HistoricalPoint[] }>>(
      '/api/reports/historical-valuation' + qs({ portfolioId, granularity }),
    );
    return unwrap(data);
  },
  rebuild: async (portfolioId: string): Promise<{ persisted: number }> => {
    const { data } = await api.post<ApiResponse<{ persisted: number }>>(
      '/api/reports/rebuild-capital-gains' + qs({ portfolioId }),
    );
    return unwrap(data);
  },
  downloadUrl: (
    endpoint: 'intraday' | 'stcg' | 'ltcg' | 'schedule-112a' | 'income' | 'unrealised',
    portfolioId: string,
    format: 'xlsx' | 'pdf',
    fy?: string,
  ): string => {
    const base = getApiBaseUrl();
    return `${base}/api/reports/${endpoint}${qs({ portfolioId, fy, format })}`;
  },

  holdingsExportUrl: (
    format: 'pdf' | 'xlsx',
    portfolioIds: string[],
    assetClasses?: string[],
  ): string => {
    const base = getApiBaseUrl();
    return (
      `${base}/api/reports/holdings-export` +
      qs({
        format,
        portfolioIds: portfolioIds.length > 0 ? portfolioIds.join(',') : undefined,
        assetClasses: assetClasses && assetClasses.length > 0 ? assetClasses.join(',') : undefined,
      })
    );
  },

  dashboardExportUrl: (
    format: 'pdf' | 'xlsx',
    scope: 'all' | 'single' | 'per-portfolio',
    portfolioId?: string,
  ): string => {
    const base = getApiBaseUrl();
    return (
      `${base}/api/reports/dashboard-export` +
      qs({ format, scope, portfolioId })
    );
  },
};
