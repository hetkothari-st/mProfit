import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { loadAmfiNavToDb } from '../priceFeeds/amfi.service.js';
import { updateStockPricesFromYahoo } from '../priceFeeds/yahoo.service.js';
import { syncAllCommodities } from '../priceFeeds/commodity.service.js';
import { syncCryptoPrices } from '../priceFeeds/crypto.service.js';
import { syncFxRates } from '../priceFeeds/fx.service.js';
import { refreshAllHoldingPrices } from '../services/holdings.service.js';
import { loadNseEquityUniverse, loadNseEtfUniverse } from '../priceFeeds/nseUniverse.service.js';
import { startPfFetchWorker } from './pfFetchWorker.js';

const HOUR_MS = 60 * 60 * 1000;

async function ageOfLatest(
  table: 'StockPrice' | 'MFNav' | 'CommodityPrice' | 'CryptoPrice' | 'FXRate',
): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<{ max: Date | null }[]>(
    `SELECT MAX(date) AS max FROM "${table}"`,
  );
  const d = rows[0]?.max;
  return d ? Date.now() - new Date(d).getTime() : null;
}

async function maybeRun(
  label: string,
  staleMs: number,
  ageMs: number | null,
  fn: () => Promise<unknown>,
): Promise<void> {
  if (ageMs != null && ageMs < staleMs) {
    logger.info({ label, ageHours: +(ageMs / HOUR_MS).toFixed(1) }, '[startup] fresh — skipping');
    return;
  }
  try {
    logger.info({ label }, '[startup] running');
    const r = await fn();
    logger.info({ label, r }, '[startup] done');
  } catch (err) {
    logger.warn({ err, label }, '[startup] failed — will retry on cron');
  }
}

export async function runStartupSync(): Promise<void> {
  if (process.env.ENABLE_STARTUP_SYNC === 'false') {
    logger.info('[startup] sync disabled via ENABLE_STARTUP_SYNC=false');
    return;
  }
  // Refreshes shared price feeds plus every user's holding projections —
  // needs cross-tenant read/write, so run under the RLS bypass context.
  return runAsSystem(() => runStartupSyncInner());
}

async function runStartupSyncInner(): Promise<void> {
  logger.info('[startup] initial data sync beginning');

  const universeCount = await prisma.stockMaster.count({ where: { isActive: true } });
  if (universeCount === 0) {
    try {
      logger.info('[startup] stock universe empty — loading NSE');
      await loadNseEquityUniverse();
      await loadNseEtfUniverse();
    } catch (err) {
      logger.warn({ err }, '[startup] NSE universe load failed');
    }
  }

  const [stockAge, navAge, commAge, cryptoAge, fxAge] = await Promise.all([
    ageOfLatest('StockPrice'),
    ageOfLatest('MFNav'),
    ageOfLatest('CommodityPrice'),
    ageOfLatest('CryptoPrice'),
    ageOfLatest('FXRate'),
  ]);

  // AMFI NAV is one file (cheap); refresh if older than 24h
  await maybeRun('AMFI NAV', 24 * HOUR_MS, navAge, loadAmfiNavToDb);

  // Stock prices: only held stocks on startup (avoid rate-limiting on full 2580)
  await maybeRun('Stock prices (held)', 6 * HOUR_MS, stockAge, () =>
    updateStockPricesFromYahoo({ onlyHeld: true }),
  );

  await maybeRun('Commodities', 24 * HOUR_MS, commAge, syncAllCommodities);
  await maybeRun('Crypto', 2 * HOUR_MS, cryptoAge, syncCryptoPrices);
  await maybeRun('FX', 6 * HOUR_MS, fxAge, syncFxRates);

  try {
    await refreshAllHoldingPrices();
  } catch (err) {
    logger.warn({ err }, '[startup] holdings refresh failed');
  }
  // Start PF headless fetch worker (SSE-driven Playwright scrape for EPFO)
  startPfFetchWorker();

  logger.info('[startup] initial data sync complete');
}
