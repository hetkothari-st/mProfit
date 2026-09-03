/**
 * Risk profiling — the DB half. All scoring lives in riskProfileMath.ts; this
 * file only persists what that pure function decided, and resolves "what
 * equity weight should this user be at" for the surfaces that ask.
 *
 * The central rule here is append-only. A questionnaire submission INSERTS a
 * RiskProfileAssessment; it never updates the previous one. Reconstructing why
 * a recommendation was made two years from now needs the answers and the
 * scoring version that were actually in force, not a re-score of stale answers
 * under today's bands.
 */

import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError } from '../../lib/errors.js';
import {
  QUESTIONNAIRE_VERSION,
  RISK_CATEGORIES,
  ageBasedEquityGuidelinePct,
  scoreRiskQuestionnaire,
  type RiskAnswers,
  type RiskAssessmentOutcome,
  type RiskCategoryValue,
} from '../riskProfileMath.js';
import { MODEL_PORTFOLIO_NAMES } from './constants.js';
import { targetsForCategory } from './modelPortfolioMath.js';
import { ADVISOR_ASSET_BUCKETS, type AdvisorTargetFact } from './types.js';

// ─── Shapes ──────────────────────────────────────────────────────

export interface RiskProfileModelPortfolioSummary {
  id: string;
  name: string;
  riskCategory: RiskCategoryValue;
  versionId: string;
  version: number;
  targets: AdvisorTargetFact[];
}

export interface RiskProfileResult {
  assessmentId: string;
  questionnaireVersion: number;
  score: number;
  category: RiskCategoryValue;
  taxSlabPct: number | null;
  overrides: RiskAssessmentOutcome['overrides'];
  answers: RiskAnswers;
  modelPortfolio: RiskProfileModelPortfolioSummary | null;
  assessedAt: string;
}

export type TargetEquitySource = 'RISK_PROFILE' | 'AGE_HEURISTIC' | 'UNKNOWN';

// ─── Helpers ─────────────────────────────────────────────────────

/** Target weights as the JSON array persisted on ModelPortfolioVersion.
 *  Thin alias over modelPortfolioMath.targetsForCategory — the defaults are
 *  derived in exactly one place. */
export function defaultTargetsFor(category: RiskCategoryValue): AdvisorTargetFact[] {
  return targetsForCategory(category);
}

/** Reads a ModelPortfolioVersion.targetWeights blob back into typed facts.
 *  Tolerant of unknown/legacy buckets rather than throwing: a target that
 *  cannot be parsed must not take down advice generation. */
export function parseTargetWeights(raw: unknown): AdvisorTargetFact[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(ADVISOR_ASSET_BUCKETS);
  const out: AdvisorTargetFact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const bucket = String(rec.bucket ?? '');
    if (!known.has(bucket)) continue;
    const pct = Number(rec.targetPct);
    if (!Number.isFinite(pct)) continue;
    out.push({ bucket: bucket as AdvisorTargetFact['bucket'], targetPct: pct });
  }
  return out;
}

/**
 * Ensure the four default model portfolios (one per risk category) exist for
 * this user, each with a version 1 seeded from DEFAULT_TARGET_WEIGHTS.
 *
 * Idempotent, and safe to call on every submission: existing rows and existing
 * versions are left exactly as they are, so a user who has edited their
 * Balanced weights does not get them reset by re-taking the questionnaire.
 */
export async function ensureDefaultModelPortfolios(
  userId: string,
): Promise<Record<RiskCategoryValue, string>> {
  const ids = {} as Record<RiskCategoryValue, string>;

  for (const category of RISK_CATEGORIES) {
    const name = MODEL_PORTFOLIO_NAMES[category];
    const portfolio = await prisma.modelPortfolio.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name, riskCategory: category, isActive: true },
      update: {},
    });
    ids[category] = portfolio.id;

    const hasVersion = await prisma.modelPortfolioVersion.findFirst({
      where: { modelPortfolioId: portfolio.id },
      select: { id: true },
    });
    if (!hasVersion) {
      await prisma.modelPortfolioVersion.create({
        data: {
          modelPortfolioId: portfolio.id,
          version: 1,
          targetWeights: defaultTargetsFor(category) as unknown as Prisma.InputJsonValue,
          note: 'Seeded from the default target weights for this risk category.',
        },
      });
    }
  }

  return ids;
}

async function latestVersionFor(modelPortfolioId: string) {
  return prisma.modelPortfolioVersion.findFirst({
    where: { modelPortfolioId },
    orderBy: { version: 'desc' },
  });
}

async function summariseModelPortfolio(
  modelPortfolioId: string | null,
): Promise<RiskProfileModelPortfolioSummary | null> {
  if (!modelPortfolioId) return null;
  const portfolio = await prisma.modelPortfolio.findUnique({ where: { id: modelPortfolioId } });
  if (!portfolio) return null;
  const version = await latestVersionFor(portfolio.id);
  if (!version) return null;
  return {
    id: portfolio.id,
    name: portfolio.name,
    riskCategory: portfolio.riskCategory as RiskCategoryValue,
    versionId: version.id,
    version: version.version,
    targets: parseTargetWeights(version.targetWeights),
  };
}

function validateAnswers(answers: RiskAnswers): void {
  if (!answers || typeof answers !== 'object') throw new BadRequestError('Answers required');
  const required: Array<keyof RiskAnswers> = [
    'horizon',
    'drawdownReaction',
    'investableShareOfIncome',
    'objective',
    'taxSlab',
  ];
  for (const key of required) {
    if (answers[key] == null) {
      throw new BadRequestError(`Missing questionnaire answer: ${String(key)}`);
    }
  }
  if (typeof answers.hasEmergencyFund !== 'boolean') {
    throw new BadRequestError('hasEmergencyFund must be true or false');
  }
  if (answers.age != null) {
    if (!Number.isFinite(answers.age) || answers.age <= 0 || answers.age > 120) {
      throw new BadRequestError('Age must be between 1 and 120');
    }
  }
}

// ─── API ─────────────────────────────────────────────────────────

/**
 * Score a questionnaire submission and record it. Always inserts — the newest
 * row is "current" and the older rows are the audit trail.
 */
export async function submitQuestionnaire(
  userId: string,
  answers: RiskAnswers,
): Promise<RiskProfileResult> {
  validateAnswers(answers);

  const outcome = scoreRiskQuestionnaire(answers);
  const portfolioIds = await ensureDefaultModelPortfolios(userId);
  const modelPortfolioId = portfolioIds[outcome.category] ?? null;

  const assessment = await prisma.riskProfileAssessment.create({
    data: {
      userId,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      answers: answers as unknown as Prisma.InputJsonValue,
      score: outcome.score,
      category: outcome.category,
      overrides: outcome.overrides as unknown as Prisma.InputJsonValue,
      taxSlabPct: outcome.taxSlabPct != null ? new Decimal(outcome.taxSlabPct).toString() : null,
      modelPortfolioId,
    },
  });

  return {
    assessmentId: assessment.id,
    questionnaireVersion: assessment.questionnaireVersion,
    score: assessment.score,
    category: assessment.category as RiskCategoryValue,
    taxSlabPct: outcome.taxSlabPct,
    overrides: outcome.overrides,
    answers,
    modelPortfolio: await summariseModelPortfolio(modelPortfolioId),
    assessedAt: assessment.createdAt.toISOString(),
  };
}

/** The newest assessment, or null if the user has never taken it. */
export async function getCurrentRiskProfile(userId: string): Promise<RiskProfileResult | null> {
  const assessment = await prisma.riskProfileAssessment.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!assessment) return null;

  return {
    assessmentId: assessment.id,
    questionnaireVersion: assessment.questionnaireVersion,
    score: assessment.score,
    category: assessment.category as RiskCategoryValue,
    taxSlabPct: assessment.taxSlabPct != null ? new Decimal(assessment.taxSlabPct.toString()).toNumber() : null,
    overrides: (assessment.overrides ?? []) as RiskAssessmentOutcome['overrides'],
    answers: assessment.answers as unknown as RiskAnswers,
    modelPortfolio: await summariseModelPortfolio(assessment.modelPortfolioId),
    assessedAt: assessment.createdAt.toISOString(),
  };
}

export interface AssessmentHistoryRow {
  assessmentId: string;
  questionnaireVersion: number;
  score: number;
  category: RiskCategoryValue;
  taxSlabPct: number | null;
  overrides: RiskAssessmentOutcome['overrides'];
  modelPortfolioId: string | null;
  assessedAt: string;
}

/** Newest first. The whole point of never updating in place. */
export async function listAssessmentHistory(userId: string): Promise<AssessmentHistoryRow[]> {
  const rows = await prisma.riskProfileAssessment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    assessmentId: r.id,
    questionnaireVersion: r.questionnaireVersion,
    score: r.score,
    category: r.category as RiskCategoryValue,
    taxSlabPct: r.taxSlabPct != null ? new Decimal(r.taxSlabPct.toString()).toNumber() : null,
    overrides: (r.overrides ?? []) as RiskAssessmentOutcome['overrides'],
    modelPortfolioId: r.modelPortfolioId,
    assessedAt: r.createdAt.toISOString(),
  }));
}

/** Age in whole years from User.dob, or null when we have no date of birth. */
export async function userAgeFromDob(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dob: true } });
  if (!user?.dob) return null;
  const ageMs = Date.now() - user.dob.getTime();
  const years = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
  return years > 0 ? years : null;
}

/**
 * What equity weight should this user be at?
 *
 * A completed risk profile always wins — someone answered questions about
 * their own horizon and drawdown tolerance, and that beats arithmetic on their
 * birthday. `100 − age` is the fallback, and UNKNOWN is a real answer: better
 * to say we do not know than to advise against a number nobody chose.
 */
export async function resolveTargetEquityPct(
  userId: string,
): Promise<{ targetEquityPct: number | null; source: TargetEquitySource }> {
  const profile = await getCurrentRiskProfile(userId);

  if (profile) {
    const targets = profile.modelPortfolio?.targets ?? defaultTargetsFor(profile.category);
    const equity = targets
      .filter((t) => t.bucket === 'EQUITY_DOMESTIC' || t.bucket === 'EQUITY_INTERNATIONAL')
      .reduce((sum, t) => sum + t.targetPct, 0);
    if (targets.length > 0) {
      return { targetEquityPct: equity, source: 'RISK_PROFILE' };
    }
  }

  const age = await userAgeFromDob(userId);
  const guideline = ageBasedEquityGuidelinePct(age);
  if (guideline != null) return { targetEquityPct: guideline, source: 'AGE_HEURISTIC' };

  return { targetEquityPct: null, source: 'UNKNOWN' };
}
