import crypto from 'node:crypto';
import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { getActiveBrokerSession } from '../../../services/brokerOauth/index.js';
import { parseKiteTradingSymbol, resolveLotSize } from '../symbol-parser.js';
import type { BrokerConnector, SyncResult } from './types.js';
import type { FnoNormalizedTrade } from '../types.js';

const KITE_BASE = 'https://api.kite.trade';
const ADAPTER_ID = 'fno.kite.v1';
const ADAPTER_VER = '1';

interface KiteTrade {
  trade_id: string;
  order_id: string;
  exchange: string; // "NFO" | "NSE" | "BFO"
  tradingsymbol: string;
  instrument_token: number;
  transaction_type: 'BUY' | 'SELL';
  product: string;
  average_price: number;
  quantity: number;
  fill_timestamp: string;
  order_timestamp: string;
}

interface KiteMargins {
  equity?: {
    available?: { live_balance?: number; cash?: number };
    utilised?: {
      span?: number;
      exposure?: number;
      option_premium?: number;
      m2m_realised?: number;
      m2m_unrealised?: number;
    };
  };
}

async function kiteGet<T>(apiKey: string, accessToken: string, path: string): Promise<T> {
  const res = await request(`${KITE_BASE}${path}`, {
    method: 'GET',
    headers: {
      authorization: `token ${apiKey}:${accessToken}`,
      'x-kite-version': '3',
    },
  });
  const data = (await res.body.json()) as { status: string; data?: T; message?: string };
  if (res.statusCode >= 300 || data.status !== 'success') {
    throw new Error(data.message || `Kite GET ${path} failed: ${res.statusCode}`);
  }
  return data.data as T;
}

function buildSourceHash(brokerId: string, t: KiteTrade): string {
  return crypto
    .createHash('sha256')
    .update(`fno:${brokerId}:${t.order_id}:${t.trade_id}`)
    .digest('hex');
}

export const kiteFnoConnector: BrokerConnector = {
  brokerId: 'zerodha',
  async syncDay(credentialId: string): Promise<SyncResult> {
    const sess = await getActiveBrokerSession(credentialId);
    if (sess.brokerId !== 'zerodha') throw new Error('Invalid Kite credential');
    const apiKey = sess.apiKey;
    const accessToken = sess.accessToken;

    const trades: FnoNormalizedTrade[] = [];
    try {
      const raw = await kiteGet<KiteTrade[]>(apiKey, accessToken, '/trades');
      for (const t of raw) {
        if (t.exchange !== 'NFO' && t.exchange !== 'BFO') continue;
        const parsed = parseKiteTradingSymbol(t.tradingsymbol);
        if (!parsed) {
          logger.warn({ ts: t.tradingsymbol }, '[fno.kite] could not parse tradingsymbol');
          continue;
        }
        const qty = new Decimal(t.quantity);
        const price = new Decimal(t.average_price);
        const lotSize = await resolveLotSize(parsed);
        const tradeDate = new Date(t.fill_timestamp || t.order_timestamp)
          .toISOString()
          .slice(0, 10);
        trades.push({
          brokerId: 'zerodha',
          side: t.transaction_type,
          underlying: parsed.underlying,
          instrumentType: parsed.instrumentType,
          strikePrice: parsed.strikePrice,
          expiryDate: parsed.expiryDate,
          lotSize,
          quantityContracts: qty.dividedBy(lotSize).toString(),
          pricePerUnit: price.toString(),
          tradeDate,
          orderNo: t.order_id,
          tradeNo: t.trade_id,
          tradingSymbol: t.tradingsymbol,
          exchange: t.exchange === 'BFO' ? 'BFO' : 'NFO',
          sourceHash: buildSourceHash('zerodha', t),
          sourceAdapter: ADAPTER_ID,
          sourceAdapterVer: ADAPTER_VER,
          charges: undefined,
        });
      }
    } catch (err) {
      logger.warn({ err, credentialId }, '[fno.kite] trades fetch failed');
    }

    let margin: SyncResult['margin'] = null;
    try {
      const m = await kiteGet<KiteMargins>(apiKey, accessToken, '/user/margins');
      const eq = m.equity;
      if (eq?.utilised && eq?.available) {
        const span = new Decimal(eq.utilised.span ?? 0);
        const exposure = new Decimal(eq.utilised.exposure ?? 0);
        const total = span.plus(exposure);
        const avail = new Decimal(eq.available.live_balance ?? eq.available.cash ?? 0);
        margin = {
          spanMargin: span.toString(),
          exposureMargin: exposure.toString(),
          totalRequired: total.toString(),
          availableBalance: avail.toString(),
          utilizationPct: avail.isZero()
            ? '0'
            : total.dividedBy(avail.plus(total)).times(100).toString(),
        };
      }
    } catch (err) {
      logger.warn({ err }, '[fno.kite] margin fetch failed');
    }

    await prisma.brokerCredential.update({
      where: { id: credentialId },
      data: { lastSyncedAt: new Date() },
    });

    return { trades, margin };
  },
};
