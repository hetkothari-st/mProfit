/**
 * HTTP surface for the advisor engine (/api/advisor).
 *
 * Thin by design: every handler validates, delegates to a service, and hands
 * the result to `ok()`. The one exception is `getAllocation`, which composes
 * the current-vs-target view the allocation page needs out of the persisted
 * model portfolio, the user's holdings and the pure drift math — see the note
 * on that handler.
 *
 * Note what this file never does: it does not decide anything. Priorities,
 * trade sizes, thresholds and rationales all come from the engine; the LLM
 * prose is optional and non-authoritative. A handler that started computing a
 * figure here would be a second, untested source of advice.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
// Named import, matching analytics.insights.ts: under NodeNext the default
// export of decimal.js resolves to a namespace and is not constructable.
import { Decimal } from 'decimal.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

import {
  submitQuestionnaire,
  getCurrentRiskProfile,
  listAssessmentHistory,
} from '../services/advisor/riskProfile.service.js';
import {
  listModelPortfolios as listModelPortfoliosService,
  updateTargetWeights,
} from '../services/advisor/modelPortfolio.service.js';
import {
  listApprovedProducts as listApprovedProductsService,
  addApprovedProduct,
  removeApprovedProduct,
  reorderApprovedProducts,
} from '../services/advisor/approvedProducts.service.js';
import { runAdvisorEngine } from '../services/advisor/advisorEngine.service.js';
import {
  listRecommendations as listRecommendationsService,
  getRecommendation as getRecommendationService,
  updateRecommendationStatus,
  listRuns,
} from '../services/advisor/advisorRecommendations.service.js';
import {
  generateProseForRecommendation,
  isAdvisorProseEnabled,
} from '../services/advisor/advisorProse.service.js';

import { ADVISOR_ASSET_BUCKETS, type AdvisorAllocationFact, type AdvisorTargetFact } from '../services/advisor/types.js';
import { bucketForHolding } from '../services/advisor/assetBuckets.js';
import { computeDrift } from '../services/advisor/allocationMath.js';

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

// ─── Schemas ─────────────────────────────────────────────────────

const riskAnswersSchema = z.object({
  age: z.number().int().min(0).max(120).nullable(),
  horizon: z.enum(['LT_3Y', 'Y3_7', 'Y7_15', 'GT_15Y']),
  drawdownReaction: z.enum(['SELL_ALL', 'SELL_SOME', 'HOLD', 'BUY_MORE']),
  investableShareOfIncome: z.enum(['LT_10', 'PCT_10_20', 'PCT_20_35', 'GT_35']),
  objective: z.enum(['PRESERVE', 'INCOME', 'BALANCED_GROWTH', 'MAX_GROWTH']),
  hasEmergencyFund: z.boolean(),
  taxSlab: z.enum(['PCT_5', 'PCT_20', 'PCT_30', 'UNSURE']),
});

const RECOMMENDATION_CATEGORIES = [
  'REBALANCE',
  'CONCENTRATION_TRIM',
  'TAX_HARVEST',
  'GOAL_SHORTFALL_SIP',
  'CASH_DEPLOYMENT',
  'RISK_PROFILE_REVIEW',
] as const;

const RECOMMENDATION_STATUSES = ['OPEN', 'ACCEPTED', 'DISMISSED', 'SNOOZED', 'DONE'] as const;

/**
 * Query-string boolean. NOT z.coerce.boolean(): that is `Boolean(value)`, so
 * the string "false" coerces to true and a caller who spells the parameter out
 * explicitly gets the opposite of what they asked for.
 */
const queryBoolean = (dflt: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? dflt : v === 'true' || v === '1'));

const listRecommendationsSchema = z.object({
  status: z.enum(RECOMMENDATION_STATUSES).optional(),
  category: z.enum(RECOMMENDATION_CATEGORIES).optional(),
  generationRunId: z.string().cuid().optional(),
  // Default false: a superseded recommendation is history, not advice, and
  // showing it alongside the live list is how a user ends up acting twice on
  // the same drift.
  includeSuperseded: queryBoolean(false),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const statusSchema = z.object({
  status: z.enum(RECOMMENDATION_STATUSES),
  note: z.string().max(1000).optional(),
  // Only meaningful with status SNOOZED; the service decides what to do with
  // it rather than this layer inferring intent.
  snoozedUntil: z.string().datetime().optional(),
});

const regenerateSchema = z
  .object({
    // A user pressing "refresh advice" is a USER-triggered run; the scheduler
    // passes SYSTEM. Defaulted here so the common case needs no body at all.
    triggeredBy: z.enum(['USER', 'SYSTEM']).default('USER'),
  })
  .default({ triggeredBy: 'USER' });

const proseSchema = z
  .object({ force: z.coerce.boolean().default(false) })
  .default({ force: false });

const bucketSchema = z.enum(ADVISOR_ASSET_BUCKETS);

const listApprovedProductsSchema = z.object({
  modelPortfolioId: z.string().cuid().optional(),
  bucket: bucketSchema.optional(),
  includeInactive: queryBoolean(false),
});

const addApprovedProductSchema = z
  .object({
    modelPortfolioId: z.string().cuid(),
    bucket: bucketSchema,
    fundId: z.string().cuid().nullable().optional(),
    stockId: z.string().cuid().nullable().optional(),
    label: z.string().min(1).max(200),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Boolean(v.fundId) !== Boolean(v.stockId), {
    // Exactly one instrument reference. Both, or neither, makes the product
    // unresolvable at recommendation time — catch it here rather than at the
    // point where a rule tries to name it.
    message: 'Provide exactly one of fundId or stockId',
    path: ['fundId'],
  });

const targetWeightsSchema = z.object({
  weights: z
    .array(
      z.object({
        bucket: bucketSchema,
        targetPct: z.number().min(0).max(100),
      }),
    )
    .min(1),
  note: z.string().max(1000).optional(),
});

// ─── Risk profile ────────────────────────────────────────────────

export async function getRiskProfile(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const [profile, history] = await Promise.all([
    getCurrentRiskProfile(uid),
    listAssessmentHistory(uid),
  ]);
  ok(res, { profile, history });
}

export async function postRiskProfile(req: Request, res: Response): Promise<void> {
  const answers = riskAnswersSchema.parse(req.body);
  const data = await submitQuestionnaire(userId(req), answers);
  ok(res, data);
}

// ─── Allocation (current + target + drift) ───────────────────────

const storedTargetsSchema = z.array(
  z.object({ bucket: bucketSchema, targetPct: z.coerce.number() }),
);

/**
 * The allocation page's single read.
 *
 * Composed here rather than delegated because it is a pure view: the active
 * model portfolio's newest version supplies the targets, HoldingProjection
 * supplies the current values, and `computeDrift` — the same pure function the
 * rebalance rule uses — reconciles them. Sharing that function is the point:
 * the number the page shows as "18pp overweight" is produced by the identical
 * code path that later sizes the trade, so the two can never disagree.
 *
 * Mutual funds are re-bucketed by their MutualFundMaster category before the
 * comparison, because AssetClass alone would file a liquid fund as equity and
 * invert the drift on any portfolio holding one.
 */
export async function getAllocation(req: Request, res: Response): Promise<void> {
  const uid = userId(req);

  const model = await prisma.modelPortfolio.findFirst({
    where: { userId: uid, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });

  const latestVersion = model?.versions[0] ?? null;
  const parsedTargets = latestVersion
    ? storedTargetsSchema.safeParse(latestVersion.targetWeights)
    : null;
  const targets: AdvisorTargetFact[] =
    parsedTargets && parsedTargets.success ? parsedTargets.data : [];

  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId: uid } },
    select: {
      assetClass: true,
      fundId: true,
      currentValue: true,
      totalCost: true,
    },
  });

  const fundIds = [...new Set(holdings.map((h) => h.fundId).filter((id): id is string => !!id))];
  const fundCategories = new Map<string, string>();
  if (fundIds.length > 0) {
    const funds = await prisma.mutualFundMaster.findMany({
      where: { id: { in: fundIds } },
      select: { id: true, category: true },
    });
    for (const f of funds) fundCategories.set(f.id, f.category);
  }

  const valueByBucket = new Map<string, Decimal>();
  let totalValue = new Decimal(0);
  for (const h of holdings) {
    // Fall back to cost when no market value has been computed yet — a
    // freshly imported holding still occupies space in the allocation.
    const value = new Decimal((h.currentValue ?? h.totalCost).toString());
    if (value.isZero()) continue;
    const bucket = bucketForHolding({
      assetClass: h.assetClass,
      mfCategory: h.fundId ? fundCategories.get(h.fundId) ?? null : null,
    });
    valueByBucket.set(bucket, (valueByBucket.get(bucket) ?? new Decimal(0)).plus(value));
    totalValue = totalValue.plus(value);
  }

  const current: AdvisorAllocationFact[] = [...valueByBucket.entries()].map(([bucket, value]) => ({
    bucket: bucket as AdvisorAllocationFact['bucket'],
    currentValue: value,
    currentPct: totalValue.isZero() ? 0 : value.dividedBy(totalValue).times(100).toNumber(),
  }));

  const drift = computeDrift(current, targets, totalValue);

  ok(res, {
    asOf: new Date().toISOString(),
    totalValueInr: totalValue.toFixed(2),
    modelPortfolio: model
      ? {
          id: model.id,
          name: model.name,
          riskCategory: model.riskCategory,
          versionId: latestVersion?.id ?? null,
          version: latestVersion?.version ?? null,
        }
      : null,
    // Explicitly flagged rather than left for the client to infer from an
    // empty array: "no model portfolio yet" and "targets all zero" are very
    // different states and only one of them is worth prompting the user about.
    hasTargets: targets.length > 0,
    current: current.map((c) => ({
      bucket: c.bucket,
      currentPct: c.currentPct,
      currentValueInr: c.currentValue.toFixed(2),
    })),
    target: targets,
    drift: drift.map((d) => ({
      bucket: d.bucket,
      currentPct: d.currentPct,
      targetPct: d.targetPct,
      driftPp: d.driftPp,
      driftValueInr: d.driftValue.toFixed(2),
    })),
  });
}

// ─── Recommendations ─────────────────────────────────────────────

export async function listRecommendations(req: Request, res: Response): Promise<void> {
  const filters = listRecommendationsSchema.parse(req.query);
  const data = await listRecommendationsService(userId(req), filters);
  ok(res, data);
}

export async function getRecommendation(req: Request, res: Response): Promise<void> {
  const data = await getRecommendationService(userId(req), req.params['id']!);
  ok(res, data);
}

export async function postRegenerate(req: Request, res: Response): Promise<void> {
  const opts = regenerateSchema.parse(req.body ?? {});
  const data = await runAdvisorEngine(userId(req), opts);
  ok(res, data);
}

export async function patchRecommendationStatus(req: Request, res: Response): Promise<void> {
  const { status, ...rest } = statusSchema.parse(req.body);
  const data = await updateRecommendationStatus(userId(req), req.params['id']!, status, rest);
  ok(res, data);
}

// ─── LLM prose ───────────────────────────────────────────────────

/**
 * GET returns whatever is already stored (never spends); POST may generate.
 * Split deliberately so a page load can render existing narration without a
 * button press ever being implied by a fetch.
 */
export async function getProse(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const rec = await getRecommendationService(uid, req.params['id']!);
  const prose = (rec as { llmProse?: string | null } | null)?.llmProse ?? null;
  ok(res, { prose, enabled: isAdvisorProseEnabled() });
}

export async function postProse(req: Request, res: Response): Promise<void> {
  const opts = proseSchema.parse(req.body ?? {});
  const result = await generateProseForRecommendation(userId(req), req.params['id']!, opts);
  // Every non-ok outcome is a 200 with a status, not an error: the
  // recommendation itself is fine and fully readable from its rationale — the
  // narration is the only thing that failed, and the UI says so inline.
  ok(res, result);
}

export async function getLlmStatus(_req: Request, res: Response): Promise<void> {
  ok(res, { enabled: isAdvisorProseEnabled() });
}

// ─── Approved products ───────────────────────────────────────────

export async function listApprovedProducts(req: Request, res: Response): Promise<void> {
  const filters = listApprovedProductsSchema.parse(req.query);
  const data = await listApprovedProductsService(userId(req), filters);
  ok(res, data);
}

export async function postApprovedProduct(req: Request, res: Response): Promise<void> {
  const input = addApprovedProductSchema.parse(req.body);
  const data = await addApprovedProduct(userId(req), input);
  ok(res, data);
}

const reorderApprovedProductsSchema = z.object({
  modelPortfolioId: z.string().cuid(),
  bucket: bucketSchema,
  /** Every ACTIVE product id in the bucket, in the order wanted. */
  orderedIds: z.array(z.string().cuid()).min(1),
});

/**
 * Rank is presentation order — which approved product the engine reaches for
 * first within a bucket. Reordering is its own endpoint because re-POSTing a
 * product to change its rank hits the duplicate check and fails; the service
 * renumbers the whole bucket in one pass so no intermediate state violates the
 * (modelPortfolioId, bucket, rank) unique constraint.
 */
export async function putApprovedProductOrder(req: Request, res: Response): Promise<void> {
  const { modelPortfolioId, bucket, orderedIds } = reorderApprovedProductsSchema.parse(req.body);
  const data = await reorderApprovedProducts(userId(req), modelPortfolioId, bucket, orderedIds);
  ok(res, data);
}

export async function deleteApprovedProduct(req: Request, res: Response): Promise<void> {
  const data = await removeApprovedProduct(userId(req), req.params['id']!);
  ok(res, data);
}

// ─── Model portfolios ────────────────────────────────────────────

export async function listModelPortfolios(req: Request, res: Response): Promise<void> {
  const data = await listModelPortfoliosService(userId(req));
  ok(res, data);
}

export async function putModelPortfolioTargets(req: Request, res: Response): Promise<void> {
  const { weights, note } = targetWeightsSchema.parse(req.body);
  const data = await updateTargetWeights(userId(req), req.params['id']!, weights, note);
  ok(res, data);
}

// ─── Runs ────────────────────────────────────────────────────────

export async function getRuns(req: Request, res: Response): Promise<void> {
  const data = await listRuns(userId(req));
  ok(res, data);
}
