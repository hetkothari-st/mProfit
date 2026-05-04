/**
 * CLI wrapper around `crawlBikewaleCatalog` (src/services/catalog/).
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/crawl-bikewale-catalog.ts
 *
 * Flags: --brand=bajaj  --resume  --dry  --limit=N
 */

import { crawlBikewaleCatalog, type BikewaleCrawlOptions } from '../src/services/catalog/bikewale.crawler.js';
import { prisma } from '../src/lib/prisma.js';

function parseFlags(): BikewaleCrawlOptions {
  const out: BikewaleCrawlOptions = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === '--resume') out.resume = true;
    else if (arg === '--dry') out.dry = true;
    else if (arg.startsWith('--brand=')) out.brand = arg.slice(8).toLowerCase();
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice(8));
  }
  return out;
}

console.log('[crawl] starting BikeWale catalog crawl');
crawlBikewaleCatalog(parseFlags())
  .then(({ variants, brands }) => console.log(`[crawl] done. variants=${variants} brands=${brands}`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
