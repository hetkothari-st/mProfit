import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { yahooQuoteRaw } from './yahooClient.js';
import type { CommodityType } from '@prisma/client';

/**
 * Gold/Silver spot pricing strategy.
 * Primary: IBJA (India Bullion and Jewellers Association) rates — the canonical
 * India spot source but they publish via a website, not JSON. So we use a
 * pragmatic proxy: yahoo-finance `GOLDBEES.NS` (SBI Gold ETF) / `SILVERBEES.NS`
 * as INR-denominated market proxies, plus `GC=F` / `SI=F` futures for USD spot.
 */

const PROXIES: Record<CommodityType, { yahooInr: string; yahooUsd: string }> = {
  GOLD: { yahooInr: 'GOLDBEES.NS', yahooUsd: 'GC=F' },
  SILVER: { yahooInr: 'SILVERBEES.NS', yahooUsd: 'SI=F' },
  PLATINUM: { yahooInr: 'PL=F', yahooUsd: 'PL=F' },
};

export async function fetchCommoditySpotInr(
  commodity: CommodityType,
): Promise<Decimal | null> {
  const sym = PROXIES[commodity].yahooInr;
  const arr = await yahooQuoteRaw([sym]);
  const q = arr[0];
  if (q && typeof q.regularMarketPrice === 'number') {
    return new Decimal(q.regularMarketPrice);
  }
  return null;
}

export interface CommoditySyncResult {
  commodity: CommodityType;
  price: number | null;
  stored: boolean;
}

export async function syncCommodityPrice(
  commodity: CommodityType,
): Promise<CommoditySyncResult> {
  const price = await fetchCommoditySpotInr(commodity);
  if (!price) return { commodity, price: null, stored: false };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.commodityPrice.upsert({
    where: {
      commodity_date_unit: {
        commodity,
        date: today,
        unit: 'PROXY_ETF',
      },
    },
    update: { price },
    create: {
      commodity,
      date: today,
      price,
      unit: 'PROXY_ETF',
      source: 'YAHOO_ETF_PROXY',
    },
  });

  return { commodity, price: price.toNumber(), stored: true };
}

export async function syncAllCommodities(): Promise<CommoditySyncResult[]> {
  const commodities: CommodityType[] = ['GOLD', 'SILVER', 'PLATINUM'];
  const symbols = commodities.map((c) => PROXIES[c].yahooInr);
  const arr = await yahooQuoteRaw(symbols);
  const bySym = new Map<string, any>();
  for (const q of arr) if (q?.symbol) bySym.set(q.symbol, q);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: CommoditySyncResult[] = [];

  for (const c of commodities) {
    const q = bySym.get(PROXIES[c].yahooInr);
    if (!q || typeof q.regularMarketPrice !== 'number') {
      out.push({ commodity: c, price: null, stored: false });
      continue;
    }
    const price = new Decimal(q.regularMarketPrice);
    await prisma.commodityPrice.upsert({
      where: { commodity_date_unit: { commodity: c, date: today, unit: 'PROXY_ETF' } },
      update: { price },
      create: { commodity: c, date: today, price, unit: 'PROXY_ETF', source: 'YAHOO_ETF_PROXY' },
    });
    out.push({ commodity: c, price: price.toNumber(), stored: true });
  }
  logger.info({ out }, '[commodity] all commodities synced');
  return out;
}

export async function getLatestCommodityPrice(
  commodity: CommodityType,
): Promise<Decimal | null> {
  const row = await prisma.commodityPrice.findFirst({
    where: { commodity },
    orderBy: { date: 'desc' },
  });
  return row ? new Decimal(row.price.toString()) : null;
}
