import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// Global (non-user-scoped) table — seed with the direct/superuser URL and
// bypass the RLS-wrapped client from lib/prisma.ts entirely, same pattern
// as prisma/seed.ts. SystemFmvSeed has no userId column to filter on.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' } },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface FmvSeedRow {
  isin: string;
  scripName: string;
  fmvPerUnit: string;
}

async function seedFmv() {
  const seedPath = path.join(__dirname, 'fmv_31jan2018_seed.json');
  const seedData: FmvSeedRow[] = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  console.log(`Seeding ${seedData.length} FMV records...`);

  for (const row of seedData) {
    await prisma.systemFmvSeed.upsert({
      where: { isin: row.isin },
      create: {
        isin: row.isin,
        scripName: row.scripName,
        fmvPerUnit: row.fmvPerUnit,
      },
      update: {
        scripName: row.scripName,
        fmvPerUnit: row.fmvPerUnit,
      },
    });
  }

  console.log('Done.');
}

seedFmv()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
