import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { loadAmfiNavToDb } from '../priceFeeds/amfi.service.js';
import { updateStockPricesFromYahoo } from '../priceFeeds/yahoo.service.js';
import { refreshAllHoldingPrices } from '../services/holdings.service.js';
import { loadNseEquityUniverse, loadNseEtfUniverse } from '../priceFeeds/nseUniverse.service.js';
import { loadBseEquityUniverse } from '../priceFeeds/bseUniverse.service.js';
import { loadNseCorporateActions } from '../priceFeeds/corporateActions.service.js';
import { syncAllCommodities } from '../priceFeeds/commodity.service.js';
import { syncCryptoPrices } from '../priceFeeds/crypto.service.js';
import { syncFxRates } from '../priceFeeds/fx.service.js';

const TZ = 'Asia/Kolkata';

const running = {
  amfi: false,
  stocks: false,
  universe: false,
  corpActions: false,
  commodities: false,
  crypto: false,
  fx: false,
};

async function runGuarded<K extends keyof typeof running>(
  name: K,
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  if (running[name]) {
    logger.warn(`[cron] ${label} already running — skipping`);
    return;
  }
  running[name] = true;
  const t0 = Date.now();
  try {
    logger.info(`[cron] ${label} starting`);
    const r = await fn();
    logger.info({ r, ms: Date.now() - t0 }, `[cron] ${label} done`);
  } catch (err) {
    logger.error({ err }, `[cron] ${label} failed`);
  } finally {
    running[name] = false;
  }
}

async function runAmfiJob(): Promise<void> {
  await runGuarded('amfi', 'AMFI NAV sync', async () => {
    const r = await loadAmfiNavToDb();
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runStockEODJob(): Promise<void> {
  await runGuarded('stocks', 'Stock EOD refresh', async () => {
    const r = await updateStockPricesFromYahoo();
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runStockIntradayJob(): Promise<void> {
  await runGuarded('stocks', 'Stock intraday (held)', async () => {
    const r = await updateStockPricesFromYahoo({ onlyHeld: true });
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runUniverseSync(): Promise<void> {
  await runGuarded('universe', 'NSE/BSE universe sync', async () => {
    const nse = await loadNseEquityUniverse();
    const etf = await loadNseEtfUniverse();
    const bse = await loadBseEquityUniverse();
    return { nse, etf, bse };
  });
}

async function runCorpActionsJob(): Promise<void> {
  await runGuarded('corpActions', 'Corporate actions sync', loadNseCorporateActions);
}

async function runCommoditiesJob(): Promise<void> {
  await runGuarded('commodities', 'Commodities sync', async () => {
    const r = await syncAllCommodities();
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runCryptoJob(): Promise<void> {
  await runGuarded('crypto', 'Crypto sync', async () => {
    const r = await syncCryptoPrices();
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runFxJob(): Promise<void> {
  await runGuarded('fx', 'FX sync', syncFxRates);
}

export function startPriceJobs(): void {
  if (process.env.ENABLE_PRICE_CRONS === 'false') {
    logger.info('[cron] price jobs disabled via ENABLE_PRICE_CRONS=false');
    return;
  }

  // AMFI NAV at 10:00 PM IST every day
  cron.schedule('0 22 * * *', runAmfiJob, { timezone: TZ });

  // Stock EOD at 4:30 PM IST Mon–Fri
  cron.schedule('30 16 * * 1-5', runStockEODJob, { timezone: TZ });

  // Intraday refresh (held stocks only) every 15 minutes during market hours Mon–Fri
  cron.schedule('*/15 9-15 * * 1-5', runStockIntradayJob, { timezone: TZ });

  // NSE/BSE universe sync weekly at Sunday 3:00 AM IST
  cron.schedule('0 3 * * 0', runUniverseSync, { timezone: TZ });

  // Corporate actions daily at 8:00 PM IST
  cron.schedule('0 20 * * *', runCorpActionsJob, { timezone: TZ });

  // Commodities EOD at 11:30 PM IST daily (MCX closes ~11:30 PM)
  cron.schedule('30 23 * * *', runCommoditiesJob, { timezone: TZ });

  // Crypto every 30 min 24/7
  cron.schedule('*/30 * * * *', runCryptoJob, { timezone: TZ });

  // FX rates every hour
  cron.schedule('0 * * * *', runFxJob, { timezone: TZ });

  logger.info(
    '[cron] scheduled: AMFI@22:00, stockEOD@16:30 MF, intraday 15-min MF, universe Sun 03:00, CA@20:00, commodities@23:30, crypto 30-min, FX hourly — all IST',
  );
}

export {
  runAmfiJob,
  runStockEODJob,
  runStockIntradayJob,
  runUniverseSync,
  runCorpActionsJob,
  runCommoditiesJob,
  runCryptoJob,
  runFxJob,
};
