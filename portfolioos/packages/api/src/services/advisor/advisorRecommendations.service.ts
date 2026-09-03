/**
 * Reading advice back out, and recording what the user did about it.
 *
 * Status is the only field a user can change. Everything else — the figures,
 * the rationale, the frozen inputs — is written once by the engine and then
 * left alone, because a recommendation is a record of what was advised, not a
 * mutable to-do item.
 */

import type { Prisma } from '@prisma/client';
import { serializeMoney } from '@portfolioos/shared';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type {
  AdvisorRecommendationCategoryValue,
  DraftProvenance,
  ProvenanceValue,
  TradeAction,
} from './types.js';

export const ADVISOR_RECOMMENDATION_STATUSES = [
  'OPEN',
  'ACCEPTED',
  'DISMISSED',
  'SNOOZED',
  'DONE',
] as const;
export type AdvisorRecommendationStatusValue = (typeof ADVISOR_RECOMMENDATION_STATUSES)[number];

/** Default snooze when a caller asks for SNOOZED without saying until when. */
const DEFAULT_SNOOZE_DAYS = 7;

export interface RecommendationView {
  id: string;
  generationRunId: string;
  ruleId: string;
  ruleVersion: number;
  category: AdvisorRecommendationCategoryValue;
  priority: number;
  action: TradeAction[];
  rationale: string;
  llmProse: string | null;
  llmModel: string | null;
  llmCostInr: string | null;
  inputsSnapshot: Record<string, unknown>;
  riskProfileAssessmentId: string | null;
  modelPortfolioVersionId: string | null;
  provenance: ProvenanceValue;
  provenanceRef: Omit<DraftProvenance, 'kind'> | null;
  dedupeKey: string;
  supersededById: string | null;
  status: AdvisorRecommendationStatusValue;
  statusNote: string | null;
  snoozedUntil: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListRecommendationsFilter {
  status?: AdvisorRecommendationStatusValue | AdvisorRecommendationStatusValue[];
  category?: AdvisorRecommendationCategoryValue | AdvisorRecommendationCategoryValue[];
  ruleId?: string;
  generationRunId?: string;
  /** Superseded rows are history, not advice — excluded unless asked for. */
  includeSuperseded?: boolean;
  /** SNOOZED rows whose snooze has not expired are hidden by default. */
  includeActiveSnoozes?: boolean;
  limit?: number;
}

interface RawRecommendation {
  id: string;
  generationRunId: string;
  ruleId: string;
  ruleVersion: number;
  category: string;
  priority: number;
  action: unknown;
  rationale: string;
  llmProse: string | null;
  llmModel: string | null;
  llmCostInr: { toString(): string } | null;
  inputsSnapshot: unknown;
  riskProfileAssessmentId: string | null;
  modelPortfolioVersionId: string | null;
  provenance: string;
  provenanceRef: unknown;
  dedupeKey: string;
  supersededById: string | null;
  status: string;
  statusNote: string | null;
  snoozedUntil: Date | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(r: RawRecommendation): RecommendationView {
  return {
    id: r.id,
    generationRunId: r.generationRunId,
    ruleId: r.ruleId,
    ruleVersion: r.ruleVersion,
    category: r.category as AdvisorRecommendationCategoryValue,
    priority: r.priority,
    action: Array.isArray(r.action) ? (r.action as TradeAction[]) : [],
    rationale: r.rationale,
    llmProse: r.llmProse,
    llmModel: r.llmModel,
    llmCostInr: r.llmCostInr != null ? serializeMoney(r.llmCostInr.toString()) : null,
    inputsSnapshot: (r.inputsSnapshot ?? {}) as Record<string, unknown>,
    riskProfileAssessmentId: r.riskProfileAssessmentId,
    modelPortfolioVersionId: r.modelPortfolioVersionId,
    provenance: r.provenance as ProvenanceValue,
    provenanceRef: (r.provenanceRef ?? null) as Omit<DraftProvenance, 'kind'> | null,
    dedupeKey: r.dedupeKey,
    supersededById: r.supersededById,
    status: r.status as AdvisorRecommendationStatusValue,
    statusNote: r.statusNote,
    snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
    statusChangedAt: r.statusChangedAt ? r.statusChangedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function asArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export async function listRecommendations(
  userId: string,
  filters: ListRecommendationsFilter = {},
): Promise<RecommendationView[]> {
  const statuses = asArray(filters.status);
  const categories = asArray(filters.category);

  const where: Prisma.AdvisorRecommendationWhereInput = {
    userId,
    ...(statuses ? { status: { in: statuses as Prisma.EnumAdvisorRecommendationStatusFilter['in'] } } : {}),
    ...(categories
      ? { category: { in: categories as Prisma.EnumAdvisorRecommendationCategoryFilter['in'] } }
      : {}),
    ...(filters.ruleId ? { ruleId: filters.ruleId } : {}),
    ...(filters.generationRunId ? { generationRunId: filters.generationRunId } : {}),
    ...(filters.includeSuperseded ? {} : { supersededById: null }),
  };

  // A live snooze means "not now" — honour it unless the caller explicitly
  // wants to see what is parked.
  if (!filters.includeActiveSnoozes && !statuses) {
    where.OR = [
      { status: { not: 'SNOOZED' } },
      { snoozedUntil: null },
      { snoozedUntil: { lte: new Date() } },
    ];
  }

  const rows = await prisma.advisorRecommendation.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    ...(filters.limit ? { take: filters.limit } : {}),
  });
  return rows.map(toView);
}

export async function getRecommendation(userId: string, id: string): Promise<RecommendationView> {
  const row = await prisma.advisorRecommendation.findFirst({ where: { id, userId } });
  if (!row) throw new NotFoundError('Recommendation not found');
  return toView(row);
}

export interface UpdateStatusOptions {
  note?: string | null;
  /** Required in spirit for SNOOZED; defaults to a week out if omitted. */
  snoozedUntil?: Date | string | null;
}

/**
 * Record what the user decided. Only status, its note and the snooze deadline
 * move — the advice itself is immutable.
 */
export async function updateRecommendationStatus(
  userId: string,
  id: string,
  status: AdvisorRecommendationStatusValue,
  opts: UpdateStatusOptions = {},
): Promise<RecommendationView> {
  if (!(ADVISOR_RECOMMENDATION_STATUSES as readonly string[]).includes(status)) {
    throw new BadRequestError(`Unknown recommendation status: ${status}`);
  }

  const existing = await prisma.advisorRecommendation.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Recommendation not found');
  if (existing.supersededById) {
    throw new BadRequestError(
      'This recommendation has been superseded by a newer one — act on that instead',
    );
  }

  let snoozedUntil: Date | null = null;
  if (status === 'SNOOZED') {
    if (opts.snoozedUntil != null) {
      const parsed = opts.snoozedUntil instanceof Date ? opts.snoozedUntil : new Date(opts.snoozedUntil);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestError('Invalid snoozedUntil date');
      if (parsed.getTime() <= Date.now()) throw new BadRequestError('snoozedUntil must be in the future');
      snoozedUntil = parsed;
    } else {
      snoozedUntil = new Date(Date.now() + DEFAULT_SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    }
  }

  const updated = await prisma.advisorRecommendation.update({
    where: { id },
    data: {
      status,
      statusNote: opts.note ?? null,
      statusChangedAt: new Date(),
      // Leaving SNOOZED clears the deadline so a later re-snooze cannot
      // inherit a stale one.
      snoozedUntil,
    },
  });
  return toView(updated);
}

export interface AdvisorRunView {
  id: string;
  triggeredBy: 'USER' | 'SYSTEM';
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  engineVersion: string;
  ruleVersionsSnapshot: Record<string, number>;
  ruleErrors: Record<string, string> | null;
  riskProfileAssessmentId: string | null;
  recommendationCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

/** Newest first. This is the audit trail: which rules ran, at what version,
 *  and which of them fell over. */
export async function listRuns(userId: string, limit = 25): Promise<AdvisorRunView[]> {
  const runs = await prisma.advisorRun.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
  return runs.map((r) => ({
    id: r.id,
    triggeredBy: r.triggeredBy as 'USER' | 'SYSTEM',
    status: r.status as 'RUNNING' | 'COMPLETED' | 'FAILED',
    engineVersion: r.engineVersion,
    ruleVersionsSnapshot: (r.ruleVersionsSnapshot ?? {}) as Record<string, number>,
    ruleErrors: (r.ruleErrors ?? null) as Record<string, string> | null,
    riskProfileAssessmentId: r.riskProfileAssessmentId,
    recommendationCount: r.recommendationCount,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    errorMessage: r.errorMessage,
  }));
}
