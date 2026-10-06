import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { runAsSystem } from '../lib/requestContext.js';
import { syncAmfiNav } from '../priceFeeds/amfi.service.js';
import { refreshFundCostAndSize } from '../priceFeeds/amfiCostAndSize.service.js';
import {
  FeedCanaryError,
  captureFeedFailure,
  pruneFeedRunLogs,
  runFeedWithCanary,
} from '../priceFeeds/feedCanary.js';
import { updateStockPricesFromYahoo } from '../priceFeeds/yahoo.service.js';
import { refreshAllHoldingPrices } from '../services/holdings.service.js';
import { loadNseEquityUniverse, loadNseEtfUniverse } from '../priceFeeds/nseUniverse.service.js';
import { loadBseEquityUniverse } from '../priceFeeds/bseUniverse.service.js';
import { loadNseCorporateActions } from '../priceFeeds/corporateActions.service.js';
import { runCorporateActionApplyAll } from './corporateActionApplyJob.js';
import { syncAllCommodities } from '../priceFeeds/commodity.service.js';
import { syncCryptoPrices } from '../priceFeeds/crypto.service.js';
import { refreshBenchmarks } from '../services/analytics.benchmark.js';
import { syncFxRates } from '../priceFeeds/fx.service.js';
import { syncFuelPrices } from '../priceFeeds/fuel.service.js';
import { loadNseFoMaster } from '../priceFeeds/nseFoMaster.service.js';
import { loadNseFoBhavcopy } from '../priceFeeds/nseFoBhavcopy.service.js';
import {
  refreshAllDerivativePositionPrices,
  refreshLiveDerivativePositionPrices,
} from '../services/derivativePosition.service.js';

const TZ = 'Asia/Kolkata';

const running = {
  amfi: false,
  stocks: false,
  universe: false,
  corpActions: false,
  commodities: false,
  crypto: false,
  benchmark: false,
  fx: false,
  foMaster: false,
  foBhavcopy: false,
  foLive: false,
  fuel: false,
  costSize: false,
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
    // Scheduled jobs refresh shared price tables and every user's holdings,
    // so they need cross-tenant access. Wrap in system context (§5.1 task 11).
    const r = await runAsSystem(() => fn() as Promise<unknown>);
    logger.info({ r, ms: Date.now() - t0 }, `[cron] ${label} done`);
  } catch (err) {
    logger.error({ err }, `[cron] ${label} failed`);
    // These are node-cron jobs, not Bull jobs: nothing downstream sees the
    // throw, and `Sentry.setupExpressErrorHandler` only covers requests. A
    // failure here reached the log and stopped, which is how the AMFI sync
    // managed to be broken for weeks.
    //
    // A tripped canary has already reported itself with the run id and the
    // verdict; reporting it again here would double every feed alert.
    if (!(err instanceof FeedCanaryError)) {
      captureFeedFailure(err, {
        kind: 'FEED',
        subject: name,
        check: 'job',
        runId: null,
        reason: err instanceof Error ? err.message : String(err),
        outcome: 'threw',
      });
    }
  } finally {
    running[name] = false;
  }
}

async function runAmfiJob(): Promise<void> {
  await runGuarded('amfi', 'AMFI NAV sync', async () => {
    // The canary runs BEFORE holdings are repriced: repricing every holding
    // from a NAV table that just lost most of its rows would push the damage
    // into user-visible valuations, which is what made the eight-column
    // change so expensive to miss. It lives inside syncAmfiNav, so every
    // other entry point is judged the same way this one is.
    const r = await syncAmfiNav();
    await refreshAllHoldingPrices();
    // Once a day is often enough to keep the run table from growing forever.
    await pruneFeedRunLogs();
    return r;
  });
}

/**
 * AMFI TER and scheme-wise AUM.
 *
 * Its own job rather than the first step of fund scoring, which is where it
 * used to live. Two reasons that mattered in production:
 *
 *   - It was gated on named-fund advice being switched on, so an unlicensed
 *     deployment held `terPct` and `aumInr` null on all 14,673 schemes and
 *     the release gate reported 0% coverage — of nothing, because there was
 *     nothing to measure.
 *   - A fetch failure was swallowed inside a scoring run, where it showed up
 *     as thinner coverage rather than as a feed that did not arrive.
 *
 * It is a feed, so it goes through the canary like every other feed. Runs at
 * 22:30, between the NAV sync (22:00) and scoring (22:45), because scoring
 * reads what this leaves behind.
 */
async function runCostSizeJob(): Promise<void> {
  await runGuarded('costSize', 'AMFI cost and size refresh', () =>
    runFeedWithCanary(
      'amfi_cost_size',
      () => refreshFundCostAndSize(),
      (x) => ({
        // Measured at the TER join, which is the half that can silently stop
        // identifying schemes. AUM joins on an exact AMFI code and either
        // works or does not.
        rowsParsed: x.ter.fetched,
        rowsImported: x.ter.matched,
        parseFailures: x.ter.ambiguous + x.ter.unmappedAmc,
        details: {
          terUnmatched: x.ter.unmatched,
          terAmbiguous: x.ter.ambiguous,
          terUnmappedAmc: x.ter.unmappedAmc,
          terAsOf: x.ter.asOf,
          aumMatched: x.aum.matched,
          aumAmcs: x.aum.amcs,
          aumAsOf: x.aum.asOf,
          sourceFailures: x.failures.length,
        },
      }),
    ),
  );
}

async function runStockEODJob(): Promise<void> {
  await runGuarded('stocks', 'Stock EOD refresh', async () => {
    const r = await runFeedWithCanary(
      'yahoo_stock_eod',
      () => updateStockPricesFromYahoo(),
      (x) => ({ rowsParsed: x.updated + x.failed, rowsImported: x.updated, parseFailures: x.failed }),
    );
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runStockIntradayJob(): Promise<void> {
  await runGuarded('stocks', 'Stock intraday (held)', async () => {
    // Separate feed key: this run covers only held symbols, so its row count
    // moves with the user base and must not be compared against the EOD run.
    const r = await runFeedWithCanary(
      'yahoo_stock_intraday',
      () => updateStockPricesFromYahoo({ onlyHeld: true }),
      (x) => ({ rowsParsed: x.updated + x.failed, rowsImported: x.updated, parseFailures: x.failed }),
    );
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runUniverseSync(): Promise<void> {
  await runGuarded('universe', 'NSE/BSE universe sync', async () => {
    // `skipped` is deliberate filtering (wrong series, inactive scrip), so it
    // is not a parse failure; `failed` is a row we meant to write and could
    // not. Imported is created+updated — the number that should hold steady.
    const universeCounts = (x: {
      fetchedRows: number;
      created: number;
      updated: number;
      failed: number;
    }) => ({
      rowsParsed: x.fetchedRows,
      rowsImported: x.created + x.updated,
      parseFailures: x.failed,
    });
    const nse = await runFeedWithCanary(
      'nse_equity_universe',
      () => loadNseEquityUniverse(),
      universeCounts,
    );
    const etf = await runFeedWithCanary(
      'nse_etf_universe',
      () => loadNseEtfUniverse(),
      universeCounts,
    );
    const bse = await runFeedWithCanary(
      'bse_equity_universe',
      () => loadBseEquityUniverse(),
      universeCounts,
    );
    return { nse, etf, bse };
  });
}

async function runCorpActionsJob(): Promise<void> {
  await runGuarded('corpActions', 'Corporate actions sync', async () => {
    // Measured at the CSV, not at the insert: corporate actions are deduped
    // by design, so a healthy re-run inserts almost nothing. `fetched` is the
    // count of rows we could read, which is the feed's actual output.
    const fetched = await runFeedWithCanary(
      'nse_corporate_actions',
      () => loadNseCorporateActions(),
      (x) => ({
        rowsParsed: x.dataLines,
        rowsImported: x.fetched,
        parseFailures: x.parseFailures,
      }),
    );
    // Fold newly-fetched splits/bonuses into holdings (idempotent).
    const applied = await runCorporateActionApplyAll();
    return { fetched, applied };
  });
}

async function runCommoditiesJob(): Promise<void> {
  await runGuarded('commodities', 'Commodities sync', async () => {
    const r = await runFeedWithCanary(
      'commodity_prices',
      () => syncAllCommodities(),
      (x) => ({
        rowsParsed: x.length,
        rowsImported: x.filter((c) => c.stored).length,
        parseFailures: x.filter((c) => !c.stored).length,
      }),
    );
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runCryptoJob(): Promise<void> {
  await runGuarded('crypto', 'Crypto sync', async () => {
    const r = await runFeedWithCanary(
      'crypto_prices',
      () => syncCryptoPrices(),
      (x) => ({
        rowsParsed: x.updated + x.skipped,
        rowsImported: x.updated,
        // A coin we asked CoinGecko about and got no INR price back for.
        parseFailures: x.skipped,
      }),
    );
    await refreshAllHoldingPrices();
    return r;
  });
}

async function runFxJob(): Promise<void> {
  await runGuarded('fx', 'FX sync', () =>
    runFeedWithCanary('fx_rates', () => syncFxRates(), (x) => ({
      rowsParsed: x.updated + x.skipped,
      rowsImported: x.updated,
      parseFailures: x.skipped,
      details: x.bySource,
    })),
  );
}

async function runBenchmarkJob(): Promise<void> {
  await runGuarded('benchmark', 'Benchmark (NIFTY/Sensex) refresh', () => refreshBenchmarks());
}

async function runFoMasterJob(): Promise<void> {
  await runGuarded('foMaster', 'NSE F&O master sync', () =>
    runFeedWithCanary('nse_fo_master', () => loadNseFoMaster(), (x) => ({
      rowsParsed: x.rows,
      rowsImported: x.instruments,
    })),
  );
}

async function runFoBhavcopyJob(): Promise<void> {
  await runGuarded('foBhavcopy', 'NSE F&O bhavcopy', async () => {
    const r = await runFeedWithCanary(
      'nse_fo_bhavcopy',
      () => loadNseFoBhavcopy(),
      (x) => ({
        rowsParsed: x.rowsParsed,
        rowsImported: x.upserted,
        parseFailures: x.skipped,
        // A trading holiday is not a shrinking feed.
        sourceEmpty: !x.available,
        details: { date: x.date },
      }),
    );
    await refreshAllDerivativePositionPrices();
    return r;
  });
}

async function runFoLiveJob(): Promise<void> {
  await runGuarded('foLive', 'NSE F&O live MTM', () =>
    refreshLiveDerivativePositionPrices(),
  );
}

async function runFuelJob(): Promise<void> {
  await runGuarded('fuel', 'Fuel prices sync', () =>
    runFeedWithCanary('fuel_prices', () => syncFuelPrices(), (x) => ({
      rowsParsed: x.rows,
      rowsImported: x.rows,
    })),
  );
}

export function startPriceJobs(): void {
  if (process.env.ENABLE_PRICE_CRONS === 'false') {
    logger.info('[cron] price jobs disabled via ENABLE_PRICE_CRONS=false');
    return;
  }

  // AMFI NAV at 10:00 PM IST every day
  cron.schedule('0 22 * * *', runAmfiJob, { timezone: TZ });

  // TER and AUM at 10:30 PM IST, between the NAV sync and fund scoring.
  if (env.ENABLE_COST_SIZE_REFRESH !== 'false') {
    cron.schedule('30 22 * * *', runCostSizeJob, { timezone: TZ });
  }

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

  // Crypto every 2 min 24/7 — keeps DB fallback fresh for the live endpoint
  // and triggers HoldingProjection price refresh on every tick.
  cron.schedule('*/2 * * * *', runCryptoJob, { timezone: TZ });

  // FX rates every hour
  cron.schedule('0 * * * *', runFxJob, { timezone: TZ });

  // Benchmark indices (NIFTY/Sensex) daily at 16:40 IST Mon–Fri, just after
  // the stock EOD refresh. Keeps the cache warm so the analytics benchmark
  // chart + risk-beta never wait on (or get rate-limited by) Yahoo at request
  // time. Also warmed once at boot below for fresh deploys.
  cron.schedule('40 16 * * 1-5', runBenchmarkJob, { timezone: TZ });
  void runBenchmarkJob();

  // F&O master (lot sizes) — Sunday 03:30 IST weekly
  cron.schedule('30 3 * * 0', runFoMasterJob, { timezone: TZ });

  // F&O EOD bhavcopy at 16:45 IST Mon–Fri (NSE publishes ~16:30; +15min buffer)
  cron.schedule('45 16 * * 1-5', runFoBhavcopyJob, { timezone: TZ });

  // F&O LIVE MTM during market hours: every 60s, 9:15–15:30 IST Mon–Fri.
  // The NSE quote-derivative cache (5s per underlying) collapses concurrent
  // user polls onto these fetches.
  cron.schedule('* 9-15 * * 1-5', runFoLiveJob, { timezone: TZ });

  // Fuel prices (Goodreturns scrape) — IOCL revises at 6:00 AM IST. Run at
  // 06:30 to give upstream sites time to publish.
  cron.schedule('30 6 * * *', runFuelJob, { timezone: TZ });

  logger.info(
    '[cron] scheduled: AMFI@22:00, stockEOD@16:30 MF, intraday 15-min MF, universe Sun 03:00, CA@20:00, commodities@23:30, crypto 30-min, FX hourly, F&O master Sun 03:30, F&O bhavcopy@16:45 MF, F&O live 60s MF, fuel@06:30 — all IST',
  );
}

export {
  runAmfiJob,
  runCostSizeJob,
  runStockEODJob,
  runStockIntradayJob,
  runUniverseSync,
  runCorpActionsJob,
  runCommoditiesJob,
  runCryptoJob,
  runFxJob,
  runBenchmarkJob,
  runFoMasterJob,
  runFoBhavcopyJob,
  runFoLiveJob,
  runFuelJob,
};
