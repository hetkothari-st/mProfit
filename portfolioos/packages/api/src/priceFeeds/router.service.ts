import { Decimal } from 'decimal.js';
import type { AssetClass, CommodityType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getLatestStockPrice } from './yahoo.service.js';
import { getLatestNavForFund } from './amfi.service.js';
import { getLatestCommodityPrice } from './commodity.service.js';
import { getLatestCryptoPrice, getLatestCryptoPriceByCoinGeckoId } from './crypto.service.js';
import { getLatestFxRate } from './fx.service.js';

/**
 * Unified price feed router — dispatches a price lookup to the correct
 * underlying source based on asset class. Extend this as new asset
 * classes get their own live feeds.
 */
export interface PriceLookupInput {
  assetClass: AssetClass;
  stockId?: string | null;
  fundId?: string | null;
  cryptoId?: string | null;
  commodity?: CommodityType | null;
  isin?: string | null;
  // F&O — when provided, FUTURES/OPTIONS lookups dispatch to FoContractPrice
  // instead of (incorrectly) returning the underlying spot.
  assetKey?: string | null;
}

export async function routePriceLookup(input: PriceLookupInput): Promise<Decimal | null> {
  switch (input.assetClass) {
    case 'EQUITY':
    case 'ETF':
      return input.stockId ? getLatestStockPrice(input.stockId) : null;

    case 'FUTURES':
    case 'OPTIONS': {
      if (!input.assetKey) return null;
      const { getLatestFoContractPrice } = await import('./nseFoMaster.service.js');
      const r = await getLatestFoContractPrice(input.assetKey);
      return r ? new Decimal(r.closePrice) : null;
    }

    case 'MUTUAL_FUND':
      return input.fundId ? getLatestNavForFund(input.fundId) : null;

    case 'PHYSICAL_GOLD':
    case 'GOLD_BOND':
    case 'GOLD_ETF':
      return getLatestCommodityPrice('GOLD');

    case 'PHYSICAL_SILVER':
      return getLatestCommodityPrice('SILVER');

    case 'CRYPTOCURRENCY':
      // Crypto holdings store the CoinGecko slug in the `isin` field — no FK
      // exists on Transaction. If a direct cryptoId is supplied, prefer it.
      if (input.cryptoId) return getLatestCryptoPrice(input.cryptoId);
      if (input.isin) return getLatestCryptoPriceByCoinGeckoId(input.isin);
      return null;

    case 'FOREIGN_EQUITY':
      // US/international tickers (AAPL, MSFT, GOOGL) ride the existing Yahoo
      // price feed — the same path as domestic EQUITY. Native price is in the
      // listed currency (typically USD); the projection layer converts to INR
      // via `convertToInr` at compute time.
      return input.stockId ? getLatestStockPrice(input.stockId) : null;

    case 'FOREX_PAIR': {
      // Pair identity lives in `isin`: a 3-letter code (e.g. "USD") means
      // base→INR; a 6-letter code (e.g. "EURUSD") means base→quote.
      const code = (input.isin ?? '').toUpperCase();
      if (code.length === 3) return getLatestFxRate(code, 'INR');
      if (code.length === 6) return getLatestFxRate(code.slice(0, 3), code.slice(3, 6));
      return null;
    }

    case 'BOND':
    case 'GOVT_BOND':
    case 'CORPORATE_BOND':
    case 'FIXED_DEPOSIT':
    case 'RECURRING_DEPOSIT':
    case 'NPS':
    case 'PPF':
    case 'EPF':
    case 'PMS':
    case 'AIF':
    case 'REIT':
    case 'INVIT':
    case 'ULIP':
    case 'INSURANCE':
    case 'REAL_ESTATE':
    case 'PRIVATE_EQUITY':
    case 'ART_COLLECTIBLES':
    case 'CASH':
    case 'OTHER':
    default:
      return null;
  }
}

/**
 * Master sync — fetches every external feed we support. Safe to call manually
 * or from cron. Each sub-sync is wrapped so that a failure of one source
 * does not block the others.
 */
export interface MasterSyncResult {
  nseUniverse?: unknown;
  bseUniverse?: unknown;
  corporateActions?: unknown;
  amfiNav?: unknown;
  stockPrices?: unknown;
  commodities?: unknown;
  crypto?: unknown;
  fx?: unknown;
  holdings?: unknown;
  durationMs: number;
  errors: string[];
}

export async function runMasterSync(): Promise<MasterSyncResult> {
  const t0 = Date.now();
  const result: MasterSyncResult = { durationMs: 0, errors: [] };

  const { loadNseEquityUniverse, loadNseEtfUniverse } = await import('./nseUniverse.service.js');
  const { loadBseEquityUniverse } = await import('./bseUniverse.service.js');
  const { loadNseCorporateActions } = await import('./corporateActions.service.js');
  const { loadAmfiNavToDb } = await import('./amfi.service.js');
  const { updateStockPricesFromYahoo } = await import('./yahoo.service.js');
  const { syncAllCommodities } = await import('./commodity.service.js');
  const { syncCryptoPrices } = await import('./crypto.service.js');
  const { syncFxRates } = await import('./fx.service.js');
  const { refreshAllHoldingPrices } = await import('../services/holdings.service.js');

  const steps: [string, () => Promise<unknown>][] = [
    ['nseUniverse', async () => {
      const eq = await loadNseEquityUniverse();
      const etf = await loadNseEtfUniverse();
      return { equity: eq, etf };
    }],
    ['bseUniverse', () => loadBseEquityUniverse()],
    ['corporateActions', () => loadNseCorporateActions()],
    ['amfiNav', () => loadAmfiNavToDb()],
    ['stockPrices', () => updateStockPricesFromYahoo()],
    ['commodities', () => syncAllCommodities()],
    ['crypto', () => syncCryptoPrices()],
    ['fx', () => syncFxRates()],
    ['holdings', () => refreshAllHoldingPrices()],
  ];

  for (const [name, fn] of steps) {
    try {
      const r = await fn();
      (result as unknown as Record<string, unknown>)[name] =r;
    } catch (err) {
      logger.error({ err, step: name }, '[masterSync] step failed');
      result.errors.push(`${name}: ${(err as Error).message}`);
    }
  }

  result.durationMs = Date.now() - t0;
  logger.info({ durationMs: result.durationMs, errors: result.errors.length }, '[masterSync] complete');
  return result;
}

/**
 * Lighter sync — only EOD/realtime prices (not master data). Meant for cron.
 */
export async function runPriceSync(): Promise<MasterSyncResult> {
  const t0 = Date.now();
  const result: MasterSyncResult = { durationMs: 0, errors: [] };

  const { updateStockPricesFromYahoo } = await import('./yahoo.service.js');
  const { syncAllCommodities } = await import('./commodity.service.js');
  const { syncCryptoPrices } = await import('./crypto.service.js');
  const { syncFxRates } = await import('./fx.service.js');
  const { refreshAllHoldingPrices } = await import('../services/holdings.service.js');

  const steps: [string, () => Promise<unknown>][] = [
    ['stockPrices', () => updateStockPricesFromYahoo()],
    ['commodities', () => syncAllCommodities()],
    ['crypto', () => syncCryptoPrices()],
    ['fx', () => syncFxRates()],
    ['holdings', () => refreshAllHoldingPrices()],
  ];

  for (const [name, fn] of steps) {
    try {
      (result as unknown as Record<string, unknown>)[name] =await fn();
    } catch (err) {
      logger.error({ err, step: name }, '[priceSync] step failed');
      result.errors.push(`${name}: ${(err as Error).message}`);
    }
  }

  result.durationMs = Date.now() - t0;
  return result;
}
