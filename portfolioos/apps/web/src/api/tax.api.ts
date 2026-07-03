import { api } from './client';
import { getApiBaseUrl } from './baseUrl';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

export interface TaxSummary {
  financialYear: string;
  rates: {
    stcgEquityPct: number;
    ltcgEquityPct: number;
    ltcgEquityExemption: string;
    ltcgOtherIndexedPct: number;
    ltcgOtherNonIndexedPct: number;
    slabPct: number;
  };
  capitalGains: {
    section111A_stcgEquity: { gain: string; tax: string };
    section112A_ltcgEquity: { gain: string; exemption: string; taxable: string; tax: string };
    section112_ltcgOther: { gain: string; taxable: string; tax: string };
    stcgOther: { gain: string; tax: string };
    intradaySpeculative: { gain: string; tax: string };
  };
  fnoBusinessIncome: { netPnl: string; turnover: string; tax: string; auditApplicable: boolean };
  otherIncome: { dividend: string; interest: string; maturity: string };
  totalRealisedGain: string;
  totalEstimatedTax: string;
  availableFys: string[];
}

export interface TaxCapitalGainRow {
  portfolioId: string;
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

export interface TaxGainsReport {
  rows: TaxCapitalGainRow[];
  totalGain: string;
  taxable?: string;
  exemptionLimit?: string;
  ratePct?: number;
  estimatedTax?: string;
  count: number;
}

export interface TaxIncomeReport {
  rows: Array<{
    id: string;
    date: string;
    type: string;
    assetName: string;
    portfolioName: string;
    amount: string;
    narration: string | null;
  }>;
  dividend: string;
  interest: string;
  maturity: string;
  total: string;
  count: number;
}

export interface Schedule43Report {
  financialYear: string;
  nonSpeculative: {
    grossProfit: string;
    grossLoss: string;
    netPnl: string;
    turnover: string;
    tradeCount: number;
  };
  taxAuditApplicable: boolean;
  taxAuditNote: string;
  perInstrumentRows: Array<{
    underlying: string;
    instrumentType: string;
    strikePrice: string | null;
    expiryDate: string;
    side: string;
    realizedPnl: string;
    turnover: string;
    closedTradeCount: number;
  }>;
}

export interface TaxHarvestReport {
  rows: Array<{
    portfolioId: string;
    portfolioName: string;
    assetClass: string;
    assetName: string;
    isin: string | null;
    quantity: string;
    avgCostPrice: string;
    currentPrice: string | null;
    totalCost: string;
    currentValue: string;
    unrealisedPnL: string;
    pctReturn: string;
    longTermEligible: boolean;
    classification: 'STCG_LOSS' | 'LTCG_LOSS' | 'STCG_GAIN' | 'LTCG_GAIN';
  }>;
  totals: {
    unrealisedLoss: string;
    stcgLossAvailable: string;
    ltcgLossAvailable: string;
    realisedStcgInFy: string;
    realisedLtcgInFy: string;
  };
  count: number;
}

export interface GrandfatheringRow {
  isin: string | null;
  assetName: string;
  buyDate: string;
  sellDate: string;
  quantity: string;
  buyAmount: string; // actual cost basis
  sellAmount: string;
  gainLoss: string; // uncorrected
  fmvPerUnit: string | null;
  fmvSource: 'SEED' | 'USER' | null;
  fmvTotalBasis: string | null;
  adjustedCostBasis: string | null;
  correctedGain: string | null;
  correctedTaxableGain: string | null;
  gainDifference: string | null; // tax saving vs uncorrected
  needsUserInput: boolean;
  financialYear: string;
}

export interface GrandfatheringReport {
  rows: GrandfatheringRow[];
  summary: {
    totalCorrectedGain: string;
    totalUncorrectedGain: string;
    totalTaxSaving: string; // positive = corrected is lower (saves tax)
    rowsNeedingInput: number;
  };
  count: number;
}

export interface FmvOverride {
  isin: string;
  scripName: string | null;
  fmvPerUnit: string;
  source: 'SEED' | 'USER';
}

export const taxApi = {
  availableFys: async (): Promise<{ fys: string[] }> => {
    const { data } = await api.get<ApiResponse<{ fys: string[] }>>('/api/tax/available-fys');
    return unwrap(data);
  },
  summary: async (fy: string): Promise<TaxSummary> => {
    const { data } = await api.get<ApiResponse<TaxSummary>>('/api/tax/summary' + qs({ fy }));
    return unwrap(data);
  },
  stcg: async (fy?: string): Promise<TaxGainsReport> => {
    const { data } = await api.get<ApiResponse<TaxGainsReport>>('/api/tax/stcg' + qs({ fy }));
    return unwrap(data);
  },
  ltcg: async (fy?: string): Promise<TaxGainsReport> => {
    const { data } = await api.get<ApiResponse<TaxGainsReport>>('/api/tax/ltcg' + qs({ fy }));
    return unwrap(data);
  },
  intraday: async (fy?: string): Promise<TaxGainsReport> => {
    const { data } = await api.get<ApiResponse<TaxGainsReport>>('/api/tax/intraday' + qs({ fy }));
    return unwrap(data);
  },
  schedule112A: async (fy?: string): Promise<TaxGainsReport> => {
    const { data } = await api.get<ApiResponse<TaxGainsReport>>('/api/tax/schedule-112a' + qs({ fy }));
    return unwrap(data);
  },
  schedule112: async (fy?: string): Promise<TaxGainsReport> => {
    const { data } = await api.get<ApiResponse<TaxGainsReport>>('/api/tax/schedule-112' + qs({ fy }));
    return unwrap(data);
  },
  schedule43: async (fy: string): Promise<Schedule43Report> => {
    const { data } = await api.get<ApiResponse<Schedule43Report>>('/api/tax/schedule-43' + qs({ fy }));
    return unwrap(data);
  },
  income: async (fy?: string): Promise<TaxIncomeReport> => {
    const { data } = await api.get<ApiResponse<TaxIncomeReport>>('/api/tax/income' + qs({ fy }));
    return unwrap(data);
  },
  harvest: async (fy?: string): Promise<TaxHarvestReport> => {
    const { data } = await api.get<ApiResponse<TaxHarvestReport>>('/api/tax/harvest' + qs({ fy }));
    return unwrap(data);
  },
  schedule112ACsvUrl: (fy: string): string => {
    return `${getApiBaseUrl()}/api/tax/schedule-112a.csv${qs({ fy })}`;
  },
  grandfathering: async (fy?: string): Promise<GrandfatheringReport> => {
    const { data } = await api.get<
      ApiResponse<{ rows: GrandfatheringRow[]; summary: Omit<GrandfatheringReport['summary'], 'rowsNeedingInput'>; count: number }>
    >('/api/tax/grandfathering' + qs({ fy }));
    const report = unwrap(data);
    // Backend summary doesn't carry rowsNeedingInput — derive it from rows
    // rather than round-tripping for a count already implied by the payload.
    return {
      ...report,
      summary: {
        ...report.summary,
        rowsNeedingInput: report.rows.filter((r) => r.needsUserInput).length,
      },
    };
  },
  fmvOverrides: async (): Promise<FmvOverride[]> => {
    const { data } = await api.get<ApiResponse<{ records: FmvOverride[]; count: number }>>(
      '/api/tax/fmv-overrides',
    );
    return unwrap(data).records;
  },
  putFmvOverride: async (isin: string, fmvPerUnit: string, scripName?: string): Promise<FmvOverride> => {
    const { data } = await api.put<ApiResponse<FmvOverride>>(
      `/api/tax/fmv-overrides/${encodeURIComponent(isin)}`,
      { fmvPerUnit, scripName },
    );
    return unwrap(data);
  },
  deleteFmvOverride: async (isin: string): Promise<void> => {
    await api.delete(`/api/tax/fmv-overrides/${encodeURIComponent(isin)}`);
  },
  grandfatheringCsvUrl: (fy: string): string => {
    return `${getApiBaseUrl()}/api/tax/grandfathering.csv${qs({ fy })}`;
  },
};
