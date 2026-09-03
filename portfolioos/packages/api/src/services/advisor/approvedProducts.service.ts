/**
 * The adviser-curated buy-side universe: which specific funds/stocks the
 * engine is allowed to name when it says "buy DEBT".
 *
 * Two invariants shape this file.
 *
 * 1. Removal is SOFT. A recommendation minted last year points at an
 *    AdvisorApprovedProduct id; hard-deleting the row would make that advice
 *    unreadable. So removal sets isActive=false / removedAt and the row stays.
 *
 * 2. `(modelPortfolioId, bucket, rank)` is UNIQUE in the database, and that
 *    constraint does not know about isActive — a retired row would otherwise
 *    keep squatting on rank 2 forever. Retired rows are therefore parked in
 *    the negative rank space (…, −2, −1) on removal, leaving 1..n as a clean,
 *    gap-free ordering owned entirely by the active list. Rank is presentation
 *    order, never identity: nothing historical resolves through it.
 */

import type { AdvisorAssetBucket } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { AdvisorAssetBucketValue, AdvisorProductFact } from './types.js';

export interface ApprovedProductRow {
  id: string;
  modelPortfolioId: string;
  bucket: AdvisorAssetBucketValue;
  rank: number;
  fundId: string | null;
  stockId: string | null;
  label: string;
  notes: string | null;
  isActive: boolean;
  addedAt: string;
  removedAt: string | null;
}

export interface AddApprovedProductInput {
  modelPortfolioId: string;
  bucket: AdvisorAssetBucketValue;
  label: string;
  fundId?: string | null;
  stockId?: string | null;
  notes?: string | null;
}

export interface ListApprovedProductsFilter {
  modelPortfolioId?: string;
  bucket?: AdvisorAssetBucketValue;
  /** Include soft-removed rows. Off by default — the live list is the answer
   *  to almost every question except "what did this old advice point at". */
  includeInactive?: boolean;
}

interface RawProduct {
  id: string;
  modelPortfolioId: string;
  bucket: string;
  rank: number;
  fundId: string | null;
  stockId: string | null;
  label: string;
  notes: string | null;
  isActive: boolean;
  addedAt: Date;
  removedAt: Date | null;
}

function toRow(p: RawProduct): ApprovedProductRow {
  return {
    id: p.id,
    modelPortfolioId: p.modelPortfolioId,
    bucket: p.bucket as AdvisorAssetBucketValue,
    rank: p.rank,
    fundId: p.fundId,
    stockId: p.stockId,
    label: p.label,
    notes: p.notes,
    isActive: p.isActive,
    addedAt: p.addedAt.toISOString(),
    removedAt: p.removedAt ? p.removedAt.toISOString() : null,
  };
}

async function assertOwnsModelPortfolio(userId: string, modelPortfolioId: string): Promise<void> {
  const owned = await prisma.modelPortfolio.findFirst({
    where: { id: modelPortfolioId, userId },
    select: { id: true },
  });
  if (!owned) throw new NotFoundError('Model portfolio not found');
}

/** Every row in one (modelPortfolioId, bucket) slot, active and retired. */
async function groupRows(modelPortfolioId: string, bucket: AdvisorAssetBucketValue) {
  return prisma.advisorApprovedProduct.findMany({
    where: { modelPortfolioId, bucket: bucket as AdvisorAssetBucket },
    orderBy: { rank: 'asc' },
  });
}

// ─── Reads ───────────────────────────────────────────────────────

export async function listApprovedProducts(
  userId: string,
  filter: ListApprovedProductsFilter = {},
): Promise<ApprovedProductRow[]> {
  if (filter.modelPortfolioId) await assertOwnsModelPortfolio(userId, filter.modelPortfolioId);

  const rows = await prisma.advisorApprovedProduct.findMany({
    where: {
      userId,
      ...(filter.modelPortfolioId ? { modelPortfolioId: filter.modelPortfolioId } : {}),
      ...(filter.bucket ? { bucket: filter.bucket as AdvisorAssetBucket } : {}),
      ...(filter.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ bucket: 'asc' }, { rank: 'asc' }],
  });
  return rows.map(toRow);
}

/**
 * The active list, bucketed and rank-ordered, in the shape the facts builder
 * hands to rules. A bucket with nothing approved is simply absent from the
 * returned map — the caller fills it with `[]`.
 */
export async function approvedProductFactsByBucket(
  userId: string,
  modelPortfolioId: string,
): Promise<Partial<Record<AdvisorAssetBucketValue, AdvisorProductFact[]>>> {
  const rows = await prisma.advisorApprovedProduct.findMany({
    where: { userId, modelPortfolioId, isActive: true },
    orderBy: [{ bucket: 'asc' }, { rank: 'asc' }],
  });

  const out: Partial<Record<AdvisorAssetBucketValue, AdvisorProductFact[]>> = {};
  for (const r of rows) {
    const bucket = r.bucket as AdvisorAssetBucketValue;
    (out[bucket] ??= []).push({
      approvedProductId: r.id,
      fundId: r.fundId,
      stockId: r.stockId,
      label: r.label,
      score: null,
    });
  }
  return out;
}

// ─── Writes ──────────────────────────────────────────────────────

/** Appends to the end of the bucket's active list. */
export async function addApprovedProduct(
  userId: string,
  input: AddApprovedProductInput,
): Promise<ApprovedProductRow> {
  await assertOwnsModelPortfolio(userId, input.modelPortfolioId);

  const label = input.label?.trim();
  if (!label) throw new BadRequestError('Label required');
  if (input.fundId && input.stockId) {
    throw new BadRequestError('An approved product is either a fund or a stock, not both');
  }

  if (input.fundId) {
    const fund = await prisma.mutualFundMaster.findUnique({
      where: { id: input.fundId },
      select: { id: true },
    });
    if (!fund) throw new NotFoundError('Fund not found');
  }
  if (input.stockId) {
    const stock = await prisma.stockMaster.findUnique({
      where: { id: input.stockId },
      select: { id: true },
    });
    if (!stock) throw new NotFoundError('Stock not found');
  }

  const rows = await groupRows(input.modelPortfolioId, input.bucket);

  // Refuse an exact duplicate of something already live: two identical rows
  // would make the engine name the same fund twice in one instruction.
  const duplicate = rows.find(
    (r) =>
      r.isActive &&
      ((input.fundId != null && r.fundId === input.fundId) ||
        (input.stockId != null && r.stockId === input.stockId) ||
        (input.fundId == null && input.stockId == null && r.label === label)),
  );
  if (duplicate) throw new BadRequestError('That product is already approved for this bucket');

  const maxPositiveRank = rows.reduce((max, r) => (r.rank > max ? r.rank : max), 0);

  const created = await prisma.advisorApprovedProduct.create({
    data: {
      userId,
      modelPortfolioId: input.modelPortfolioId,
      bucket: input.bucket as AdvisorAssetBucket,
      rank: maxPositiveRank + 1,
      fundId: input.fundId ?? null,
      stockId: input.stockId ?? null,
      label,
      notes: input.notes ?? null,
      isActive: true,
    },
  });
  return toRow(created);
}

/**
 * Soft removal. The row survives so historical recommendations still resolve;
 * its rank moves into the negative space so the live list can stay 1..n.
 */
export async function removeApprovedProduct(
  userId: string,
  approvedProductId: string,
): Promise<ApprovedProductRow> {
  const existing = await prisma.advisorApprovedProduct.findFirst({
    where: { id: approvedProductId, userId },
  });
  if (!existing) throw new NotFoundError('Approved product not found');
  if (!existing.isActive) return toRow(existing);

  const rows = await groupRows(existing.modelPortfolioId, existing.bucket as AdvisorAssetBucketValue);
  const minRank = rows.reduce((min, r) => (r.rank < min ? r.rank : min), 0);

  const removed = await prisma.advisorApprovedProduct.update({
    where: { id: existing.id },
    data: { isActive: false, removedAt: new Date(), rank: minRank - 1 },
  });

  // Close the gap the removal left. Ascending order means every target slot
  // has already been vacated by the time it is written into.
  const remaining = rows
    .filter((r) => r.isActive && r.id !== existing.id)
    .sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < remaining.length; i += 1) {
    const target = i + 1;
    if (remaining[i]!.rank !== target) {
      await prisma.advisorApprovedProduct.update({
        where: { id: remaining[i]!.id },
        data: { rank: target },
      });
    }
  }

  return toRow(removed);
}

/**
 * Re-rank the active products in one bucket. `orderedIds` must be exactly the
 * bucket's live set — a partial list would leave the rest at ambiguous ranks,
 * so it is rejected rather than guessed at.
 *
 * Written in two passes (park above the high-water mark, then write 1..n) so
 * no intermediate state ever violates the unique constraint.
 */
export async function reorderApprovedProducts(
  userId: string,
  modelPortfolioId: string,
  bucket: AdvisorAssetBucketValue,
  orderedIds: string[],
): Promise<ApprovedProductRow[]> {
  await assertOwnsModelPortfolio(userId, modelPortfolioId);

  const rows = await groupRows(modelPortfolioId, bucket);
  const active = rows.filter((r) => r.isActive);

  const activeIds = new Set(active.map((r) => r.id));
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!activeIds.has(id)) throw new BadRequestError(`Unknown product in this bucket: ${id}`);
    if (seen.has(id)) throw new BadRequestError(`Duplicate product in the ordering: ${id}`);
    seen.add(id);
  }
  if (seen.size !== activeIds.size) {
    throw new BadRequestError('Reorder must list every active product in the bucket exactly once');
  }

  const highWater = rows.reduce((max, r) => (r.rank > max ? r.rank : max), 0);

  // Pass 1 — park everything above every rank currently in use.
  for (let i = 0; i < orderedIds.length; i += 1) {
    await prisma.advisorApprovedProduct.update({
      where: { id: orderedIds[i]! },
      data: { rank: highWater + 1 + i },
    });
  }
  // Pass 2 — settle into 1..n, now provably empty of active rows. Retired
  // rows live at rank <= 0 and cannot collide.
  for (let i = 0; i < orderedIds.length; i += 1) {
    await prisma.advisorApprovedProduct.update({
      where: { id: orderedIds[i]! },
      data: { rank: i + 1 },
    });
  }

  const updated = await prisma.advisorApprovedProduct.findMany({
    where: { modelPortfolioId, bucket: bucket as AdvisorAssetBucket, isActive: true },
    orderBy: { rank: 'asc' },
  });
  return updated.map(toRow);
}
