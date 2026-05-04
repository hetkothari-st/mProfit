import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED_STOCKS } from '../src/priceFeeds/nseSeed.js';
import { seedVehicleCatalog } from './seeds/vehicleCatalog.js';
import { seedVehicleCatalogExtended } from './seeds/vehicleCatalogExtended.js';

// Use the direct (superuser) URL so the seed bypasses Row-Level Security policies.
// The app runtime still uses the restricted portfolioos_app role via DATABASE_URL.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' } },
});

async function main() {
  const email = 'demo@portfolioos.in';
  const passwordHash = await bcrypt.hash('Demo@1234', 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Demo Investor',
      role: 'INVESTOR',
      plan: 'PLUS',
    },
  });

  const portfolioSeeds = [
    { name: 'Long Term', description: 'Buy-and-hold equity & MF', type: 'INVESTMENT' as const, isDefault: true },
    { name: 'Trading', description: 'Active trading positions', type: 'TRADING' as const, isDefault: false },
    { name: 'F&O', description: 'Futures & options', type: 'TRADING' as const, isDefault: false },
  ];

  for (const seed of portfolioSeeds) {
    const existing = await prisma.portfolio.findFirst({
      where: { userId: user.id, name: seed.name },
    });
    if (!existing) {
      await prisma.portfolio.create({
        data: { ...seed, userId: user.id, currency: 'INR' },
      });
    }
  }

  let stocksCreated = 0;
  for (const stock of SEED_STOCKS) {
    const existingBySymbol = await prisma.stockMaster.findUnique({ where: { symbol: stock.symbol } });
    if (existingBySymbol) continue;
    if (stock.isin) {
      const existingByIsin = await prisma.stockMaster.findUnique({ where: { isin: stock.isin } });
      if (existingByIsin) continue;
    }
    try {
      await prisma.stockMaster.create({ data: stock });
      stocksCreated++;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') continue;
      throw err;
    }
  }

  console.log('✓ Seeded demo user:', email, '/ Demo@1234');
  console.log(`✓ Seeded ${stocksCreated} new NSE stocks (${SEED_STOCKS.length - stocksCreated} already existed)`);

  const coreCatalog = await seedVehicleCatalog(prisma);
  const extendedCatalog = await seedVehicleCatalogExtended(prisma);
  console.log(`✓ Seeded ${coreCatalog + extendedCatalog} vehicle catalog rows (${coreCatalog} core + ${extendedCatalog} extended)`);

  console.log('Tip: run `POST /api/admin/amfi-nav/sync` or the scheduled cron to populate MF master data');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
