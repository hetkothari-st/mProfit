import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

export type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'All';

// ─── Snapshot payload types ─────────────────────────────────────────

export interface KpiBlock {
  xirrOverall: number | null;
  xirr1y: number | null;
  xirr3y: number | null;
  xirr5y: number | null;
  totalCost: string;
  currentValue: string;
  unrealisedPnL: string;
  realisedYtd: string;
  incomeYtd: string;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: string;
  pct: number;
}

export interface TreemapNode {
  assetClass: string;
  assetName: string;
  value: string;
  pct: number;
}

export interface HoldingRankRow {
  assetName: string;
  assetClass: string;
  totalCost: string;
  currentValue: string;
  pnl: string;
  pnlPct: number;
}

export interface ConcentrationRow {
  assetName: string;
  assetClass: string;
  value: string;
  pct: number;
  cumulativePct: number;
}

export interface SectorSlice {
  sector: string;
  value: string;
  pct: number;
}

export interface CgByFyRow {
  fy: string;
  intraday: string;
  stcg: string;
  ltcg: string;
  total: string;
}

export interface IncomeMonthRow {
  month: string;
  dividend: string;
  interest: string;
  maturity: string;
  total: string;
}

export interface ValuationPoint {
  date: string;
  cost: string;
  value: string;
}

export interface CostValueDriftPoint {
  date: string;
  cost: string;
  value: string;
  driftPct: number;
}

export interface CashflowMonth {
  month: string;
  inflow: string;
  outflow: string;
  net: string;
}

export interface AssetClassXirrRow {
  assetClass: string;
  label: string;
  xirr: number | null;
  invested: string;
  currentValue: string;
}

export interface TaxHarvestSummary {
  unrealisedLoss: string;
  stcgLossAvailable: string;
  ltcgLossAvailable: string;
  realisedStcgInFy: string;
  realisedLtcgInFy: string;
  candidates: Array<{
    portfolioName: string;
    assetName: string;
    assetClass: string;
    unrealisedPnL: string;
    classification: string;
  }>;
}

export interface LiabilitiesVsAssets {
  assets: string;
  liabilities: string;
  netWorth: string;
}

export interface RealisedVsUnrealised {
  realised: string;
  unrealised: string;
}

export interface AnalyticsSnapshot {
  scope: { kind: 'portfolio' | 'user'; id: string };
  period: Period;
  generatedAt: string;
  kpis: KpiBlock;
  allocationByClass: AllocationSlice[];
  allocationTreemap: TreemapNode[];
  topWinnersLosers: { winners: HoldingRankRow[]; losers: HoldingRankRow[] };
  concentrationRisk: ConcentrationRow[];
  sectorAllocation: SectorSlice[];
  cgByFy: CgByFyRow[];
  incomeTrend: IncomeMonthRow[];
  portfolioValueLine: ValuationPoint[];
  costValueDrift: CostValueDriftPoint[];
  cashflowWaterfall: CashflowMonth[];
  assetClassXirr: AssetClassXirrRow[];
  taxHarvest: TaxHarvestSummary;
  liabilitiesVsAssets: LiabilitiesVsAssets;
  realisedVsUnrealised: RealisedVsUnrealised;
}

// ─── Benchmark + risk ───────────────────────────────────────────────

export interface BenchmarkPoint {
  date: string;
  niftyIdx: number | null;
  sensexIdx: number | null;
}
export interface BenchmarkResponse {
  period: Period;
  series: BenchmarkPoint[];
}

export interface RiskMetrics {
  volatilityPct: number | null;
  sharpe: number | null;
  maxDrawdownPct: number | null;
  betaVsNifty: number | null;
  observations: number;
}

// ─── Insights ───────────────────────────────────────────────────────

export type InsightCategory =
  | 'diversification'
  | 'tax_optimisation'
  | 'rebalancing'
  | 'underperformers'
  | 'cash_drag'
  | 'sector_tilt'
  | 'risk_concentration';

export type InsightSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface InsightCard {
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  body: string;
  suggestedAction: string | null;
}

export interface InsightsResultOk {
  ok: true;
  fromCache: boolean;
  generatedAt: string;
  model: string;
  costInr: string;
  cards: InsightCard[];
  narrative: string;
  recommendedAllocation: Record<string, number> | null;
  disclaimer: string;
}

export interface InsightsFailure {
  ok: false;
  reason:
    | 'disabled'
    | 'missing_api_key'
    | 'budget_capped'
    | 'no_data'
    | 'api_error'
    | 'no_tool_use'
    | 'validation_error';
  message: string;
}

export type InsightsResult = InsightsResultOk | InsightsFailure;

export interface BudgetStatus {
  monthToDate: string;
  warnInr: string;
  capInr: string;
  status: 'ok' | 'warn' | 'capped';
}

// ─── Helpers ───────────────────────────────────────────────────────

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

// ─── Client ─────────────────────────────────────────────────────────

export const analyticsApi = {
  async snapshot(portfolioId: string | undefined, period: Period): Promise<AnalyticsSnapshot> {
    const { data } = await api.get<ApiResponse<AnalyticsSnapshot>>(
      '/api/analytics/snapshot' + qs({ portfolioId, period }),
    );
    return unwrap(data);
  },
  async benchmark(period: Period): Promise<BenchmarkResponse> {
    const { data } = await api.get<ApiResponse<BenchmarkResponse>>(
      '/api/analytics/benchmark' + qs({ period }),
    );
    return unwrap(data);
  },
  async risk(portfolioId: string | undefined, period: Period): Promise<RiskMetrics> {
    const { data } = await api.get<ApiResponse<RiskMetrics>>(
      '/api/analytics/risk' + qs({ portfolioId, period }),
    );
    return unwrap(data);
  },
  async insights(portfolioId: string | undefined): Promise<InsightsResult | null> {
    const { data } = await api.get<ApiResponse<InsightsResult | null>>(
      '/api/analytics/insights' + qs({ portfolioId }),
    );
    return unwrap(data);
  },
  async generateInsights(
    portfolioId: string | undefined,
    period: Period,
    force = false,
  ): Promise<InsightsResult> {
    const { data } = await api.post<ApiResponse<InsightsResult>>(
      '/api/analytics/insights/generate' + qs({ portfolioId }),
      { period, force },
    );
    return unwrap(data);
  },
  async insightsSpend(): Promise<BudgetStatus> {
    const { data } = await api.get<ApiResponse<BudgetStatus>>(
      '/api/analytics/insights/spend',
    );
    return unwrap(data);
  },
};
