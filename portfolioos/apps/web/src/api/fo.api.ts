import { api } from './client';

export interface FoPosition {
  id: string;
  portfolioId: string;
  assetKey: string;
  underlying: string;
  instrumentType: 'FUTURES' | 'CALL' | 'PUT';
  strikePrice: string | null;
  expiryDate: string;
  lotSize: number;
  status: 'OPEN' | 'CLOSED' | 'PENDING_EXPIRY_APPROVAL' | 'EXPIRED_WORTHLESS' | 'EXERCISED';
  netQuantity: string;
  openLots: Array<{ qty: string; price: string; tradeDate: string; txId: string; side: 'BUY' | 'SELL' }>;
  avgEntryPrice: string;
  totalCost: string;
  realizedPnl: string;
  unrealizedPnl: string | null;
  mtmPrice: string | null;
  closedAt: string | null;
  closeReason: string | null;
  computedAt: string;
}

export interface FoTrade {
  id: string;
  assetClass: 'FUTURES' | 'OPTIONS';
  transactionType: 'BUY' | 'SELL';
  assetName: string | null;
  tradeDate: string;
  quantity: string;
  price: string;
  netAmount: string;
  strikePrice: string | null;
  expiryDate: string | null;
  optionType: 'CALL' | 'PUT' | null;
  lotSize: number | null;
  broker: string | null;
}

export interface FoSummary {
  openCount: number;
  closedCount: number;
  totalRealizedPnl: string;
  totalUnrealizedPnl: string;
  exposureByUnderlying: Record<string, number>;
  expiringSoon: Array<{ assetKey: string; underlying: string; expiryDate: string }>;
}

export interface FoPnlRow {
  underlying: string;
  instrumentType: string;
  strikePrice: string | null;
  expiryDate: string;
  side: 'INTRADAY' | 'POSITIONAL';
  taxBucket: 'SPECULATIVE' | 'NON_SPECULATIVE';
  realizedPnl: string;
  turnover: string;
  closedTradeCount: number;
  financialYear: string;
}

export interface OptionChainSnapshot {
  underlying: string;
  underlyingValue: number;
  expiryDate: string;
  expiryDates: string[];
  strikes: Array<{
    strike: number;
    ce?: { ltp: number; bid: number; ask: number; iv: number | null; oi: number; volume: number };
    pe?: { ltp: number; bid: number; ask: number; iv: number | null; oi: number; volume: number };
    ceGreeks?: { delta: number; gamma: number; theta: number; vega: number };
    peGreeks?: { delta: number; gamma: number; theta: number; vega: number };
  }>;
}

export const foApi = {
  positions: (portfolioId?: string, status?: string) =>
    api.get<{ data: FoPosition[] }>('/api/fo/positions', { params: { portfolioId, status } })
      .then((r) => r.data.data),
  trades: (portfolioId?: string) =>
    api.get<{ data: FoTrade[] }>('/api/fo/trades', { params: { portfolioId } })
      .then((r) => r.data.data),
  pnl: (portfolioId?: string) =>
    api.get<{ data: { rows: FoPnlRow[]; summaryByFy: Record<string, { speculativePnl: string; nonSpeculativePnl: string; totalPnl: string; turnover: string; grossProfit: string; grossLoss: string; tradeCount: number }> } }>(
      '/api/fo/pnl',
      { params: { portfolioId } },
    ).then((r) => r.data.data),
  summary: (portfolioId?: string) =>
    api.get<{ data: FoSummary }>('/api/fo/summary', { params: { portfolioId } })
      .then((r) => r.data.data),
  optionChain: (symbol: string) =>
    api.get<{ data: OptionChainSnapshot | null }>('/api/fo/option-chain', { params: { symbol } })
      .then((r) => r.data.data),
  margin: (portfolioId?: string) =>
    api.get<{ data: Array<{ snapshotDate: string; spanMargin: string; exposureMargin: string; totalRequired: string; availableBalance: string; utilizationPct: string; source: string }> }>(
      '/api/fo/margin',
      { params: { portfolioId } },
    ).then((r) => r.data.data),
  expiryJobs: (status?: string) =>
    api.get<{ data: Array<{ id: string; underlying?: string; expiryDate: string; openQty: string; settlementPrice: string | null; status: string; createdAt: string }> }>(
      '/api/fo/expiry-jobs',
      { params: { status } },
    ).then((r) => r.data.data),
  approveExpiry: (id: string) => api.post(`/api/fo/expiry-jobs/${id}/approve`),
  rejectExpiry: (id: string) => api.post(`/api/fo/expiry-jobs/${id}/reject`),
  recompute: (portfolioId: string) => api.post('/api/fo/recompute', { portfolioId }),
  refreshLive: (portfolioId?: string) =>
    api.post<{ data: { updated: number; total: number } }>(
      '/api/fo/refresh-live',
      undefined,
      { params: { portfolioId } },
    ).then((r) => r.data.data),
  syncBroker: (brokerId: 'zerodha' | 'upstox' | 'angel', portfolioId: string) =>
    api.post('/api/fo/sync-broker', { brokerId, portfolioId }),
  updateSetting: (
    portfolioId: string,
    body: { autoApproveExpiryClose?: boolean; defaultEquityTaxTreatment?: 'CAPITAL_GAINS' | 'BUSINESS_INCOME' },
  ) => api.patch(`/api/fo/settings/${portfolioId}`, body),
};

export type BrokerId = 'zerodha' | 'upstox' | 'angel';

export interface BrokerStatus {
  brokerId?: BrokerId;
  configured: boolean;
  connected: boolean;
  needsLogin: boolean;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
}

export const brokerApi = {
  status: (brokerId?: BrokerId) =>
    api.get<{ data: BrokerStatus | BrokerStatus[] }>(
      brokerId ? `/api/fo/brokers/${brokerId}/status` : '/api/fo/brokers/status',
    ).then((r) => r.data.data),
  redirectInfo: (brokerId: BrokerId) =>
    api.get<{ data: { brokerId: BrokerId; redirectUri: string; frontendCallbackHint: string } }>(
      `/api/fo/brokers/${brokerId}/redirect-info`,
    ).then((r) => r.data.data),
  setup: (input: {
    brokerId: BrokerId;
    apiKey: string;
    apiSecret?: string;
    redirectUri?: string;
    clientCode?: string;
    password?: string;
    totpSecret?: string;
  }) => api.post<{ data: { id: string; needsLogin: boolean } }>('/api/fo/brokers/setup', input).then((r) => r.data.data),
  startOauth: (brokerId: BrokerId) =>
    api.post<{ data: { url: string; state: string; brokerId: BrokerId } }>(
      `/api/fo/brokers/${brokerId}/oauth/start`,
    ).then((r) => r.data.data),
  refresh: (brokerId: BrokerId) =>
    api.post<{ data: BrokerStatus }>(`/api/fo/brokers/${brokerId}/refresh`).then((r) => r.data.data),
  disconnect: (brokerId: BrokerId) =>
    api.delete(`/api/fo/brokers/${brokerId}`),
};
