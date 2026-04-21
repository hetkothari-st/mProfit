import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { Exchange } from '@prisma/client';
import { yahooQuoteRaw, yahooQuoteOne, yahooSearch, yahooHistorical } from './yahooClient.js';

export interface YahooQuote {
  symbol: string;
  name: string | null;
  price: Decimal;
  previousClose: Decimal | null;
  currency: string;
  exchange: string;
  dayChange: Decimal | null;
  dayChangePct: Decimal | null;
}

function exchangeSuffix(exchange: Exchange): string {
  switch (exchange) {
    case 'NSE':
      return '.NS';
    case 'BSE':
      return '.BO';
    case 'MCX':
    case 'NFO':
    case 'BFO':
    default:
      return '.NS';
  }
}

export function buildYahooSymbol(symbol: string, exchange: Exchange): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.NS') || upper.endsWith('.BO')) return upper;
  return `${upper}${exchangeSuffix(exchange)}`;
}

export async function fetchQuote(symbol: string, exchange: Exchange): Promise<YahooQuote | null> {
  const ySym = buildYahooSymbol(symbol, exchange);
  try {
    const q = await yahooQuoteOne(ySym);
    if (!q || typeof q.regularMarketPrice !== 'number') return null;
    const price = new Decimal(q.regularMarketPrice);
    const prev = q.regularMarketPreviousClose != null ? new Decimal(q.regularMarketPreviousClose) : null;
    const change = q.regularMarketChange != null ? new Decimal(q.regularMarketChange) : null;
    const changePct = q.regularMarketChangePercent != null ? new Decimal(q.regularMarketChangePercent) : null;
    return {
      symbol: ySym,
      name: q.longName ?? q.shortName ?? null,
      price,
      previousClose: prev,
      currency: q.currency ?? 'INR',
      exchange: q.fullExchangeName ?? q.exchange ?? String(exchange),
      dayChange: change,
      dayChangePct: changePct,
    };
  } catch (err) {
    logger.warn({ err, symbol: ySym }, 'Yahoo quote fetch failed');
    return null;
  }
}

export async function fetchQuotesBulk(
  items: { symbol: string; exchange: Exchange }[],
): Promise<Map<string, YahooQuote>> {
  const map = new Map<string, YahooQuote>();
  const symbols = items.map((i) => buildYahooSymbol(i.symbol, i.exchange));
  if (symbols.length === 0) return map;

  const arr = await yahooQuoteRaw(symbols);
  for (const q of arr) {
    if (!q || typeof q.regularMarketPrice !== 'number') continue;
    map.set(q.symbol!, {
      symbol: q.symbol!,
      name: q.longName ?? q.shortName ?? null,
      price: new Decimal(q.regularMarketPrice),
      previousClose: q.regularMarketPreviousClose != null ? new Decimal(q.regularMarketPreviousClose) : null,
      currency: q.currency ?? 'INR',
      exchange: q.fullExchangeName ?? q.exchange ?? '',
      dayChange: q.regularMarketChange != null ? new Decimal(q.regularMarketChange) : null,
      dayChangePct: q.regularMarketChangePercent != null ? new Decimal(q.regularMarketChangePercent) : null,
    });
  }
  return map;
}

export interface YahooSearchHit {
  symbol: string;
  name: string;
  exchange: string;
  typeDisp: string;
}

export async function searchYahoo(query: string, limit = 10): Promise<YahooSearchHit[]> {
  const quotes = await yahooSearch(query, limit);
  return quotes
    .filter((q: any) => q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO')))
    .slice(0, limit)
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.longname ?? q.shortname ?? q.symbol,
      exchange: q.exchange ?? '',
      typeDisp: q.typeDisp ?? q.quoteType ?? '',
    }));
}

export interface HistoricalBar {
  date: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: bigint | null;
}

export async function fetchHistorical(
  symbol: string,
  exchange: Exchange,
  fromDate: Date,
  toDate: Date = new Date(),
): Promise<HistoricalBar[]> {
  const ySym = buildYahooSymbol(symbol, exchange);
  const rows = await yahooHistorical(ySym, fromDate, toDate, '1d');
  return rows
    .filter((r: any) => r.close != null)
    .map((r: any) => ({
      date: r.date,
      open: new Decimal(r.open ?? r.close!),
      high: new Decimal(r.high ?? r.close!),
      low: new Decimal(r.low ?? r.close!),
      close: new Decimal(r.close!),
      volume: r.volume != null ? BigInt(Math.round(r.volume)) : null,
    }));
}

export async function updateStockPricesFromYahoo(
  opts: { onlyHeld?: boolean } = {},
): Promise<{ updated: number; failed: number; scope: string }> {
  let stocks: { id: string; symbol: string; exchange: Exchange }[];
  if (opts.onlyHeld) {
    const held = await prisma.holding.findMany({
      where: { stockId: { not: null } },
      select: { stockId: true },
      distinct: ['stockId'],
    });
    const ids = held.map((h) => h.stockId!).filter(Boolean);
    stocks = await prisma.stockMaster.findMany({
      where: { isActive: true, id: { in: ids } },
      select: { id: true, symbol: true, exchange: true },
    });
  } else {
    stocks = await prisma.stockMaster.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true, exchange: true },
    });
  }
  const scope = opts.onlyHeld ? 'held' : 'all-active';
  const map = await fetchQuotesBulk(stocks.map((s) => ({ symbol: s.symbol, exchange: s.exchange })));
  let updated = 0;
  let failed = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const stock of stocks) {
    const ySym = buildYahooSymbol(stock.symbol, stock.exchange);
    const q = map.get(ySym);
    if (!q) {
      failed++;
      continue;
    }
    await prisma.stockPrice.upsert({
      where: { stockId_date: { stockId: stock.id, date: today } },
      update: {
        open: q.previousClose ?? q.price,
        high: q.price,
        low: q.price,
        close: q.price,
      },
      create: {
        stockId: stock.id,
        date: today,
        open: q.previousClose ?? q.price,
        high: q.price,
        low: q.price,
        close: q.price,
      },
    });
    updated++;
  }
  logger.info({ updated, failed, scope, total: stocks.length }, 'Stock prices refreshed from Yahoo');
  return { updated, failed, scope };
}

export async function getLatestStockPrice(stockId: string): Promise<Decimal | null> {
  const latest = await prisma.stockPrice.findFirst({
    where: { stockId },
    orderBy: { date: 'desc' },
  });
  return latest ? new Decimal(latest.close.toString()) : null;
}
