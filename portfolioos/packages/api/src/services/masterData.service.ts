import type { Exchange, StockMaster, MutualFundMaster } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { fetchQuote, searchYahoo } from '../priceFeeds/yahoo.service.js';

export interface EnsureStockInput {
  symbol: string;
  exchange: Exchange;
  name?: string;
  isin?: string | null;
  sector?: string | null;
  industry?: string | null;
}

export async function ensureStockMaster(input: EnsureStockInput): Promise<StockMaster> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new BadRequestError('Stock symbol is required');

  const existing = await prisma.stockMaster.findUnique({ where: { symbol } });
  if (existing) {
    const patch: Partial<StockMaster> = {};
    if (input.name && !existing.name) patch.name = input.name;
    if (input.isin && !existing.isin) patch.isin = input.isin;
    if (input.sector && !existing.sector) patch.sector = input.sector;
    if (input.industry && !existing.industry) patch.industry = input.industry;
    if (Object.keys(patch).length > 0) {
      return prisma.stockMaster.update({ where: { id: existing.id }, data: patch });
    }
    return existing;
  }

  let name = input.name?.trim();
  if (!name) {
    const q = await fetchQuote(symbol, input.exchange);
    name = q?.name ?? symbol;
  }

  return prisma.stockMaster.create({
    data: {
      symbol,
      exchange: input.exchange,
      name,
      isin: input.isin ?? null,
      sector: input.sector ?? null,
      industry: input.industry ?? null,
    },
  });
}

export async function ensureMutualFundMaster(input: {
  schemeCode: string;
  schemeName?: string;
  amcName?: string;
  isin?: string | null;
}): Promise<MutualFundMaster> {
  const schemeCode = input.schemeCode.trim();
  if (!schemeCode) throw new BadRequestError('Scheme code is required');

  const existing = await prisma.mutualFundMaster.findUnique({ where: { schemeCode } });
  if (existing) return existing;

  if (!input.schemeName || !input.amcName) {
    throw new NotFoundError(
      `Scheme ${schemeCode} not found in master. Run AMFI NAV load or provide scheme name + AMC.`,
    );
  }

  return prisma.mutualFundMaster.create({
    data: {
      schemeCode,
      schemeName: input.schemeName,
      amcName: input.amcName,
      category: 'OTHER',
      isin: input.isin ?? null,
    },
  });
}

export interface AssetSearchHit {
  kind: 'STOCK' | 'MUTUAL_FUND';
  id: string | null;
  symbol: string | null;
  name: string;
  exchange?: Exchange | null;
  schemeCode?: string | null;
  amcName?: string | null;
  isin?: string | null;
  source: 'LOCAL' | 'YAHOO';
}

export async function searchStocks(query: string, limit = 10): Promise<AssetSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const local = await prisma.stockMaster.findMany({
    where: {
      isActive: true,
      OR: [
        { symbol: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { isin: { equals: q.toUpperCase() } },
      ],
    },
    take: limit,
  });

  const hits: AssetSearchHit[] = local.map((s) => ({
    kind: 'STOCK',
    id: s.id,
    symbol: s.symbol,
    name: s.name,
    exchange: s.exchange,
    isin: s.isin,
    source: 'LOCAL',
  }));

  if (hits.length >= limit) return hits.slice(0, limit);

  const remote = await searchYahoo(q, limit - hits.length);
  const seen = new Set(hits.map((h) => h.symbol));
  for (const r of remote) {
    const baseSymbol = r.symbol.replace(/\.(NS|BO)$/i, '');
    if (seen.has(baseSymbol)) continue;
    hits.push({
      kind: 'STOCK',
      id: null,
      symbol: baseSymbol,
      name: r.name,
      exchange: r.symbol.endsWith('.BO') ? 'BSE' : 'NSE',
      source: 'YAHOO',
    });
  }

  return hits.slice(0, limit);
}

export async function searchMutualFunds(query: string, limit = 20): Promise<AssetSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const local = await prisma.mutualFundMaster.findMany({
    where: {
      isActive: true,
      OR: [
        { schemeName: { contains: q, mode: 'insensitive' } },
        { schemeCode: { equals: q } },
        { isin: { equals: q.toUpperCase() } },
      ],
    },
    take: limit,
    orderBy: { schemeName: 'asc' },
  });

  return local.map((f) => ({
    kind: 'MUTUAL_FUND',
    id: f.id,
    symbol: null,
    name: f.schemeName,
    schemeCode: f.schemeCode,
    amcName: f.amcName,
    isin: f.isin,
    source: 'LOCAL',
  }));
}

export async function searchAssets(query: string, limit = 15): Promise<AssetSearchHit[]> {
  const [stocks, funds] = await Promise.all([
    searchStocks(query, Math.ceil(limit / 2)),
    searchMutualFunds(query, Math.ceil(limit / 2)),
  ]);
  return [...stocks, ...funds].slice(0, limit);
}
