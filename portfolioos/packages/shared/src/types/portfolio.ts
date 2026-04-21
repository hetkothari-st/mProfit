import type { PortfolioType, AssetClass } from './enums.js';
import type { Money, Quantity } from '../decimal.js';

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
  currentValue: Money;
  totalInvestment: Money;
  unrealisedPnL: Money;
  // Percent fields are dimensionless; small rounding on display is fine.
  unrealisedPnLPct: number;
  todaysChange: Money;
  todaysChangePct: number;
  xirr: number | null;
  holdingCount: number;
  assetAllocation: AssetAllocationSlice[];
}

export interface AssetAllocationSlice {
  assetClass: AssetClass;
  value: Money;
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
  quantity: Quantity;
  avgCostPrice: Money;
  totalCost: Money;
  currentPrice: Money | null;
  currentValue: Money | null;
  unrealisedPnL: Money | null;
  unrealisedPnLPct: number | null;
  xirr: number | null;
  holdingPeriodDays: number | null;
}

export interface HistoricalValuationPoint {
  date: string;
  value: Money;
  invested: Money;
}

export interface CashFlowEntry {
  id: string;
  date: string;
  type: 'INFLOW' | 'OUTFLOW';
  amount: Money;
  description?: string | null;
}
