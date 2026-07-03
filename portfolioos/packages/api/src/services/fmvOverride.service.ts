import { Decimal, toDecimal } from '@portfolioos/shared';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  computeUserCapitalGains,
  persistCapitalGainsForPortfolio,
  GRANDFATHERING_CUTOFF,
} from './capitalGains.service.js';

// Section 112A grandfathering only applies to these asset classes — debt
// MFs/bonds have their own indexation path (capitalGains.service.ts).
const GRANDFATHERING_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set([
  'EQUITY',
  'ETF',
  'MUTUAL_FUND',
]);

// fmvPerUnit validation: positive Decimal, max 8 digits before the point,
// max 4 after (matches FmvOverride.fmvPerUnit's Decimal(18,4) column, with
// a tighter integer-digit cap since no real scrip trades in the trillions).
const FMV_PATTERN = /^\d{1,8}(\.\d{1,4})?$/;

export interface FmvRecord {
  isin: string;
  scripName: string | null;
  fmvPerUnit: Decimal;
  source: 'SEED' | 'USER';
}

export interface GrandfatheringRow {
  isin: string | null;
  assetName: string;
  buyDate: Date;
  sellDate: Date;
  quantity: Decimal;
  buyAmount: Decimal; // actual cost basis
  sellAmount: Decimal; // sale proceeds
  gainLoss: Decimal; // uncorrected (uses actual cost)
  fmvPerUnit: Decimal | null; // null if no seed or user entry
  fmvSource: 'SEED' | 'USER' | null;
  fmvTotalBasis: Decimal | null; // fmvPerUnit × quantity
  adjustedCostBasis: Decimal | null; // max(buyAmount, min(fmvTotalBasis, sellAmount))
  correctedGain: Decimal | null; // sellAmount - adjustedCostBasis
  correctedTaxableGain: Decimal | null; // same (no indexation for equity)
  gainDifference: Decimal | null; // correctedGain - gainLoss (tax saving)
  needsUserInput: boolean; // true if fmvPerUnit is null
  financialYear: string;
}

// In-process cache: FMV lookups run inside the FIFO loop (thousands of
// iterations per report), so a per-request DB round trip per ISIN is too
// slow. 5-minute TTL keeps the /fmv-overrides admin endpoints responsive to
// their own writes without needing a pub/sub invalidation channel.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: Map<string, FmvRecord>; expiresAt: number }>();

function invalidateCache(userId: string): void {
  cache.delete(userId);
}

/**
 * Fire-and-forget FIFO recompute across all of the user's portfolios after an
 * FMV override change, so CapitalGain rows (and the tax summary) reflect the
 * corrected taxableGain within seconds instead of waiting for the next
 * on-demand recompute. Not awaited by callers; failures are logged, never
 * silently dropped (§3.10).
 */
function triggerFifoRecompute(userId: string): void {
  void (async () => {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      select: { id: true },
    });
    await Promise.all(portfolios.map((p) => persistCapitalGainsForPortfolio(p.id)));
  })().catch((err) => {
    logger.error({ err, userId }, 'background FIFO recompute after FMV override change failed');
  });
}

export async function getFmvForUser(userId: string): Promise<Map<string, FmvRecord>> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [overrides, seeds] = await Promise.all([
    prisma.fmvOverride.findMany({ where: { userId } }),
    prisma.systemFmvSeed.findMany(),
  ]);

  const merged = new Map<string, FmvRecord>();
  for (const seed of seeds) {
    merged.set(seed.isin, {
      isin: seed.isin,
      scripName: seed.scripName,
      fmvPerUnit: toDecimal(seed.fmvPerUnit),
      source: 'SEED',
    });
  }
  // User overrides take priority over SystemFmvSeed for the same ISIN.
  for (const override of overrides) {
    merged.set(override.isin, {
      isin: override.isin,
      scripName: override.scripName,
      fmvPerUnit: toDecimal(override.fmvPerUnit),
      source: 'USER',
    });
  }

  cache.set(userId, { data: merged, expiresAt: Date.now() + CACHE_TTL_MS });
  return merged;
}

export async function getFmvForIsin(userId: string, isin: string): Promise<FmvRecord | null> {
  const all = await getFmvForUser(userId);
  return all.get(isin) ?? null;
}

/** Raw FmvOverride rows for this user only (excludes SystemFmvSeed) — "what the user has manually entered". */
export async function listUserFmvOverrides(userId: string): Promise<FmvRecord[]> {
  const overrides = await prisma.fmvOverride.findMany({
    where: { userId },
    orderBy: { isin: 'asc' },
  });
  return overrides.map((o) => ({
    isin: o.isin,
    scripName: o.scripName,
    fmvPerUnit: toDecimal(o.fmvPerUnit),
    source: 'USER' as const,
  }));
}

export async function upsertUserFmv(
  userId: string,
  isin: string,
  fmvPerUnit: string,
  scripName?: string,
): Promise<FmvRecord> {
  if (!FMV_PATTERN.test(fmvPerUnit)) {
    throw new BadRequestError(
      'fmvPerUnit must be a positive decimal with at most 8 digits before and 4 after the decimal point',
      { fmvPerUnit },
    );
  }
  const value = toDecimal(fmvPerUnit);
  if (!value.isPositive()) {
    throw new BadRequestError('fmvPerUnit must be positive', { fmvPerUnit });
  }

  const saved = await prisma.fmvOverride.upsert({
    where: { userId_isin: { userId, isin } },
    create: { userId, isin, fmvPerUnit, scripName: scripName ?? null, source: 'USER' },
    update: { fmvPerUnit, scripName: scripName ?? null, source: 'USER' },
  });

  invalidateCache(userId);
  triggerFifoRecompute(userId);

  return {
    isin: saved.isin,
    scripName: saved.scripName,
    fmvPerUnit: toDecimal(saved.fmvPerUnit),
    source: 'USER',
  };
}

export async function deleteUserFmv(userId: string, isin: string): Promise<void> {
  await prisma.fmvOverride.deleteMany({ where: { userId, isin } });
  invalidateCache(userId);
  triggerFifoRecompute(userId);
}

export async function listGrandfatheringRows(
  userId: string,
  fy?: string,
): Promise<GrandfatheringRow[]> {
  const [{ rows }, fmvByIsin] = await Promise.all([
    computeUserCapitalGains(userId),
    getFmvForUser(userId),
  ]);

  return rows
    .filter(
      (r) =>
        r.capitalGainType === 'LONG_TERM' &&
        r.buyDate <= GRANDFATHERING_CUTOFF &&
        GRANDFATHERING_ASSET_CLASSES.has(r.assetClass) &&
        (fy === undefined || r.financialYear === fy),
    )
    .map((r): GrandfatheringRow => {
      const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
      const fmvTotalBasis = fmv ? fmv.fmvPerUnit.times(r.quantity) : null;
      // Sec 55(2)(ac): cost of acquisition = higher of (actual cost, lower of
      // (FMV basis, sale proceeds)). The proceeds cap is mandatory — dropping
      // it would let a high FMV manufacture a loss the section doesn't allow.
      const adjustedCostBasis = fmvTotalBasis
        ? Decimal.max(r.buyAmount, Decimal.min(fmvTotalBasis, r.sellAmount))
        : null;
      const correctedGain = adjustedCostBasis ? r.sellAmount.minus(adjustedCostBasis) : null;

      return {
        isin: r.isin,
        assetName: r.assetName,
        buyDate: r.buyDate,
        sellDate: r.sellDate,
        quantity: r.quantity,
        buyAmount: r.buyAmount,
        sellAmount: r.sellAmount,
        gainLoss: r.gainLoss,
        fmvPerUnit: fmv?.fmvPerUnit ?? null,
        fmvSource: fmv?.source ?? null,
        fmvTotalBasis,
        adjustedCostBasis,
        correctedGain,
        correctedTaxableGain: correctedGain, // no indexation for equity/ETF/MF
        gainDifference: correctedGain ? correctedGain.minus(r.gainLoss) : null,
        needsUserInput: fmv === null,
        financialYear: r.financialYear,
      };
    });
}
