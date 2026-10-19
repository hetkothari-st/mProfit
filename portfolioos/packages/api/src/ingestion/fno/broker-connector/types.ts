import type { FnoNormalizedTrade } from '../types.js';

export interface SyncResult {
  trades: FnoNormalizedTrade[];
  margin?: {
    spanMargin: string;
    exposureMargin: string;
    totalRequired: string;
    availableBalance: string;
    utilizationPct: string;
  } | null;
}

export interface BrokerConnector {
  brokerId: 'zerodha' | 'upstox' | 'angel';
  /** Fetch *today's* F&O trades + current margin. Idempotent: every trade
   * carries a deterministic sourceHash. */
  syncDay(credentialId: string): Promise<SyncResult>;
}
