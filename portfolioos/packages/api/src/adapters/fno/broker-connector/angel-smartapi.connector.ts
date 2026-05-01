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
 * Angel One SmartAPI adapter.
 *   POST /rest/secure/angelbroking/order/v1/getTradeBook
 *   POST /rest/secure/angelbroking/user/v1/getRMS  (margin)
 * Auth: Bearer JWT + X-PrivateKey + client codes in headers.
 */

const ANGEL_BASE = 'https://apiconnect.angelone.in';
const ADAPTER_ID = 'fno.angel.v1';
const ADAPTER_VER = '1';

interface AngelTrade {
  exchange: string; // "NFO" | "BFO" | "NSE"
  tradingsymbol: string;
  symboltoken: string;
  producttype: string;
  transactiontype: 'BUY' | 'SELL';
  fillsize: string;       // qty
  fillprice: string;      // avg
  filltime: string;       // "HH:MM:SS"
  orderid: string;
  fillid: string;
  exchangeorderid: string;
  exchangetimestamp: string; // "DD-MM-YYYY HH:MM:SS"
}

async function angelPost<T>(accessToken: string, apiKey: string, path: string, body: unknown): Promise<T> {
  const res = await request(`${ANGEL_BASE}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-PrivateKey': apiKey,
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': '127.0.0.1',
      'X-MACAddress': '00:00:00:00:00:00',
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.body.json()) as { status: boolean; data?: T; message?: string };
  if (res.statusCode >= 300 || !data.status) {
    throw new Error(data.message || `Angel POST ${path} failed: ${res.statusCode}`);
  }
  return data.data as T;
}

function buildSourceHash(t: AngelTrade): string {
  return crypto
    .createHash('sha256')
    .update(`fno:angel:${t.orderid}:${t.fillid}`)
    .digest('hex');
}

function parseAngelTimestamp(s: string): string {
  // "26-11-2026 15:23:45" → "2026-11-26"
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return new Date().toISOString().slice(0, 10);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export const angelFnoConnector: BrokerConnector = {
  brokerId: 'angel',
  async syncDay(credentialId: string): Promise<SyncResult> {
    const sess = await getActiveBrokerSession(credentialId);
    if (sess.brokerId !== 'angel') throw new Error('Invalid Angel credential');
    const accessToken = sess.accessToken;
    const apiKey = sess.apiKey;

    const trades: FnoNormalizedTrade[] = [];
    try {
      const raw = await angelPost<AngelTrade[]>(
        accessToken,
        apiKey,
        '/rest/secure/angelbroking/order/v1/getTradeBook',
        {},
      );
      for (const t of raw) {
        if (t.exchange !== 'NFO' && t.exchange !== 'BFO') continue;
        const parsed = parseKiteTradingSymbol(t.tradingsymbol);
        if (!parsed) continue;
        const qty = new Decimal(t.fillsize);
        const price = new Decimal(t.fillprice);
        const lotSize = await resolveLotSize(parsed);
        trades.push({
          brokerId: 'angel',
          side: t.transactiontype,
          underlying: parsed.underlying,
          instrumentType: parsed.instrumentType,
          strikePrice: parsed.strikePrice,
          expiryDate: parsed.expiryDate,
          lotSize,
          quantityContracts: qty.dividedBy(lotSize).toString(),
          pricePerUnit: price.toString(),
          tradeDate: parseAngelTimestamp(t.exchangetimestamp),
          orderNo: t.orderid,
          tradeNo: t.fillid,
          tradingSymbol: t.tradingsymbol,
          exchange: t.exchange === 'BFO' ? 'BFO' : 'NFO',
          sourceHash: buildSourceHash(t),
          sourceAdapter: ADAPTER_ID,
          sourceAdapterVer: ADAPTER_VER,
        });
      }
    } catch (err) {
      logger.warn({ err }, '[fno.angel] trades fetch failed');
    }

    let margin: SyncResult['margin'] = null;
    try {
      const r = await angelPost<{
        net?: string;
        availablecash?: string;
        availableintradaypayin?: string;
        utiliseddebits?: string;
        utilisedspan?: string;
        utilisedexposure?: string;
      }>(accessToken, apiKey, '/rest/secure/angelbroking/user/v1/getRMS', {});
      const span = new Decimal(r.utilisedspan ?? '0');
      const exposure = new Decimal(r.utilisedexposure ?? '0');
      const avail = new Decimal(r.availablecash ?? r.net ?? '0');
      const total = span.plus(exposure);
      margin = {
        spanMargin: span.toString(),
        exposureMargin: exposure.toString(),
        totalRequired: total.toString(),
        availableBalance: avail.toString(),
        utilizationPct: avail.isZero()
          ? '0'
          : total.dividedBy(avail.plus(total)).times(100).toString(),
      };
    } catch (err) {
      logger.warn({ err }, '[fno.angel] margin fetch failed');
    }

    await prisma.brokerCredential.update({
      where: { id: credentialId },
      data: { lastSyncedAt: new Date() },
    });
    return { trades, margin };
  },
};
