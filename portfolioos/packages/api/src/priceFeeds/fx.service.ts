import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { yahooQuoteRaw } from './yahooClient.js';

const PAIRS: { base: string; quote: string; yahooSymbol: string }[] = [
  { base: 'USD', quote: 'INR', yahooSymbol: 'USDINR=X' },
  { base: 'EUR', quote: 'INR', yahooSymbol: 'EURINR=X' },
  { base: 'GBP', quote: 'INR', yahooSymbol: 'GBPINR=X' },
  { base: 'JPY', quote: 'INR', yahooSymbol: 'JPYINR=X' },
  { base: 'AED', quote: 'INR', yahooSymbol: 'AEDINR=X' },
  { base: 'SGD', quote: 'INR', yahooSymbol: 'SGDINR=X' },
  { base: 'AUD', quote: 'INR', yahooSymbol: 'AUDINR=X' },
  { base: 'CAD', quote: 'INR', yahooSymbol: 'CADINR=X' },
  { base: 'CHF', quote: 'INR', yahooSymbol: 'CHFINR=X' },
];

export interface FxSyncResult {
  updated: number;
  skipped: number;
}

export async function syncFxRates(): Promise<FxSyncResult> {
  let updated = 0;
  let skipped = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const quotes = await yahooQuoteRaw(PAIRS.map((p) => p.yahooSymbol));
  const bySymbol = new Map<string, any>();
  for (const q of quotes) if (q?.symbol) bySymbol.set(q.symbol, q);

  for (const pair of PAIRS) {
    const q = bySymbol.get(pair.yahooSymbol);
    if (!q || typeof q.regularMarketPrice !== 'number') {
      skipped++;
      continue;
    }
    const rate = new Decimal(q.regularMarketPrice);
    await prisma.fXRate.upsert({
      where: {
        baseCcy_quoteCcy_date: {
          baseCcy: pair.base,
          quoteCcy: pair.quote,
          date: today,
        },
      },
      update: { rate, source: 'YAHOO' },
      create: {
        baseCcy: pair.base,
        quoteCcy: pair.quote,
        date: today,
        rate,
        source: 'YAHOO',
      },
    });
    updated++;
  }

  logger.info({ updated, skipped }, '[fx] FX rates synced');
  return { updated, skipped };
}

export async function getLatestFxRate(
  baseCcy: string,
  quoteCcy: string,
): Promise<Decimal | null> {
  const row = await prisma.fXRate.findFirst({
    where: { baseCcy, quoteCcy },
    orderBy: { date: 'desc' },
  });
  return row ? new Decimal(row.rate.toString()) : null;
}

export async function convertToInr(amount: Decimal, fromCurrency: string): Promise<Decimal> {
  if (fromCurrency === 'INR') return amount;
  const rate = await getLatestFxRate(fromCurrency, 'INR');
  if (!rate) {
    logger.warn({ fromCurrency }, '[fx] no rate found — returning amount as-is');
    return amount;
  }
  return amount.mul(rate);
}
