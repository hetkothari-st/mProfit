/**
 * Rebuild every holding, and the stored capital gains behind them, once.
 *
 * `HoldingProjection` is derived data: it is only rewritten when a transaction
 * for that asset is written. So a change to how cost is computed does not
 * reach an untouched holding — it keeps whatever the previous release left
 * there. That is how a deploy can leave the Holdings page on one cost basis
 * while the lot reports and the books are on another.
 *
 * This runs at boot, after migrations, and marks itself done in `AppSetting`
 * so later deploys skip it. Every write is an upsert of derived data, so a
 * re-run (`--force`) is safe at any time.
 *
 *   node packages/api/dist/scripts/recomputeHoldings.js [--force] [--reason=...]
 */
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { recomputeAllPortfolios } from '../services/holdingsProjection.js';
import { persistCapitalGainsForPortfolio } from '../services/capitalGains.service.js';

/**
 * Bump this when a change makes the stored projections wrong. A new key runs
 * once more; the old key's marker row is left as a record of when the last
 * one ran.
 */
const MARKER_KEY = 'holdings.recompute.2026-09-fifo-book-cost';

export interface RecomputeResult {
  skipped: boolean;
  portfolios: number;
  assets: number;
  gainRows: number;
}

export async function recomputeHoldings(opts: { force?: boolean } = {}): Promise<RecomputeResult> {
  // Everything here crosses every user's rows, so it runs as the system
  // identity; under a normal session context row-level security would hide
  // the portfolios and the pass would quietly do nothing.
  return runAsSystem(async () => {
    const marker = await prisma.appSetting.findUnique({ where: { key: MARKER_KEY } });
    if (marker && !opts.force) {
      logger.info({ key: MARKER_KEY, ranAt: marker.value }, 'recompute.skipped_already_done');
      return { skipped: true, portfolios: 0, assets: 0, gainRows: 0 };
    }

    const started = Date.now();
    const { portfolios, assets } = await recomputeAllPortfolios();

    // The stored CapitalGain rows are matched against the same lots, so they
    // are refreshed in the same pass rather than left a release behind.
    let gainRows = 0;
    const ids = await prisma.portfolio.findMany({ select: { id: true } });
    for (const p of ids) {
      try {
        gainRows += await persistCapitalGainsForPortfolio(p.id);
      } catch (err) {
        // One portfolio's gains failing must not cost every other portfolio
        // its rebuilt holdings.
        logger.warn({ err, portfolioId: p.id }, 'recompute.capital_gains_failed');
      }
    }

    await prisma.appSetting.upsert({
      where: { key: MARKER_KEY },
      create: { key: MARKER_KEY, value: { at: new Date().toISOString(), portfolios, assets, gainRows } },
      update: { value: { at: new Date().toISOString(), portfolios, assets, gainRows } },
    });

    logger.info(
      { portfolios, assets, gainRows, ms: Date.now() - started },
      'recompute.completed',
    );
    return { skipped: false, portfolios, assets, gainRows };
  });
}

// Run when invoked directly (the boot hook), not when imported by a test.
if (process.argv[1]?.includes('recomputeHoldings')) {
  const force = process.argv.includes('--force');
  recomputeHoldings({ force })
    .then(async (result) => {
      await prisma.$disconnect();
      process.exit(0);
      return result;
    })
    .catch(async (err) => {
      // The API must still start: holdings are rebuilt on the next write to
      // each asset anyway, and a boot loop would be worse than stale figures.
      logger.error({ err }, 'recompute.failed');
      await prisma.$disconnect();
      process.exit(1);
    });
}
