/**
 * Local-only demo data: gives the seeded demo user a portfolio with enough
 * shape to judge the analytics page — three years of SIPs, a few direct
 * stocks, winners and losers, some booked gains, and an FD.
 *
 * Writes through Prisma with the DIRECT_URL role, so it is a developer tool,
 * not an app path. Never point this at a real database.
 */
import { PrismaClient, type AssetClass, type TransactionType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { recomputeForPortfolio } from '../src/services/holdingsProjection.js';
import { computeAssetKey } from '../src/services/assetKey.js';
import { runAsUser } from '../src/lib/requestContext.js';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url || !/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error('Refusing to run: DIRECT_URL must point at a local database.');
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

const DEMO_EMAIL = 'demo@everypaisa.in';

function day(offsetDays: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d;
}

interface Row {
  type: TransactionType;
  assetClass: AssetClass;
  assetName: string;
  symbol?: string;
  stockId?: string;
  isin?: string;
  qty: number;
  price: number;
  daysAgo: number;
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
  const portfolio = await prisma.portfolio.findFirstOrThrow({
    where: { userId: user.id, name: 'Long Term' },
  });

  await prisma.transaction.deleteMany({ where: { portfolioId: portfolio.id } });

  const stocks = await prisma.stockMaster.findMany({
    where: { symbol: { in: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC', 'TATAMOTORS'] } },
  });
  const bySymbol = new Map(stocks.map((s) => [s.symbol, s]));

  const rows: Row[] = [];

  // A monthly SIP into one fund for three years, units rising in price.
  for (let m = 36; m >= 1; m--) {
    rows.push({
      type: 'SIP',
      assetClass: 'MUTUAL_FUND',
      assetName: 'Parag Parikh Flexi Cap Fund - Direct Growth',
      isin: 'INF879O01027',
      qty: 250 / (40 + (36 - m) * 0.55),
      price: 40 + (36 - m) * 0.55,
      daysAgo: m * 30,
    });
  }

  // Direct stocks: two long-term winners, one long-term loser, one recent buy
  // that is still short-term — enough to make the what-if and harvest cards real.
  const picks: Array<[string, number, number, number]> = [
    // symbol, qty, buy price, days ago
    ['RELIANCE', 60, 2250, 900],
    ['TCS', 40, 3100, 780],
    ['HDFCBANK', 90, 1620, 640],
    ['INFY', 70, 1850, 420],
    ['ITC', 300, 505, 200],
    ['TATAMOTORS', 120, 980, 45],
  ];
  for (const [symbol, qty, price, daysAgo] of picks) {
    const s = bySymbol.get(symbol);
    if (!s) continue;
    rows.push({
      type: 'BUY',
      assetClass: 'EQUITY',
      assetName: s.name,
      symbol,
      stockId: s.id,
      isin: s.isin ?? undefined,
      qty,
      price,
      daysAgo,
    });
  }

  // Two sales, so there are realised gains this financial year.
  rows.push({
    type: 'SELL',
    assetClass: 'EQUITY',
    assetName: bySymbol.get('RELIANCE')!.name,
    symbol: 'RELIANCE',
    stockId: bySymbol.get('RELIANCE')!.id,
    qty: 20,
    price: 2980,
    daysAgo: 70,
  });
  rows.push({
    type: 'SELL',
    assetClass: 'EQUITY',
    assetName: bySymbol.get('ITC')!.name,
    symbol: 'ITC',
    stockId: bySymbol.get('ITC')!.id,
    qty: 100,
    price: 455,
    daysAgo: 30,
  });

  // A fixed deposit, to prove deposits stay out of the harvest candidates.
  rows.push({
    type: 'DEPOSIT',
    assetClass: 'FIXED_DEPOSIT',
    assetName: 'HDFC Bank FD 7.1% 2028',
    qty: 1,
    price: 500000,
    daysAgo: 500,
  });

  for (const r of rows) {
    const amount = new Decimal(r.qty).times(r.price);
    await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        transactionType: r.type,
        assetClass: r.assetClass,
        assetName: r.assetName,
        stockId: r.stockId ?? null,
        isin: r.isin ?? null,
        assetKey: computeAssetKey({
          stockId: r.stockId ?? null,
          isin: r.isin ?? null,
          assetName: r.assetName,
        }),
        quantity: new Decimal(r.qty).toDecimalPlaces(6).toString(),
        price: new Decimal(r.price).toDecimalPlaces(4).toString(),
        grossAmount: amount.toDecimalPlaces(4).toString(),
        netAmount: amount.toDecimalPlaces(4).toString(),
        tradeDate: day(r.daysAgo),
        sourceHash: `local-demo:${randomUUID()}`,
      },
    });
  }

  // Current prices, so the value line and unrealised P&L have something to
  // work with: most up, Infosys and Tata Motors down.
  const marks: Array<[string, number]> = [
    ['RELIANCE', 3020],
    ['TCS', 4150],
    ['HDFCBANK', 1975],
    ['INFY', 1480],
    ['ITC', 470],
    ['TATAMOTORS', 720],
  ];
  for (const [symbol, price] of marks) {
    const s = bySymbol.get(symbol);
    if (!s) continue;
    await prisma.stockPrice.upsert({
      where: { stockId_date: { stockId: s.id, date: day(0) } },
      update: { close: new Decimal(price).toString() },
      create: {
        stockId: s.id,
        date: day(0),
        open: new Decimal(price).toString(),
        high: new Decimal(price).toString(),
        low: new Decimal(price).toString(),
        close: new Decimal(price).toString(),
      },
    });
  }

  // The projection service reads through the RLS-scoped app client, which
  // sees nothing without a user context.
  await runAsUser(user.id, () => recomputeForPortfolio(portfolio.id));

  const holdings = await prisma.holdingProjection.count({ where: { portfolioId: portfolio.id } });
  console.log(`✓ ${rows.length} transactions, ${holdings} holdings on "${portfolio.name}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
