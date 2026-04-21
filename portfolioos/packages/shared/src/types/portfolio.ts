import type { PortfolioType, AssetClass } from './enums.js';

export interface Portfolio {
  id: string;
  userId: string;
  clientId?: string | null;
  name: string;
  description?: string | null;
  type: PortfolioType;
  currency: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  id: string;
  name: string;
  currentValue: number;
  totalInvestment: number;
  unrealisedPnL: number;
  unrealisedPnLPct: number;
  todaysChange: number;
  todaysChangePct: number;
  xirr: number | null;
  holdingCount: number;
  assetAllocation: AssetAllocationSlice[];
}

export interface AssetAllocationSlice {
  assetClass: AssetClass;
  value: number;
  percent: number;
  holdingCount: number;
}

export interface CreatePortfolioRequest {
  name: string;
  description?: string;
  type?: PortfolioType;
  currency?: string;
  clientId?: string;
  isDefault?: boolean;
}

export interface UpdatePortfolioRequest {
  name?: string;
  description?: string | null;
  type?: PortfolioType;
  currency?: string;
  clientId?: string | null;
  isDefault?: boolean;
}

export interface HoldingRow {
  id: string;
  assetClass: AssetClass;
  assetName: string;
  symbol?: string | null;
  isin?: string | null;
  quantity: number;
  avgCostPrice: number;
  totalCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealisedPnL: number | null;
  unrealisedPnLPct: number | null;
  xirr: number | null;
  holdingPeriodDays: number | null;
}

export interface HistoricalValuationPoint {
  date: string;
  value: number;
  invested: number;
}

export interface CashFlowEntry {
  id: string;
  date: string;
  type: 'INFLOW' | 'OUTFLOW';
  amount: number;
  description?: string | null;
}
