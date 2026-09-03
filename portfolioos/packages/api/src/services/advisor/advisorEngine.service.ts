/**
 * The orchestrator. Builds facts once, runs every registered rule against
 * them, and reconciles the resulting drafts against what the user is already
 * standing in front of.
 *
 * Three properties this file exists to guarantee:
 *
 *  1. A broken rule is a broken rule, not a broken run. Every `evaluate` call
 *     is individually try/caught: the failure is recorded on the run and the
 *     other thirty-nine rules still produce advice.
 *
 *  2. "Why was X *not* flagged?" is answerable. `ruleVersionsSnapshot` records
 *     every rule that ran, including the ones that emitted nothing, so silence
 *     is evidence rather than absence of evidence.
 *
 *  3. A re-run never rewrites history. An unchanged recommendation gets its
 *     inputs refreshed; a materially changed one gets a NEW row and the old
 *     row's `supersededById` pointed at it. The old row's numbers are never
 *     edited — the figures a user was shown are the figures that stay on
 *     record.
 */

import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ADVISOR_ENGINE_VERSION, MATERIALITY_TOLERANCE } from './constants.js';
import { buildAdvisorFacts } from './advisorFacts.builder.js';
import { ADVISOR_RULES } from './rules/index.js';
import type {
  AdvisorFacts,
  ProvenanceValue,
  RecommendationDraft,
  TradeAction,
} from './types.js';

export interface AdvisorRunResult {
  runId: string;
  status: 'COMPLETED' | 'FAILED';
  /** Live recommendations this run stands behind: newly created plus existing
   *  ones it re-affirmed. Not the row count of this run alone, which would
   *  read as "no advice" on a quiet second run. */
  recommendationCount: number;
  created: number;
  refreshed: number;
  superseded: number;
  /** Emitted by a rule but deliberately not surfaced, because the identical
   *  advice already sits in a closed (accepted/dismissed/done) state. */
  suppressed: number;
  ruleErrors: Record<string, string>;
  ruleVersions: Record<string, number>;
  startedAt: string;
  completedAt: string | null;
}

const PROVENANCE_TO_DB: Record<ProvenanceValue, 'APPROVED_LIST' | 'FALLBACK_RANKING' | 'NONE'> = {
  APPROVED_LIST: 'APPROVED_LIST',
  FALLBACK_RANKING: 'FALLBACK_RANKING',
  NONE: 'NONE',
};

/** Statuses a re-run may reconcile against. Everything else the user has
 *  already made a decision about and is never touched again. */
const LIVE_STATUSES = ['OPEN', 'SNOOZED'] as const;

// ─── Materiality ─────────────────────────────────────────────────

/** The identity of an instruction, ignoring its size. A different instrument,
 *  direction or leg count is a different piece of advice however similar the
 *  rupee figure. */
function actionShape(actions: TradeAction[]): string {
  return actions
    .map((a) =>
      [a.direction, a.bucket, a.fundId ?? '', a.stockId ?? '', a.holdingKey ?? '', a.instrumentName]
        .join('~'),
    )
    .join('|');
}

function totalAmount(actions: TradeAction[]): Decimal {
  return actions.reduce((sum, a) => {
    const v = new Decimal(a.amountInr || '0');
    return sum.plus(v.abs());
  }, new Decimal(0));
}

function parseActions(raw: unknown): TradeAction[] {
  return Array.isArray(raw) ? (raw as TradeAction[]) : [];
}

/**
 * Has this advice moved enough to be worth replacing?
 *
 * Without a band, a rounding-level price tick would supersede every standing
 * recommendation nightly and the user's list would churn without ever changing
 * in substance.
 */
export function isMateriallyChanged(
  prev: { action: unknown; ruleVersion: number },
  next: RecommendationDraft,
): boolean {
  // Different logic produced it — the numbers may coincide, the reasoning did
  // not. Always material.
  if (prev.ruleVersion !== next.ruleVersion) return true;

  const prevActions = parseActions(prev.action);
  if (actionShape(prevActions) !== actionShape(next.action)) return true;

  const before = totalAmount(prevActions);
  const after = totalAmount(next.action);

  // Non-trade advisories (RISK_PROFILE_REVIEW and friends) carry no amount.
  // Same shape, no money: nothing has changed.
  if (before.isZero() && after.isZero()) return false;
  if (before.isZero()) return true;

  return after.minus(before).abs().dividedBy(before).greaterThan(MATERIALITY_TOLERANCE);
}

// ─── Engine ──────────────────────────────────────────────────────

function draftToCreateData(
  userId: string,
  runId: string,
  facts: AdvisorFacts,
  draft: RecommendationDraft,
): Prisma.AdvisorRecommendationUncheckedCreateInput {
  const { kind, ...provenanceRef } = draft.provenance;
  return {
    userId,
    generationRunId: runId,
    ruleId: draft.ruleId,
    ruleVersion: draft.ruleVersion,
    category: draft.category,
    priority: draft.priority,
    action: draft.action as unknown as Prisma.InputJsonValue,
    rationale: draft.rationale,
    inputsSnapshot: draft.inputsUsed as unknown as Prisma.InputJsonValue,
    riskProfileAssessmentId: facts.riskProfile.assessmentId,
    modelPortfolioVersionId: facts.modelPortfolio.versionId,
    provenance: PROVENANCE_TO_DB[draft.provenance.kind],
    provenanceRef:
      Object.keys(provenanceRef).length > 0
        ? (provenanceRef as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    dedupeKey: draft.dedupeKey,
    status: 'OPEN',
  };
}

/**
 * Run every rule for one user and reconcile the output.
 *
 * Never call this from a request path under `runAsSystem` — advice belongs to
 * the user whose data produced it, and the RLS session variable is what makes
 * that true.
 */
export async function runAdvisorEngine(
  userId: string,
  opts: { triggeredBy?: 'USER' | 'SYSTEM'; asOf?: Date } = {},
): Promise<AdvisorRunResult> {
  const triggeredBy = opts.triggeredBy ?? 'USER';
  const facts = await buildAdvisorFacts(userId, opts.asOf);

  // Recorded before a single rule runs, so a rule that throws — or one that
  // simply has nothing to say — is still on the record as having been asked.
  const ruleVersions: Record<string, number> = {};
  for (const rule of ADVISOR_RULES) ruleVersions[rule.id] = rule.version;

  const run = await prisma.advisorRun.create({
    data: {
      userId,
      triggeredBy,
      status: 'RUNNING',
      engineVersion: ADVISOR_ENGINE_VERSION,
      ruleVersionsSnapshot: ruleVersions as unknown as Prisma.InputJsonValue,
      riskProfileAssessmentId: facts.riskProfile.assessmentId,
    },
  });

  const ruleErrors: Record<string, string> = {};
  const drafts: RecommendationDraft[] = [];

  for (const rule of ADVISOR_RULES) {
    try {
      const emitted = rule.evaluate(facts);
      if (Array.isArray(emitted)) drafts.push(...emitted);
    } catch (err) {
      // A rule failure is a data point, not an outage. Record and carry on.
      ruleErrors[rule.id] = err instanceof Error ? err.message : String(err);
    }
  }

  // Deterministic order: urgency first, then rule and dedupe key so two runs
  // over identical facts write rows in identical sequence.
  drafts.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.dedupeKey.localeCompare(b.dedupeKey),
  );

  let created = 0;
  let refreshed = 0;
  let superseded = 0;
  let suppressed = 0;

  try {
    for (const draft of drafts) {
      // The newest row for this exact issue, whatever its status. Status is
      // what decides how we treat it, not what decides whether we look.
      const existing = await prisma.advisorRecommendation.findFirst({
        where: { userId, ruleId: draft.ruleId, dedupeKey: draft.dedupeKey },
        orderBy: { createdAt: 'desc' },
      });

      if (!existing) {
        await prisma.advisorRecommendation.create({
          data: draftToCreateData(userId, run.id, facts, draft),
        });
        created += 1;
        continue;
      }

      const changed = isMateriallyChanged(existing, draft);
      const isLive = (LIVE_STATUSES as readonly string[]).includes(existing.status);

      if (!isLive) {
        // ACCEPTED / DISMISSED / DONE. The user has already ruled on this
        // exact advice: the row is never modified, and identical advice is not
        // re-issued under a new id, which would resurrect it by the back door.
        // Materially different advice is genuinely new information and does
        // get surfaced — without touching the closed row.
        if (!changed) {
          suppressed += 1;
          continue;
        }
        await prisma.advisorRecommendation.create({
          data: draftToCreateData(userId, run.id, facts, draft),
        });
        created += 1;
        continue;
      }

      if (!changed) {
        // Same advice, same money. Refresh only the frozen inputs so the
        // "as of" facts stay current; the figures the user is looking at are
        // left exactly as they were shown.
        await prisma.advisorRecommendation.update({
          where: { id: existing.id },
          data: { inputsSnapshot: draft.inputsUsed as unknown as Prisma.InputJsonValue },
        });
        refreshed += 1;
        continue;
      }

      // Materially moved. New row carries the new numbers; the old row keeps
      // its own and gains a forward pointer.
      const replacement = await prisma.advisorRecommendation.create({
        data: draftToCreateData(userId, run.id, facts, draft),
      });
      await prisma.advisorRecommendation.update({
        where: { id: existing.id },
        data: { supersededById: replacement.id },
      });
      created += 1;
      superseded += 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.advisorRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: message,
        ruleErrors: (Object.keys(ruleErrors).length
          ? ruleErrors
          : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        recommendationCount: created + refreshed,
      },
    });
    throw err;
  }

  const recommendationCount = created + refreshed;
  const completed = await prisma.advisorRun.update({
    where: { id: run.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      recommendationCount,
      ruleErrors: (Object.keys(ruleErrors).length
        ? ruleErrors
        : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    runId: run.id,
    status: 'COMPLETED',
    recommendationCount,
    created,
    refreshed,
    superseded,
    suppressed,
    ruleErrors,
    ruleVersions,
    startedAt: completed.startedAt.toISOString(),
    completedAt: completed.completedAt ? completed.completedAt.toISOString() : null,
  };
}
