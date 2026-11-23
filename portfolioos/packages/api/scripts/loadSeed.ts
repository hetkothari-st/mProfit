/**
 * Seeds a throwaway LOCAL database with a realistic mix of users for scripts/loadTest.mjs and writes their
 * access tokens to LOAD_TOKENS_FILE. Mix: 70% light (80 txns), 25% medium (600), 5% heavy (6000).
 *
 *   LOAD_USERS=1000 LOAD_TOKENS_FILE=tokens.json pnpm exec tsx scripts/loadSeed.ts
 *
 * Refuses anything that is not a local database.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isLocalDatabaseUrl } from './localDbGuard.js';

if (!isLocalDatabaseUrl(process.env.DATABASE_URL ?? '')) {
  console.error('Refusing: DATABASE_URL is not a local database.');
  process.exit(1);
}

const { prisma } = await import('../src/lib/prisma.js');
const { runAsSystem } = await import('../src/lib/requestContext.js');
const { recomputeForPortfolio } = await import('../src/services/holdings/holdingsProjection.js');
const { signAccessToken } = await import('../src/services/auth/jwt.service.js');

const N_USERS = Number(process.env.LOAD_USERS ?? 1000);
const OUT = process.env.LOAD_TOKENS_FILE ?? 'load-tokens.json';
const N_STOCKS = 150;

function tierFor(i: number): { tier: 'light' | 'medium' | 'heavy'; txns: number } {
  const r = i % 20;
  if (r === 0) return { tier: 'heavy', txns: 6000 };
  if (r <= 5) return { tier: 'medium', txns: 600 };
  return { tier: 'light', txns: 80 };
}

const tag = Date.now().toString(36);
const stockIds: string[] = [];
await runAsSystem(async () => {
  for (let i = 0; i < N_STOCKS; i++) {
    const s = await prisma.stockMaster.create({
      data: { symbol: `LOAD${tag}${i}`, name: `Load Stock ${i}`, exchange: 'NSE', sector: `Sector ${i % 11}` },
    });
    stockIds.push(s.id);
  }
});

const out: Array<{ userId: string; portfolioId: string; token: string; tier: string }> = [];
const base = Date.UTC(2021, 0, 1);
const t0 = Date.now();

for (let u = 0; u < N_USERS; u++) {
  const { tier, txns } = tierFor(u);
  const email = `load-${tag}-${u}@test.local`;
  const res = await runAsSystem(async () => {
    const user = await prisma.user.create({
      data: { email, passwordHash: 'load-not-a-real-hash', name: `Load User ${u}` },
    });
    const portfolio = await prisma.portfolio.create({
      data: { userId: user.id, name: 'Load portfolio', isDefault: true, currency: 'INR', type: 'INVESTMENT' },
    });
    const nStocks = Math.min(N_STOCKS, tier === 'light' ? 8 : tier === 'medium' ? 30 : 120);
    const rows = [];
    for (let i = 0; i < txns; i++) {
      const stockId = stockIds[(i + u) % nStocks]!;
      const sell = i % 7 === 6;
      const qty = 5 + (i % 40);
      const price = 100 + ((i * 13 + u) % 900);
      const gross = qty * price;
      rows.push({
        portfolioId: portfolio.id,
        assetClass: 'EQUITY' as const,
        transactionType: sell ? ('SELL' as const) : ('BUY' as const),
        stockId,
        assetKey: `stock:${stockId}`,
        tradeDate: new Date(base + Math.floor(i / 4) * 86_400_000),
        quantity: String(qty),
        price: String(price),
        grossAmount: String(gross),
        netAmount: String(gross),
        exchange: 'NSE' as const,
      });
    }
    for (let i = 0; i < rows.length; i += 2000) await prisma.transaction.createMany({ data: rows.slice(i, i + 2000) });
    await prisma.alert.createMany({
      data: Array.from({ length: Math.min(40, txns) }, (_, i) => ({
        userId: user.id,
        type: 'SYSTEM' as const,
        title: `Alert ${i}`,
        triggerDate: new Date(base + i * 3_600_000),
      })),
    });
    await recomputeForPortfolio(portfolio.id);
    return { user, portfolio };
  });
  const { token } = signAccessToken({
    sub: res.user.id,
    email: res.user.email,
    role: res.user.role,
    plan: res.user.plan,
  });
  out.push({ userId: res.user.id, portfolioId: res.portfolio.id, token, tier });
  if ((u + 1) % 50 === 0) console.log(`seeded ${u + 1}/${N_USERS} users, ${Math.round((Date.now() - t0) / 1000)}s`);
}

writeFileSync(OUT, JSON.stringify({ seedId: randomUUID(), tag, users: out }));
console.log(`done: ${out.length} users -> ${OUT}`);
await prisma.$disconnect();
process.exit(0);
