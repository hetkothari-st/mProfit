import crypto from 'node:crypto';
import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { createTransaction } from '../services/transaction.service.js';
import type { AssetClass, TransactionType } from '@prisma/client';

const KITE_BASE = 'https://api.kite.trade';

export interface KiteSessionResult {
  access_token: string;
  public_token: string;
  user_id: string;
  user_name: string;
  email: string;
}

export function buildKiteLoginUrl(): string {
  if (!env.KITE_API_KEY) throw new Error('KITE_API_KEY not configured');
  return `https://kite.trade/connect/login?api_key=${env.KITE_API_KEY}&v=3`;
}

export async function exchangeKiteRequestToken(requestToken: string): Promise<KiteSessionResult> {
  if (!env.KITE_API_KEY || !env.KITE_API_SECRET) {
    throw new Error('Kite credentials not configured');
  }
  const checksum = crypto
    .createHash('sha256')
    .update(env.KITE_API_KEY + requestToken + env.KITE_API_SECRET)
    .digest('hex');
  const body = new URLSearchParams({
    api_key: env.KITE_API_KEY,
    request_token: requestToken,
    checksum,
  });
  const res = await request(`${KITE_BASE}/session/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-kite-version': '3',
    },
    body: body.toString(),
  });
  const data = (await res.body.json()) as { status: string; data?: KiteSessionResult; message?: string };
  if (res.statusCode >= 300 || data.status !== 'success' || !data.data) {
    throw new Error(data.message || `Kite token exchange failed: ${res.statusCode}`);
  }
  return data.data;
}

async function kiteGet<T>(accessToken: string, path: string): Promise<T> {
  if (!env.KITE_API_KEY) throw new Error('KITE_API_KEY not configured');
  const res = await request(`${KITE_BASE}${path}`, {
    method: 'GET',
    headers: {
      authorization: `token ${env.KITE_API_KEY}:${accessToken}`,
      'x-kite-version': '3',
    },
  });
  const data = (await res.body.json()) as { status: string; data?: T; message?: string };
  if (res.statusCode >= 300 || data.status !== 'success') {
    throw new Error(data.message || `Kite GET ${path} failed: ${res.statusCode}`);
  }
  return data.data as T;
}

interface KiteTrade {
  trade_id: string;
  order_id: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  transaction_type: 'BUY' | 'SELL';
  product: string;
  average_price: number;
  quantity: number;
  fill_timestamp: string;
  order_timestamp: string;
  exchange_timestamp: string;
}

interface KiteHolding {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  isin: string;
  product: string;
  price: number;
  quantity: number;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

export async function fetchKiteTodayTrades(accessToken: string): Promise<KiteTrade[]> {
  return await kiteGet<KiteTrade[]>(accessToken, '/trades');
}

export async function fetchKiteHoldings(accessToken: string): Promise<KiteHolding[]> {
  return await kiteGet<KiteHolding[]>(accessToken, '/portfolio/holdings');
}

export async function saveKiteSession(
  userId: string,
  portfolioId: string | null,
  session: KiteSessionResult,
): Promise<string> {
  const existing = await prisma.brokerAccount.findFirst({
    where: { userId, provider: 'ZERODHA_KITE', publicUserId: session.user_id },
  });
  if (existing) {
    await prisma.brokerAccount.update({
      where: { id: existing.id },
      data: {
        accessTokenEnc: encryptSecret(session.access_token),
        status: 'CONNECTED',
        lastError: null,
        portfolioId,
      },
    });
    return existing.id;
  }
  const created = await prisma.brokerAccount.create({
    data: {
      userId,
      portfolioId,
      provider: 'ZERODHA_KITE',
      label: `Kite: ${session.user_name}`,
      apiKey: env.KITE_API_KEY ?? null,
      accessTokenEnc: encryptSecret(session.access_token),
      publicUserId: session.user_id,
      status: 'CONNECTED',
    },
  });
  return created.id;
}

export async function syncKiteAccount(accountId: string): Promise<{
  tradesImported: number;
  holdingsFetched: number;
}> {
  const acc = await prisma.brokerAccount.findUnique({ where: { id: accountId } });
  if (!acc || acc.provider !== 'ZERODHA_KITE' || !acc.accessTokenEnc) {
    throw new Error('Invalid Kite account');
  }
  const accessToken = decryptSecret(acc.accessTokenEnc);

  let portfolioId = acc.portfolioId;
  if (!portfolioId) {
    const defaultP = await prisma.portfolio.findFirst({
      where: { userId: acc.userId, isDefault: true },
    });
    portfolioId = defaultP?.id ?? null;
    if (!portfolioId) {
      const anyP = await prisma.portfolio.findFirst({ where: { userId: acc.userId } });
      portfolioId = anyP?.id ?? null;
    }
  }
  if (!portfolioId) throw new Error('No target portfolio for Kite sync');

  let tradesImported = 0;
  try {
    const trades = await fetchKiteTodayTrades(accessToken);
    for (const t of trades) {
      // Skip if already imported (tradeNo match)
      const existing = await prisma.transaction.findFirst({
        where: { portfolioId, tradeNo: t.trade_id },
      });
      if (existing) continue;

      const assetClass: AssetClass = 'EQUITY';
      const transactionType: TransactionType = t.transaction_type === 'BUY' ? 'BUY' : 'SELL';
      const qty = new Decimal(t.quantity);
      const price = new Decimal(t.average_price);

      const tradeDateIso = new Date(t.fill_timestamp || t.order_timestamp)
        .toISOString()
        .slice(0, 10);
      await createTransaction(acc.userId, {
        portfolioId,
        assetClass,
        transactionType,
        stockSymbol: t.tradingsymbol,
        exchange: (t.exchange === 'NSE' || t.exchange === 'BSE') ? t.exchange : 'NSE',
        tradeDate: tradeDateIso,
        quantity: qty.toString(),
        price: price.toString(),
        broker: 'Zerodha',
        tradeNo: t.trade_id,
        orderNo: t.order_id,
      });
      tradesImported++;
    }
  } catch (err) {
    logger.warn({ err, accountId }, '[kite] trades fetch failed');
  }

  let holdingsFetched = 0;
  try {
    const holdings = await fetchKiteHoldings(accessToken);
    holdingsFetched = holdings.length;
    // Holdings are informational for now; trades already drive our holdings engine
  } catch (err) {
    logger.warn({ err, accountId }, '[kite] holdings fetch failed');
  }

  await prisma.brokerAccount.update({
    where: { id: acc.id },
    data: { lastSyncAt: new Date(), lastError: null },
  });

  return { tradesImported, holdingsFetched };
}

export async function disconnectKite(accountId: string): Promise<void> {
  await prisma.brokerAccount.update({
    where: { id: accountId },
    data: { accessTokenEnc: null, status: 'DISABLED' },
  });
}
