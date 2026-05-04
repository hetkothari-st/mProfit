/**
 * Vehicle catalog refresh — pulls latest variants/MSRPs from CarDekho + BikeWale.
 *
 * Schedule: monthly @ 04:00 IST on the 5th (after RTO data settle, before
 * vehicle weekly refresh's busy window). Walks every brand-slug, upserts
 * with `catalogSource = 'cardekho-crawl'` / `'bikewale-crawl'` and
 * `lastSyncedAt = now()`. New trims appear automatically; price changes
 * propagate via update path.
 *
 * Wrapped in `runAsSystem` — VehicleCatalog is shared/global, but RLS
 * middleware still expects a user context for the request.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { crawlCardekhoCatalog } from '../services/catalog/cardekho.crawler.js';
import { crawlBikewaleCatalog } from '../services/catalog/bikewale.crawler.js';

const TZ = 'Asia/Kolkata';

const running = { catalog: false };

interface CatalogRefreshOutcome {
  cardekho: { variants: number; brands: number };
  bikewale: { variants: number; brands: number };
}

export async function runCatalogRefresh(): Promise<CatalogRefreshOutcome | null> {
  if (running.catalog) {
    logger.warn('[cron] catalog refresh already running — skipping');
    return null;
  }
  running.catalog = true;
  const t0 = Date.now();
  try {
    return await runAsSystem(async () => {
      logger.info('[cron] catalog refresh: CarDekho start');
      const cd = await crawlCardekhoCatalog();
      logger.info({ ...cd }, '[cron] catalog refresh: CarDekho done');

      logger.info('[cron] catalog refresh: BikeWale start');
      const bw = await crawlBikewaleCatalog();
      logger.info({ ...bw }, '[cron] catalog refresh: BikeWale done');

      const totalMs = Date.now() - t0;
      logger.info(
        { cardekhoVariants: cd.variants, bikewaleVariants: bw.variants, totalMs },
        '[cron] catalog refresh complete',
      );
      return { cardekho: cd, bikewale: bw };
    });
  } catch (err) {
    logger.error({ err }, '[cron] catalog refresh failed');
    return null;
  } finally {
    running.catalog = false;
  }
}

export function startCatalogJobs(): void {
  if (process.env['ENABLE_CATALOG_CRONS'] === 'false') {
    logger.info('[cron] catalog jobs disabled via ENABLE_CATALOG_CRONS=false');
    return;
  }

  // 5th of every month, 04:00 IST
  cron.schedule('0 4 5 * *', () => void runCatalogRefresh(), {
    timezone: TZ,
  });

  logger.info('[cron] scheduled: catalog refresh monthly 5th @04:00 IST');
}
