import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface FmvSeedRow {
  isin: string;
  scripName: string;
  fmvPerUnit: string;
}

function loadSeedFile(filename: string): FmvSeedRow[] {
  const seedPath = path.join(__dirname, filename);
  if (!fs.existsSync(seedPath)) return [];
  return JSON.parse(fs.readFileSync(seedPath, 'utf8')) as FmvSeedRow[];
}

export interface SeedFmvResult {
  totalRows: number;
  stockRows: number;
  mfRows: number;
}

/**
 * Upserts the 31-Jan-2018 FMV seed (stocks + mutual funds, both keyed by
 * ISIN into the same SystemFmvSeed table) using whichever PrismaClient the
 * caller passes — so it composes into `prisma/seed.ts`'s single run instead
 * of opening a second DB connection. Safe to call every time `db:seed` runs:
 * it's a pure upsert against a global (non-user-scoped) table.
 */
export async function seedFmv(prisma: PrismaClient): Promise<SeedFmvResult> {
  const stockRows = loadSeedFile('fmv_31jan2018_seed.json');
  const mfRows = loadSeedFile('fmv_mf_31jan2018_seed.json');
  const seedData = [...stockRows, ...mfRows];

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

  return { totalRows: seedData.length, stockRows: stockRows.length, mfRows: mfRows.length };
}

// Still runnable standalone: `pnpm --filter @everypaisa/api run seed:fmv`.
// Uses the direct (superuser) URL so it bypasses RLS, same pattern as
// prisma/seed.ts — SystemFmvSeed has no userId column to filter on.
async function runStandalone() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' } },
  });
  try {
    const result = await seedFmv(prisma);
    console.log(
      `Seeded ${result.totalRows} FMV records (${result.stockRows} stocks + ${result.mfRows} mutual funds).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runStandalone().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
