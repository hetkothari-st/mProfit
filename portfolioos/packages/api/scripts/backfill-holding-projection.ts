/**
 * One-shot backfill for §4.10 step 4: replay every existing Transaction row
 * through `recomputeForAsset` to populate `HoldingProjection`. Also runs the
 * parity check against the legacy `Holding` table (§4.10 step 5).
 *
 * Run: `pnpm --filter @portfolioos/api tsx scripts/backfill-holding-projection.ts`
 *
 * Idempotent — every asset row is upserted, so re-running reconciles any
 * drift that slipped in between runs (e.g. if a worker wrote during backfill).
 */

import { prisma } from '../src/lib/prisma.js';
import { recomputeAllPortfolios } from '../src/services/holdingsProjection.js';

async function main() {
  const beforeHolding = await prisma.holding.count();
  const beforeProjection = await prisma.holdingProjection.count();
  console.log(`[pre-backfill]  Holding=${beforeHolding}  HoldingProjection=${beforeProjection}`);

  const t0 = Date.now();
  const { portfolios, assets } = await recomputeAllPortfolios();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[backfill]      replayed ${assets} (portfolio,asset) groups across ${portfolios} portfolios in ${dt}s`);

  const afterHolding = await prisma.holding.count();
  const afterProjection = await prisma.holdingProjection.count();
  console.log(`[post-backfill] Holding=${afterHolding}  HoldingProjection=${afterProjection}`);

  // Parity report: compare each portfolio's legacy Holding count vs projection.
  const portfolioCounts = await prisma.portfolio.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { holdings: true, holdingProjections: true } },
    },
  });
  const mismatches = portfolioCounts.filter(
    (p) => p._count.holdings !== p._count.holdingProjections,
  );
  if (mismatches.length === 0) {
    console.log('[parity]        row counts match for every portfolio');
  } else {
    console.log(`[parity]        ${mismatches.length} portfolios differ:`);
    for (const p of mismatches) {
      console.log(
        `  - ${p.name} (${p.id}): Holding=${p._count.holdings}  Projection=${p._count.holdingProjections}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
