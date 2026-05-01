import crypto from 'node:crypto';
import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { getActiveBrokerSession } from '../../../services/brokerOauth/index.js';
import { parseKiteTradingSymbol, resolveLotSize } from '../symbol-parser.js';
import type { BrokerConnector, SyncResult } from './types.js';
import type { FnoNormalizedTrade } from '../types.js';

/**
 * Upstox v2 REST adapter.
 *   GET /v2/order/trades/get-trades-for-day  (today's trades)
 *   GET /v2/user/get-funds-and-margin
 * Auth: Bearer access token.
 */

const UPSTOX_BASE = 'https://api.upstox.com';
const ADAPTER_ID = 'fno.upstox.v1';
const ADAPTER_VER = '1';

interface UpstoxTrade {
  exchange: string;        // "NSE_FO" | "BSE_FO" | "NSE_EQ"
  product: string;
  tradingsymbol: string;
  trade_id: string;
  order_id: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  average_price: number;
  trade_timestamp: string; // ISO8601
}

async function upstoxGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await request(`${UPSTOX_BASE}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'api-version': '2.0',
    },
  });
  const data = (await res.body.json()) as { status: string; data?: T; errors?: unknown };
  if (res.statusCode >= 300 || data.status !== 'success') {
    throw new Error(`Upstox GET ${path} failed: ${res.statusCode}`);
  }
  return data.data as T;
}

function buildSourceHash(t: UpstoxTrade): string {
  return crypto
    .createHash('sha256')
    .update(`fno:upstox:${t.order_id}:${t.trade_id}`)
    .digest('hex');
}

export const upstoxFnoConnector: BrokerConnector = {
  brokerId: 'upstox',
  async syncDay(credentialId: string): Promise<SyncResult> {
    const sess = await getActiveBrokerSession(credentialId);
    if (sess.brokerId !== 'upstox') throw new Error('Invalid Upstox credential');
    const accessToken = sess.accessToken;

    const trades: FnoNormalizedTrade[] = [];
    try {
      const raw = await upstoxGet<UpstoxTrade[]>(
        accessToken,
        '/v2/order/trades/get-trades-for-day',
      );
      for (const t of raw) {
        if (!t.exchange.endsWith('_FO')) continue;
        const parsed = parseKiteTradingSymbol(t.tradingsymbol);
        if (!parsed) continue;
        const qty = new Decimal(t.quantity);
        const price = new Decimal(t.average_price);
        const lotSize = await resolveLotSize(parsed);
        trades.push({
          brokerId: 'upstox',
          side: t.transaction_type,
          underlying: parsed.underlying,
          instrumentType: parsed.instrumentType,
          strikePrice: parsed.strikePrice,
          expiryDate: parsed.expiryDate,
          lotSize,
          quantityContracts: qty.dividedBy(lotSize).toString(),
          pricePerUnit: price.toString(),
          tradeDate: new Date(t.trade_timestamp).toISOString().slice(0, 10),
          orderNo: t.order_id,
          tradeNo: t.trade_id,
          tradingSymbol: t.tradingsymbol,
          exchange: t.exchange === 'BSE_FO' ? 'BFO' : 'NFO',
          sourceHash: buildSourceHash(t),
          sourceAdapter: ADAPTER_ID,
          sourceAdapterVer: ADAPTER_VER,
        });
      }
    } catch (err) {
      logger.warn({ err }, '[fno.upstox] trades fetch failed');
    }

    let margin: SyncResult['margin'] = null;
    try {
      const m = await upstoxGet<{ equity?: { used_margin?: number; available_margin?: number } }>(
        accessToken,
        '/v2/user/get-funds-and-margin?segment=SEC',
      );
      const used = new Decimal(m.equity?.used_margin ?? 0);
      const avail = new Decimal(m.equity?.available_margin ?? 0);
      margin = {
        spanMargin: used.toString(),
        exposureMargin: '0',
        totalRequired: used.toString(),
        availableBalance: avail.toString(),
        utilizationPct: avail.isZero()
          ? '0'
          : used.dividedBy(avail.plus(used)).times(100).toString(),
      };
    } catch (err) {
      logger.warn({ err }, '[fno.upstox] margin fetch failed');
    }

    await prisma.brokerCredential.update({
      where: { id: credentialId },
      data: { lastSyncedAt: new Date() },
    });
    return { trades, margin };
  },
};
