/**
 * Valuation quote service.
 *
 * Coordinates: cache check → adapter chain → bucket computation → cache write.
 * Returns a fully-formed quote (5-bucket prices + projections) ready for UI.
 *
 * Cache key is deterministic over (make, model, year, trim, kmsBucket,
 * txnType, partyType) so repeat queries within 24h hit the cache.
 */

import crypto from 'node:crypto';
import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import {
  applyCondition,
  applyModeDelta,
  defaultSliderState,
  type SliderStop,
  futureValue,
  residualValue,
  salvageValue,
  clunkerValue,
  type ValuationQuoteResult,
} from '@portfolioos/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { runValuationChain } from '../../adapters/valuation/chain.js';
import type { ValuationQueryInput } from '../../adapters/valuation/types.js';
import { BadRequestError } from '../../lib/errors.js';

const KMS_BUCKET_SIZE = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// "Bad" condition is below the slider scale (heavily-damaged, near-junk).
// Documented multiplier vs base "good" price.
const BAD_CONDITION_MULTIPLIER = '0.65';

function kmsBucket(kms: number): number {
  return Math.floor(kms / KMS_BUCKET_SIZE) * KMS_BUCKET_SIZE;
}

function computeCacheKey(q: ValuationQueryInput): string {
  const k = `${q.make}|${q.model}|${q.year}|${q.trim}|${kmsBucket(q.kms)}|${q.txnType}|${q.partyType}`;
  return crypto.createHash('sha256').update(k).digest('hex').slice(0, 32);
}

function bucketAt(basePriceGood: Decimal, stop: SliderStop): Decimal {
  return applyCondition(basePriceGood, defaultSliderState(stop));
}

export interface QuoteServiceInput extends ValuationQueryInput {
  userId: string;
}

export async function getOrComputeQuote(input: QuoteServiceInput): Promise<ValuationQuoteResult> {
  if (!input.make || !input.model || !input.year || !input.trim) {
    throw new BadRequestError('make, model, year, trim required');
  }
  if (input.kms < 0) throw new BadRequestError('kms must be ≥ 0');

  const cacheKey = computeCacheKey(input);

  // Cache check
  const cached = await prisma.vehicleValuation.findUnique({ where: { cacheKey } });
  if (cached && cached.expiresAt > new Date()) {
    return {
      cacheKey,
      buckets: {
        bad:       cached.priceBad.toString(),
        fair:      cached.priceFair.toString(),
        good:      cached.priceGood.toString(),
        veryGood:  cached.priceVeryGood.toString(),
        excellent: cached.priceExcellent.toString(),
      },
      projections: {
        future1y:      cached.future1y.toString(),
        future3y:      cached.future3y.toString(),
        future5y:      cached.future5y.toString(),
        residualValue: cached.residualValue.toString(),
        salvageValue:  cached.salvageValue.toString(),
        clunkerValue:  cached.clunkerValue.toString(),
      },
      sources:    Array.isArray(cached.sources) ? (cached.sources as string[]) : [],
      isEstimated: cached.isEstimated,
      computedAt: cached.computedAt.toISOString(),
      expiresAt:  cached.expiresAt.toISOString(),
    };
  }

  // Look up baseMsrp from catalog (helps DepreciationAdapter)
  const catalog = await prisma.vehicleCatalog.findFirst({
    where: {
      make: { equals: input.make, mode: 'insensitive' },
      model: { equals: input.model, mode: 'insensitive' },
      trim: { equals: input.trim, mode: 'insensitive' },
      yearFrom: { lte: input.year },
      OR: [{ yearTo: null }, { yearTo: { gte: input.year } }],
    },
    orderBy: { yearFrom: 'desc' },
  });
  const baseMsrp = catalog?.baseMsrp ? new Decimal(catalog.baseMsrp.toString()) : null;

  // Run adapter chain
  const outcome = await runValuationChain({
    userId: input.userId,
    query: { ...input, baseMsrp },
  });

  if (!outcome.ok || !outcome.priceGood) {
    throw new BadRequestError(
      'Market data temporarily unavailable for this vehicle. Please try again later or use a different trim.',
    );
  }

  // Apply mode delta (Buy/Sell × Individual/Dealer)
  const adjustedGood = applyModeDelta(outcome.priceGood, input.txnType, input.partyType);

  // 5 buckets — fair/good/veryGood/excellent come from the slider stop values;
  // "bad" is below the slider scale (heavily-damaged), explicitly multiplied.
  const buckets = {
    bad:       adjustedGood.mul(BAD_CONDITION_MULTIPLIER).toFixed(2),
    fair:      bucketAt(adjustedGood, 'fair').toFixed(2),
    good:      adjustedGood.toFixed(2),
    veryGood:  bucketAt(adjustedGood, 'veryGood').toFixed(2),
    excellent: bucketAt(adjustedGood, 'excellent').toFixed(2),
  };

  // Projections
  const projections = {
    future1y:      futureValue(adjustedGood, 1).toFixed(2),
    future3y:      futureValue(adjustedGood, 3).toFixed(2),
    future5y:      futureValue(adjustedGood, 5).toFixed(2),
    residualValue: residualValue(adjustedGood).toFixed(2),
    salvageValue:  salvageValue(adjustedGood).toFixed(2),
    clunkerValue:  clunkerValue(input.category ?? catalog?.category).toFixed(2),
  };

  const now = new Date();
  const expires = new Date(now.getTime() + CACHE_TTL_MS);

  // Persist cache
  try {
    await prisma.vehicleValuation.upsert({
      where: { cacheKey },
      update: {
        priceBad: buckets.bad,
        priceFair: buckets.fair,
        priceGood: buckets.good,
        priceVeryGood: buckets.veryGood,
        priceExcellent: buckets.excellent,
        future1y: projections.future1y,
        future3y: projections.future3y,
        future5y: projections.future5y,
        residualValue: projections.residualValue,
        salvageValue: projections.salvageValue,
        clunkerValue: projections.clunkerValue,
        sources: outcome.sources as Prisma.InputJsonValue,
        isEstimated: outcome.isEstimated,
        computedAt: now,
        expiresAt: expires,
      },
      create: {
        cacheKey,
        make: input.make,
        model: input.model,
        year: input.year,
        trim: input.trim,
        kmsBucket: kmsBucket(input.kms),
        txnType: input.txnType,
        partyType: input.partyType,
        priceBad: buckets.bad,
        priceFair: buckets.fair,
        priceGood: buckets.good,
        priceVeryGood: buckets.veryGood,
        priceExcellent: buckets.excellent,
        future1y: projections.future1y,
        future3y: projections.future3y,
        future5y: projections.future5y,
        residualValue: projections.residualValue,
        salvageValue: projections.salvageValue,
        clunkerValue: projections.clunkerValue,
        sources: outcome.sources as Prisma.InputJsonValue,
        isEstimated: outcome.isEstimated,
        computedAt: now,
        expiresAt: expires,
      },
    });
  } catch (err) {
    logger.warn({ err, cacheKey }, '[valuation] cache upsert failed (non-fatal)');
  }

  return {
    cacheKey,
    buckets,
    projections,
    sources: outcome.sources,
    isEstimated: outcome.isEstimated,
    computedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

/**
 * Auto-valuation: derives query inputs from a saved Vehicle row (for
 * "Use my car" auto-fill flow). Best-effort match on trim from
 * `Vehicle.variant` against the catalog.
 */
export async function autoValuateVehicle(
  userId: string,
  vehicleId: string,
  txnType: 'BUY' | 'SELL' = 'SELL',
  partyType: 'INDIVIDUAL' | 'DEALER' = 'INDIVIDUAL',
): Promise<{ quote: ValuationQuoteResult; resolved: { make: string; model: string; year: number; trim: string; category: string | null } }> {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId } });
  if (!v) throw new BadRequestError('Vehicle not found');
  if (!v.make || !v.model || !v.manufacturingYear) {
    throw new BadRequestError('Vehicle missing make/model/year — refresh RC first');
  }

  // Resolve a trim from catalog using fuzzy variant match
  const trims = await prisma.vehicleCatalog.findMany({
    where: {
      make: { equals: v.make, mode: 'insensitive' },
      model: { equals: v.model, mode: 'insensitive' },
      yearFrom: { lte: v.manufacturingYear },
      OR: [{ yearTo: null }, { yearTo: { gte: v.manufacturingYear } }],
    },
    orderBy: { yearFrom: 'desc' },
  });
  if (trims.length === 0) {
    throw new BadRequestError(`No catalog entry for ${v.make} ${v.model} ${v.manufacturingYear}`);
  }

  let chosen = trims[0]!;
  if (v.variant) {
    const upper = v.variant.toUpperCase();
    const exact = trims.find((t) => upper.includes(t.trim.toUpperCase()));
    if (exact) chosen = exact;
  }

  const quote = await getOrComputeQuote({
    userId,
    make: v.make,
    model: v.model,
    year: v.manufacturingYear,
    trim: chosen.trim,
    kms: 0, // user can adjust on the page
    txnType,
    partyType,
    category: chosen.category,
  });

  return {
    quote,
    resolved: {
      make: v.make,
      model: v.model,
      year: v.manufacturingYear,
      trim: chosen.trim,
      category: chosen.category,
    },
  };
}

export interface SaveValuationInput {
  userId: string;
  vehicleId: string;
  cacheKey: string;
  sliderSnapshot: Record<string, string>;
  adjustedPrice: string;
  txnType: 'BUY' | 'SELL';
  partyType: 'INDIVIDUAL' | 'DEALER';
}

export async function saveValuationToVehicle(input: SaveValuationInput) {
  // Fail fast if adjustedPrice isn't a valid Decimal (Zod regex caught format,
  // this catches edge cases like "Infinity" or floats that overflow Decimal).
  let priceDec: Decimal;
  try {
    priceDec = new Decimal(input.adjustedPrice);
    if (!priceDec.isFinite() || priceDec.lt(0)) throw new Error('non-finite or negative');
  } catch {
    throw new BadRequestError(`Invalid adjustedPrice: ${input.adjustedPrice}`);
  }

  const v = await prisma.vehicle.findFirst({ where: { id: input.vehicleId, userId: input.userId } });
  if (!v) throw new BadRequestError('Vehicle not found');

  const valuation = await prisma.vehicleValuation.findUnique({ where: { cacheKey: input.cacheKey } });
  if (!valuation) throw new BadRequestError('Valuation cache entry not found — re-run quote');

  const log = await prisma.vehicleValuationLog.create({
    data: {
      userId: input.userId,
      vehicleId: input.vehicleId,
      valuationId: valuation.id,
      sliderSnapshot: input.sliderSnapshot,
      adjustedPrice: priceDec.toFixed(2),
      txnType: input.txnType,
      partyType: input.partyType,
      savedToVehicle: true,
    },
  });

  // Source label: prefer the actual scraped source list; fall back to
  // 'estimated' or 'manual' depending on slider adjustment.
  const isAdjusted = priceDec.minus(valuation.priceGood.toString()).abs().gt(1);
  const sources = Array.isArray(valuation.sources) ? (valuation.sources as string[]) : [];
  const primarySource = sources[0] ?? (valuation.isEstimated ? 'estimated' : 'unknown');
  const sourceLabel = isAdjusted ? `${primarySource}+slider-adjusted` : primarySource;

  await prisma.vehicle.update({
    where: { id: input.vehicleId },
    data: {
      currentValue: priceDec.toFixed(2),
      currentValueSource: sourceLabel,
    },
  });

  return { log };
}
