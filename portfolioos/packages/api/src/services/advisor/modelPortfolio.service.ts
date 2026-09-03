/**
 * Model portfolios — the target-allocation templates advice is measured
 * against.
 *
 * Weights are immutable once written. Editing them inserts version+1 rather
 * than updating the row, mirroring LearnedTemplate.version, because every
 * AdvisorRecommendation carries a modelPortfolioVersionId: rewriting a version
 * in place would silently change what a piece of past advice claims it was
 * aiming at.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';
import type { AdvisorTargetFact } from './types.js';
import { validateTargetWeights } from './modelPortfolioMath.js';
import { parseTargetWeights } from './riskProfile.service.js';

export interface ModelPortfolioVersionSummary {
  id: string;
  version: number;
  targets: AdvisorTargetFact[];
  note: string | null;
  createdAt: string;
}

export interface ModelPortfolioSummary {
  id: string;
  name: string;
  riskCategory: RiskCategoryValue;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: ModelPortfolioVersionSummary | null;
}

export interface ModelPortfolioDetail extends ModelPortfolioSummary {
  versions: ModelPortfolioVersionSummary[];
}

interface RawVersion {
  id: string;
  version: number;
  targetWeights: unknown;
  note: string | null;
  createdAt: Date;
}

function toVersionSummary(v: RawVersion): ModelPortfolioVersionSummary {
  return {
    id: v.id,
    version: v.version,
    targets: parseTargetWeights(v.targetWeights),
    note: v.note,
    createdAt: v.createdAt.toISOString(),
  };
}

/** All model portfolios for the user, newest version attached. */
export async function listModelPortfolios(userId: string): Promise<ModelPortfolioSummary[]> {
  const rows = await prisma.modelPortfolio.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    riskCategory: r.riskCategory as RiskCategoryValue,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    currentVersion: r.versions[0] ? toVersionSummary(r.versions[0]) : null,
  }));
}

/** One model portfolio with its full version history, newest first. */
export async function getModelPortfolio(
  userId: string,
  modelPortfolioId: string,
): Promise<ModelPortfolioDetail> {
  const row = await prisma.modelPortfolio.findFirst({
    where: { id: modelPortfolioId, userId },
    include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!row) throw new NotFoundError('Model portfolio not found');

  const versions = row.versions.map(toVersionSummary);
  return {
    id: row.id,
    name: row.name,
    riskCategory: row.riskCategory as RiskCategoryValue,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    currentVersion: versions[0] ?? null,
    versions,
  };
}

/** The newest version row, or null if the portfolio has never been seeded. */
export async function getCurrentVersion(
  userId: string,
  modelPortfolioId: string,
): Promise<ModelPortfolioVersionSummary | null> {
  const owned = await prisma.modelPortfolio.findFirst({
    where: { id: modelPortfolioId, userId },
    select: { id: true },
  });
  if (!owned) throw new NotFoundError('Model portfolio not found');
  const version = await prisma.modelPortfolioVersion.findFirst({
    where: { modelPortfolioId },
    orderBy: { version: 'desc' },
  });
  return version ? toVersionSummary(version) : null;
}

/**
 * Edit target weights by writing a new version. Never UPDATEs an existing
 * version row — see the file header for why.
 *
 * Validation runs before anything is written, so a weight set that does not
 * sum to 100 is rejected rather than persisted and then relied upon by a
 * rebalance instruction.
 */
export async function updateTargetWeights(
  userId: string,
  modelPortfolioId: string,
  weights: AdvisorTargetFact[],
  note?: string,
): Promise<ModelPortfolioVersionSummary> {
  const owned = await prisma.modelPortfolio.findFirst({
    where: { id: modelPortfolioId, userId },
    select: { id: true },
  });
  if (!owned) throw new NotFoundError('Model portfolio not found');

  const validation = validateTargetWeights(weights);
  if (!validation.ok) throw new BadRequestError(validation.reason);

  const latest = await prisma.modelPortfolioVersion.findFirst({
    where: { modelPortfolioId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const created = await prisma.modelPortfolioVersion.create({
    data: {
      modelPortfolioId,
      version: nextVersion,
      targetWeights: weights as unknown as Prisma.InputJsonValue,
      note: note ?? null,
    },
  });

  // Touch the parent so `updatedAt` reflects the edit — the version rows
  // themselves stay immutable.
  await prisma.modelPortfolio.update({
    where: { id: modelPortfolioId },
    data: { isActive: true },
  });

  return toVersionSummary(created);
}
