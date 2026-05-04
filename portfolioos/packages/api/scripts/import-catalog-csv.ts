/**
 * Bulk-import VehicleCatalog rows from a CSV file.
 *
 * CSV columns (header row required):
 *   category,make,model,yearFrom,yearTo,trim,baseMsrp,fuelType,bodyType,displacement,seatingCap
 *
 * Empty cells → NULL. yearTo blank means current/ongoing.
 * Idempotent — upsert by (make, model, trim, yearFrom).
 *
 * Use for ingesting Kaggle datasets, OEM dumps, OBV-style CSV exports.
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/import-catalog-csv.ts <path-to-csv>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { prisma } from '../src/lib/prisma.js';

interface Row {
  category: string;
  make: string;
  model: string;
  yearFrom: string;
  yearTo?: string;
  trim: string;
  baseMsrp?: string;
  fuelType?: string;
  bodyType?: string;
  displacement?: string;
  seatingCap?: string;
}

function blankToNull<T extends string | undefined>(v: T): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx scripts/import-catalog-csv.ts <path-to-csv>');
    process.exit(2);
  }
  const abs = resolve(file);
  const raw = readFileSync(abs, 'utf8');
  const rows: Row[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`[import] parsed ${rows.length} rows from ${abs}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const yearFrom = Number(r.yearFrom);
    if (!Number.isFinite(yearFrom) || yearFrom < 1980) {
      skipped++;
      continue;
    }
    if (!r.make || !r.model || !r.trim || !r.category) {
      skipped++;
      continue;
    }

    const yearToNum = blankToNull(r.yearTo) === null ? null : Number(r.yearTo);
    const baseMsrp = blankToNull(r.baseMsrp);
    const displacement = blankToNull(r.displacement) === null ? null : Number(r.displacement);
    const seatingCap = blankToNull(r.seatingCap) === null ? null : Number(r.seatingCap);

    const data = {
      category: r.category.trim(),
      make: r.make.trim().toUpperCase(),
      model: r.model.trim().toUpperCase(),
      yearFrom,
      yearTo: yearToNum,
      trim: r.trim.trim(),
      baseMsrp: baseMsrp,
      fuelType: blankToNull(r.fuelType)?.toUpperCase() ?? null,
      bodyType: blankToNull(r.bodyType)?.toLowerCase() ?? null,
      displacement,
      seatingCap,
      catalogSource: 'csv-import',
    };

    const existing = await prisma.vehicleCatalog.findUnique({
      where: {
        make_model_trim_yearFrom: {
          make: data.make,
          model: data.model,
          trim: data.trim,
          yearFrom: data.yearFrom,
        },
      },
      select: { id: true },
    });

    await prisma.vehicleCatalog.upsert({
      where: {
        make_model_trim_yearFrom: {
          make: data.make,
          model: data.model,
          trim: data.trim,
          yearFrom: data.yearFrom,
        },
      },
      create: data,
      update: { ...data, lastSyncedAt: new Date() },
    });

    if (existing) updated++;
    else created++;
  }

  console.log(`[import] done. created=${created} updated=${updated} skipped=${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
