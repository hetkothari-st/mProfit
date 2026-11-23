/**
 * Local read-path benchmark: seeds ONE heavy synthetic user, then times the service calls behind the
 * busiest screens. Not a load test (one caller, warm cache) — it finds the calls whose cost grows with
 * the size of a user's data. Run against a throwaway local DB only:
 *
 *   PERF_TXNS=12000 pnpm exec tsx scripts/perfBench.ts
 *
 * Pair with `ALTER DATABASE <db> SET log_min_duration_statement = 30;` and read the postgres log to see
 * which statements are slow.
 */
import 'dotenv/config';
import { createTestScope } from '../test/helpers/db.js';
import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { recomputeForPortfolio } from '../src/services/holdings/holdingsProjection.js';
import { listTransactions } from '../src/services/holdings/transaction.service.js';
import { getDashboardNetWorth } from '../src/services/analytics/dashboard.service.js';
import { getKpis, getCgByFy, getAssetClassXirr, getAllocationByClass } from '../src/services/analytics/analytics.service.js';
import { computeUserCapitalGains } from '../src/services/tax/capitalGains.service.js';
import { getPortfolioHoldings, getPortfolioSummary } from '../src/services/holdings/portfolio.service.js';
import { listAlerts } from '../src/services/notifications/alerts.service.js';
import { createTransaction } from '../src/services/holdings/transaction.service.js';
import { resultCache } from '../src/lib/resultCache.js';

const N_TXNS = Number(process.env.PERF_TXNS ?? 12000);
const N_STOCKS = 120;
const N_FLOWS = 3000;
const N_ALERTS = 2000;

async function main() {
  const scope = await createTestScope('perf');
  console.log('user', scope.userId, 'portfolio', scope.portfolioId);
  const tag = Date.now().toString(36);
  const stockIds: string[] = [];
  await runAsSystem(async () => {
    for (let i = 0; i < N_STOCKS; i++) {
      const s = await prisma.stockMaster.create({
        data: { symbol: `PERF${tag}${i}`, name: `Perf Stock ${i}`, exchange: 'NSE', sector: `Sector ${i % 11}` },
      });
      stockIds.push(s.id);
    }
    const rows = [];
    const base = Date.UTC(2020, 0, 1);
    for (let i = 0; i < N_TXNS; i++) {
      const stockId = stockIds[i % N_STOCKS]!;
      const sell = i % 7 === 6;
      const qty = 5 + (i % 40);
      const price = 100 + (i % 900);
      const gross = qty * price;
      rows.push({
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY' as const,
        transactionType: sell ? ('SELL' as const) : ('BUY' as const),
        stockId,
        assetKey: `stock:${stockId}`,
        tradeDate: new Date(base + Math.floor(i / 8) * 86_400_000),
        quantity: String(qty),
        price: String(price),
        grossAmount: String(gross),
        netAmount: String(gross),
        exchange: 'NSE' as const,
      });
    }
    for (let i = 0; i < rows.length; i += 2000) await prisma.transaction.createMany({ data: rows.slice(i, i + 2000) });
    await prisma.cashFlow.createMany({
      data: Array.from({ length: N_FLOWS }, (_, i) => ({
        portfolioId: scope.portfolioId,
        date: new Date(base + i * 86_400_000 * 0.5),
        type: i % 2 ? ('INFLOW' as const) : ('OUTFLOW' as const),
        amount: String(1000 + (i % 500)),
      })),
    });
    await prisma.alert.createMany({
      data: Array.from({ length: N_ALERTS }, (_, i) => ({
        userId: scope.userId,
        type: 'SYSTEM' as const,
        title: `Alert ${i}`,
        triggerDate: new Date(base + i * 3_600_000),
      })),
    });
  });
  let t = Date.now();
  await runAsSystem(() => recomputeForPortfolio(scope.portfolioId));
  console.log(`seed ok; projection rebuild ${Date.now() - t} ms\n`);

  const u = scope.userId;
  const cases: [string, () => Promise<unknown>][] = [
    ['transactions page 1 (50)', () => listTransactions(u, { page: 1, pageSize: 50 })],
    ['transactions page 1 + search', () => listTransactions(u, { page: 1, pageSize: 50, q: 'Perf Stock 7' })],
    ['dashboard net worth', () => getDashboardNetWorth(u)],
    ['analytics KPIs', () => getKpis({ kind: 'user', userId: u })],
    ['analytics allocation', () => getAllocationByClass({ kind: 'user', userId: u })],
    ['analytics CG by FY', () => getCgByFy({ kind: 'user', userId: u })],
    ['analytics asset-class XIRR', () => getAssetClassXirr({ kind: 'user', userId: u })],
    ['capital gains (user)', () => computeUserCapitalGains(u)],
    ['portfolio summary', () => getPortfolioSummary(u, scope.portfolioId)],
    ['portfolio holdings', () => getPortfolioHoldings(u, scope.portfolioId)],
    ['alerts page 1', () => listAlerts(u, { page: 1, limit: 20 } as never)],
  ];
  // The first CACHED call in a fresh process only opens the Redis connection (it computes uncached).
  await scope.runAs(() => getCgByFy({ kind: 'user', userId: u }));
  await resultCache.flush();
  await new Promise((r) => setTimeout(r, 500));
  console.log('case'.padEnd(32), 'cold ms', 'warm ms');
  for (const [name, fn] of cases) {
    try {
      const run = async () => {
        const s = Date.now();
        await scope.runAs(fn);
        return Date.now() - s;
      };
      const cold = await run();
      const warm = await run();
      console.log(name.padEnd(32), String(cold).padStart(7), String(warm).padStart(7));
    } catch (e) {
      console.log(name.padEnd(32), 'ERROR', (e as Error).message.slice(0, 90));
    }
  }
  // Cache invalidation check: a user's own write must show on the very next read.
  const before = (await scope.runAs(() => getKpis({ kind: 'user', userId: u }))).totalCost;
  await scope.runAs(() =>
    createTransaction(u, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      stockSymbol: `PERF${tag}0`,
      exchange: 'NSE',
      tradeDate: '2026-06-01',
      quantity: '10',
      price: '5555',
    }),
  );
  await resultCache.flush();
  t = Date.now();
  const after = (await scope.runAs(() => getKpis({ kind: 'user', userId: u }))).totalCost;
  console.log(`
after a write: KPIs totalCost ${before} -> ${after} (${after !== before ? 'FRESH' : 'STALE!'}), ${Date.now() - t} ms`);
  if (process.env.PERF_KEEP !== '1') await scope.cleanup();
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
