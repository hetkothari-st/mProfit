/**
 * F&O ingestion adapter framework.
 *
 * The 25-broker problem is solved by THREE tiers, in priority order:
 *   1. BrokerConnector — official API integration (Kite, Upstox, Angel).
 *      Real-time trades + positions + margin. ZERO LLM cost.
 *   2. Universal LLM contract-note adapter — handles any broker's PDF/email
 *      using the Phase 5-A LLM pipeline with F&O extensions.
 *   3. Per-normalizer broker adapters — when the LLM consistently mis-parses
 *      a known broker's quirky format. Optional.
 *
 * Every layer ultimately produces `FnoNormalizedTrade` rows that flow into
 * `transaction.service.createTransaction` with assetClass=FUTURES|OPTIONS,
 * which in turn triggers `recomputeDerivativePosition`.
 */

import type { FoInstrumentType } from '@prisma/client';

export interface FnoNormalizedTrade {
  brokerId: string;            // "zerodha" | "upstox" | "angel" | "generic"
  side: 'BUY' | 'SELL';
  underlying: string;          // e.g. "NIFTY"
  instrumentType: FoInstrumentType;
  strikePrice: string | null;  // null for futures
  expiryDate: string;          // YYYY-MM-DD
  lotSize: number;
  quantityContracts: string;   // # contracts (NOT total units)
  pricePerUnit: string;        // premium for option, future price for fut
  tradeDate: string;           // YYYY-MM-DD
  charges?: {
    brokerage?: string;
    stt?: string;
    stampDuty?: string;
    exchangeCharges?: string;
    gst?: string;
    sebiCharges?: string;
  };
  orderNo?: string;
  tradeNo?: string;
  tradingSymbol?: string;
  exchange?: 'NFO' | 'BFO';
  /** Deterministic dedup key per row. */
  sourceHash: string;
  sourceAdapter: string;       // e.g. "fno.kite.v1", "fno.universal_llm.v1"
  sourceAdapterVer: string;
}
