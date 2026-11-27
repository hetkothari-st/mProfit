import type { Request, Response } from 'express';
import { z } from 'zod';
import { Exchange } from '@prisma/client';
import { serializeMoney, type Money } from '@everypaisa/shared';
import {
  searchAssets,
  searchStocks,
  searchMutualFunds,
} from '../services/holdings/masterData.service.js';
import {
  fetchQuote,
  getLatestStockPrice,
} from '../priceFeeds/yahoo.service.js';
import { getLatestNavForFund, syncAmfiNav } from '../priceFeeds/amfi.service.js';
import { loadNseEquityUniverse, loadNseEtfUniverse } from '../priceFeeds/nseUniverse.service.js';
import { loadBseEquityUniverse } from '../priceFeeds/bseUniverse.service.js';
import { loadNseCorporateActions } from '../priceFeeds/corporateActions.service.js';
import { syncAllCommodities, getLatestCommodityPrice, getLatestCommodityQuote, fetchLivePrices } from '../priceFeeds/commodity.service.js';
import { syncCryptoPrices, searchCrypto, fetchLiveCryptoPrices } from '../priceFeeds/crypto.service.js';
import { syncFxRates, getLatestFxRate } from '../priceFeeds/fx.service.js';
import { runMasterSync, runPriceSync } from '../priceFeeds/router.service.js';
import { refreshAllHoldingPrices, refreshPortfolioPrices } from '../services/holdings/holdings.service.js';
import { refreshUserProjectionPrices } from '../services/holdings/holdingsProjection.js';
import { prisma } from '../lib/prisma.js';
import { ok, created } from '../lib/response.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../lib/errors.js';

const searchQuery = z.object({
  q: z.string().min(1).max(100),
  kind: z.enum(['all', 'stock', 'mf']).optional().default('all'),
  limit: z.coerce.number().int().positive().max(50).optional().default(15),
});

export async function search(req: Request, res: Response) {
  const q = searchQuery.parse(req.query);
  let hits;
  if (q.kind === 'stock') hits = await searchStocks(q.q, q.limit);
  else if (q.kind === 'mf') hits = await searchMutualFunds(q.q, q.limit);
  else hits = await searchAssets(q.q, q.limit);
  ok(res, hits);
}

export async function liveQuote(req: Request, res: Response) {
  const { symbol } = req.params;
  const exchange = (req.query.exchange as Exchange) ?? 'NSE';
  if (!symbol) throw new BadRequestError('symbol required');
  const q = await fetchQuote(symbol, exchange);
  if (!q) throw new NotFoundError('Quote not available');
  ok(res, {
    symbol: q.symbol,
    name: q.name,
    price: serializeMoney(q.price),
    previousClose: q.previousClose ? serializeMoney(q.previousClose) : null,
    dayChange: q.dayChange ? serializeMoney(q.dayChange) : null,
    // Pct is dimensionless — keep as number.
    dayChangePct: q.dayChangePct?.toNumber() ?? null,
    currency: q.currency,
    exchange: q.exchange,
  });
}

export async function latestStockPrice(req: Request, res: Response) {
  const stockId = req.params.id!;
  const price = await getLatestStockPrice(stockId);
  if (!price) throw new NotFoundError('No price data');
  ok(res, { stockId, price: serializeMoney(price) });
}

export async function latestFundNav(req: Request, res: Response) {
  const fundId = req.params.id!;
  const nav = await getLatestNavForFund(fundId);
  if (!nav) throw new NotFoundError('No NAV data');
  ok(res, { fundId, nav: serializeMoney(nav) });
}

export async function refreshPortfolio(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const portfolioId = req.params.id!;
  const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!p || p.userId !== req.user.id) throw new NotFoundError('Portfolio not found');
  const result = await refreshPortfolioPrices(portfolioId);
  ok(res, result);
}

export async function refreshAllPrices(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  // The caller's holdings only, from prices the scheduled feeds already
  // loaded. This used to fetch quotes for every user's stocks and re-price
  // every user's holdings — one click did the whole platform's work.
  const holdings = await refreshUserProjectionPrices(req.user.id);
  ok(res, { holdings });
}

export async function amfiSync(_req: Request, res: Response) {
  const result = await syncAmfiNav();
  created(res, result);
}

export async function amfiRefreshHoldings(_req: Request, res: Response) {
  const result = await refreshAllHoldingPrices();
  ok(res, result);
}

export async function syncAll(_req: Request, res: Response) {
  const result = await runMasterSync();
  created(res, result);
}

export async function syncPrices(_req: Request, res: Response) {
  const result = await runPriceSync();
  ok(res, result);
}

export async function syncUniverse(_req: Request, res: Response) {
  const nse = await loadNseEquityUniverse();
  const etf = await loadNseEtfUniverse();
  const bse = await loadBseEquityUniverse();
  created(res, { nse, etf, bse });
}

export async function syncCorpActions(_req: Request, res: Response) {
  const result = await loadNseCorporateActions();
  created(res, result);
}

export async function syncCommodities(_req: Request, res: Response) {
  const result = await syncAllCommodities();
  ok(res, result);
}

export async function syncCrypto(_req: Request, res: Response) {
  const result = await syncCryptoPrices();
  ok(res, result);
}

export async function syncFx(_req: Request, res: Response) {
  const result = await syncFxRates();
  ok(res, result);
}

export async function listCommodityPrices(_req: Request, res: Response) {
  const [gold, silver, platinum] = await Promise.all([
    getLatestCommodityPrice('GOLD'),
    getLatestCommodityPrice('SILVER'),
    getLatestCommodityPrice('PLATINUM'),
  ]);
  ok(res, {
    GOLD: gold ? serializeMoney(gold) : null,
    SILVER: silver ? serializeMoney(silver) : null,
    PLATINUM: platinum ? serializeMoney(platinum) : null,
  });
}

export async function liveCommodityPrices(_req: Request, res: Response) {
  const { GOLD: liveGold, SILVER: liveSilver, etfNavs, fetchedAt } = await fetchLivePrices();

  // Fall back to the stored daily price when the live sources fail — and say
  // so, with that price's own date, instead of passing it off as live.
  const [goldQuote, silverQuote] = await Promise.all([
    liveGold ? null : getLatestCommodityQuote('GOLD'),
    liveSilver ? null : getLatestCommodityQuote('SILVER'),
  ]);
  const gold = liveGold ?? goldQuote?.price ?? null;
  const silver = liveSilver ?? silverQuote?.price ?? null;

  const etfPayload: Record<string, string> = {};
  for (const [sym, price] of Object.entries(etfNavs)) {
    etfPayload[sym] = serializeMoney(price);
  }

  // EMPTY_CACHE uses epoch 0 for "no live snapshot yet". The badge's age then
  // comes from the stored price's date — never from "now", which made a
  // days-old fallback read as fresh.
  const liveAsOf = fetchedAt.getTime() === 0 ? null : fetchedAt;
  const asOf = liveGold ? liveAsOf : goldQuote?.asOf ?? liveAsOf;

  ok(res, {
    GOLD: gold ? serializeMoney(gold) : null,
    SILVER: silver ? serializeMoney(silver) : null,
    etfNavs: etfPayload,
    fetchedAt: (asOf ?? new Date(0)).toISOString(),
    source: liveGold ? 'live' : 'cached',
  });
}

export async function listFxRates(_req: Request, res: Response) {
  const pairs = ['USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'AUD', 'CAD', 'CHF'];
  const rates: Record<string, Money | null> = {};
  for (const base of pairs) {
    const r = await getLatestFxRate(base, 'INR');
    rates[base] = r ? serializeMoney(r) : null;
  }
  ok(res, rates);
}

export async function searchCryptoController(req: Request, res: Response) {
  const q = String(req.query.q ?? '').trim();
  if (!q) throw new BadRequestError('q required');
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 15)));
  const hits = await searchCrypto(q, limit);
  ok(res, hits);
}

export async function liveCryptoPrices(_req: Request, res: Response) {
  const rows = await fetchLiveCryptoPrices();
  ok(res, { coins: rows, fetchedAt: new Date().toISOString() });
}
