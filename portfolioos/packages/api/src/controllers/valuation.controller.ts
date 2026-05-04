import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  getOrComputeQuote,
  autoValuateVehicle,
  saveValuationToVehicle,
} from '../services/valuation/quoteService.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

// ─── Catalog cascade routes ──

export async function listCategories(_req: Request, res: Response) {
  const rows = await prisma.vehicleCatalog.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  ok(res, rows.map((r) => r.category));
}

export async function listMakes(req: Request, res: Response) {
  const category = typeof req.query['category'] === 'string' ? req.query['category'] : null;
  const rows = await prisma.vehicleCatalog.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    select: { make: true },
    distinct: ['make'],
    orderBy: { make: 'asc' },
  });
  ok(res, rows.map((r) => r.make));
}

export async function listModels(req: Request, res: Response) {
  const make = typeof req.query['make'] === 'string' ? req.query['make'] : null;
  if (!make) return ok(res, []);
  const rows = await prisma.vehicleCatalog.findMany({
    where: { isActive: true, make: { equals: make, mode: 'insensitive' } },
    select: { model: true },
    distinct: ['model'],
    orderBy: { model: 'asc' },
  });
  ok(res, rows.map((r) => r.model));
}

export async function listYears(req: Request, res: Response) {
  const make = typeof req.query['make'] === 'string' ? req.query['make'] : null;
  const model = typeof req.query['model'] === 'string' ? req.query['model'] : null;
  if (!make || !model) return ok(res, []);
  const rows = await prisma.vehicleCatalog.findMany({
    where: {
      isActive: true,
      make: { equals: make, mode: 'insensitive' },
      model: { equals: model, mode: 'insensitive' },
    },
    select: { yearFrom: true, yearTo: true },
  });
  // Expand year ranges to discrete years.
  // For active models (yearTo IS NULL) we also surface up to 7 prior years so
  // users can value an older example — used-car adapters have data going back
  // ~7-10 years; the catalog crawler can only know the *current* MSRP.
  const years = new Set<number>();
  const currentYear = new Date().getFullYear();
  const HISTORY_YEARS = 7;
  for (const r of rows) {
    const end = r.yearTo ?? currentYear;
    const start = r.yearTo === null
      ? Math.min(r.yearFrom, currentYear - HISTORY_YEARS)
      : r.yearFrom;
    for (let y = start; y <= end; y++) years.add(y);
  }
  ok(res, Array.from(years).sort((a, b) => b - a));
}

export async function listTrims(req: Request, res: Response) {
  const make = typeof req.query['make'] === 'string' ? req.query['make'] : null;
  const model = typeof req.query['model'] === 'string' ? req.query['model'] : null;
  const yearStr = typeof req.query['year'] === 'string' ? req.query['year'] : null;
  if (!make || !model || !yearStr) return ok(res, []);
  const year = Number(yearStr);
  if (!Number.isFinite(year)) return ok(res, []);
  const HISTORY_YEARS = 7;
  // For active models (yearTo IS NULL) we accept years up to 7 years before
  // launch — used-car adapters can still resolve a price even though the
  // catalog only has current trims/MSRP.
  const rows = await prisma.vehicleCatalog.findMany({
    where: {
      isActive: true,
      make: { equals: make, mode: 'insensitive' },
      model: { equals: model, mode: 'insensitive' },
      OR: [
        {
          yearFrom: { lte: year },
          OR: [{ yearTo: null }, { yearTo: { gte: year } }],
        },
        {
          yearTo: null,
          yearFrom: { lte: year + HISTORY_YEARS },
        },
      ],
    },
    select: {
      trim: true,
      baseMsrp: true,
      fuelType: true,
      bodyType: true,
      seatingCap: true,
      displacement: true,
      category: true,
    },
    orderBy: { trim: 'asc' },
  });
  ok(res, rows.map((r) => ({
    trim: r.trim,
    baseMsrp: r.baseMsrp?.toString() ?? null,
    fuelType: r.fuelType,
    bodyType: r.bodyType,
    seatingCap: r.seatingCap,
    displacement: r.displacement,
    category: r.category,
  })));
}

// ─── Quote routes ──

const quoteBodySchema = z.object({
  category: z.string().optional(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  trim: z.string().min(1),
  kms: z.number().int().min(0).max(1_000_000),
  txnType: z.enum(['BUY', 'SELL']),
  partyType: z.enum(['INDIVIDUAL', 'DEALER']),
});

export async function quote(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = quoteBodySchema.parse(req.body ?? {});
  const result = await getOrComputeQuote({ userId: req.user.id, ...body });
  ok(res, result);
}

const autoBodySchema = z.object({
  txnType: z.enum(['BUY', 'SELL']).default('SELL'),
  partyType: z.enum(['INDIVIDUAL', 'DEALER']).default('INDIVIDUAL'),
});

export async function autoValuate(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const params = autoBodySchema.parse(req.query ?? {});
  const result = await autoValuateVehicle(
    req.user.id,
    req.params['vehicleId']!,
    params.txnType,
    params.partyType,
  );
  ok(res, result);
}

const saveBodySchema = z.object({
  cacheKey: z.string().min(8),
  sliderSnapshot: z.record(z.string(), z.string()),
  adjustedPrice: z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string'),
  txnType: z.enum(['BUY', 'SELL']),
  partyType: z.enum(['INDIVIDUAL', 'DEALER']),
});

export async function save(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = saveBodySchema.parse(req.body ?? {});
  const result = await saveValuationToVehicle({
    userId: req.user.id,
    vehicleId: req.params['vehicleId']!,
    ...body,
  });
  ok(res, result);
}
