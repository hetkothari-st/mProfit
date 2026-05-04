/**
 * CLI wrapper around `crawlCardekhoCatalog` (src/services/catalog/).
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/crawl-cardekho-catalog.ts
 *
 * Flags:
 *   --brand=maruti     only crawl this brand-slug
 *   --resume           skip brands already in checkpoint
 *   --dry              parse but don't write to DB
 *   --limit=N          crawl at most N models total
 */

import { crawlCardekhoCatalog, type CardekhoCrawlOptions } from '../src/services/catalog/cardekho.crawler.js';
import { prisma } from '../src/lib/prisma.js';

function parseFlags(): CardekhoCrawlOptions {
  const out: CardekhoCrawlOptions = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === '--resume') out.resume = true;
    else if (arg === '--dry') out.dry = true;
    else if (arg.startsWith('--brand=')) out.brand = arg.slice(8).toLowerCase();
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice(8));
  }
  return out;
}

console.log('[crawl] starting CarDekho catalog crawl');
crawlCardekhoCatalog(parseFlags())
  .then(({ variants, brands }) => console.log(`[crawl] done. variants=${variants} brands=${brands}`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
