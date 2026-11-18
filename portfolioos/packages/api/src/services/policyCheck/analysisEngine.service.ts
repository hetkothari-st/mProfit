/**
 * Policy check analysis engine orchestrator.
 *
 * Mirrors mfAnalysisEngine.service.ts in structure:
 *
 *  1. Create run row (status ANALYZING).
 *  2. Build facts from stored extraction data.
 *  3. Evaluate rules (pure, in-memory, no DB transactions held).
 *  4. Compute score.
 *  5. Decide verdict.
 *  6. ONE runInTransaction commit at the end.
 *
 * Guarantees (same as mfAnalysis):
 *  G1. A broken rule is a broken rule, not a broken run.
 *  G2. "Why was X not flagged?" is answerable — ruleVersionsSnapshot.
 *  G3. Re-runs append, never edit — supersededById chain on verdicts.
 */

import { Prisma } from '@prisma/client';
import type { PolicyFindingDTO, PolicyFindingCategory, PolicyFieldConflict } from '@everypaisa/shared';
import { logger } from '../../lib/logger.js';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { loadLatestInsurerRows, matchInsurerRow } from './insurerMetrics.service.js';
import { MOTOR_POLICY_RULES, POLICY_RULES, SAVINGS_POLICY_RULES, TERM_POLICY_RULES } from './rules/registry.js';
import { computeMotorScore } from './scoring/motorScoreMath.js';
import { computePolicyScore } from './scoring/policyScoreMath.js';
import { computeSavingsScore } from './scoring/savingsScoreMath.js';
import { computeTermScore } from './scoring/termScoreMath.js';
import { asProductType, insurerKindOf } from './extractionSpecs.js';
import { decidePolicyVerdict } from './verdict.js';
import type { MotorAnalysisFacts, PolicyAnalysisFacts, PolicyRule, SavingsAnalysisFacts, TermAnalysisFacts, TermRule } from './types.js';
import { DEFAULT_MOTOR_RULE_CONSTANTS, DEFAULT_POLICY_RULE_CONSTANTS, DEFAULT_SAVINGS_RULE_CONSTANTS, DEFAULT_TERM_RULE_CONSTANTS } from './types.js';
import type { PolicyProductType } from '@everypaisa/shared';

// ---------------------------------------------------------------------------
// Rule evaluation (pure)
// ---------------------------------------------------------------------------

export interface PolicyRuleRunRecord {
  ruleId: string;
  version: string;
  ran: boolean;
  emitted: number;
  error?: string;
}

export interface PolicyRuleEvaluation {
  findings: PolicyFindingDTO[];
  ruleVersionsSnapshot: PolicyRuleRunRecord[];
  missingCategories: PolicyFindingCategory[];
  status: 'COMPLETED' | 'PARTIAL';
}

function sortFindings(findings: PolicyFindingDTO[]): PolicyFindingDTO[] {
  const severityRank: Record<string, number> = { CRITICAL: 0, WARNING: 1, NOTICE: 2, INFO: 3 };
  return [...findings].sort(
    (a, b) =>
      (severityRank[a.severity] ?? 4) - (severityRank[b.severity] ?? 4) ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

interface AnyRule<F> {
  id: string;
  version: string;
  category: PolicyFindingCategory;
  evaluate(facts: F): PolicyFindingDTO[];
}

/** Health entry point (kept for callers and tests). */
export function evaluatePolicyRules(
  facts: PolicyAnalysisFacts,
  rules: PolicyRule[] = POLICY_RULES,
): PolicyRuleEvaluation {
  return evaluateRules(facts, rules);
}

/**
 * Run a rule set against facts. Which rules apply is decided by the caller
 * (one list per product type) — never by a value the LLM extracted, which used
 * to skip every rule whenever the extracted "policy type" read FAMILY_FLOATER.
 */
export function evaluateRules<F>(facts: F, rules: Array<AnyRule<F>>): PolicyRuleEvaluation {
  const records = new Map<string, { ruleId: string; version: string; ran: boolean; emitted: number; category: PolicyFindingCategory; errors: string[] }>();

  for (const rule of rules) {
    records.set(rule.id, {
      ruleId: rule.id,
      version: rule.version,
      ran: false,
      emitted: 0,
      category: rule.category,
      errors: [],
    });
  }

  const findings: PolicyFindingDTO[] = [];

  for (const rule of rules) {
    const record = records.get(rule.id)!;

    record.ran = true;
    try {
      const emitted = rule.evaluate(facts);
      if (Array.isArray(emitted)) {
        findings.push(...emitted);
        record.emitted += emitted.length;
      }
    } catch (err) {
      record.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const ruleVersionsSnapshot: PolicyRuleRunRecord[] = [];
  const missing = new Set<PolicyFindingCategory>();

  for (const rule of rules) {
    const record = records.get(rule.id)!;
    const entry: PolicyRuleRunRecord = {
      ruleId: record.ruleId,
      version: record.version,
      ran: record.ran,
      emitted: record.emitted,
    };
    if (record.errors.length > 0) {
      entry.error = record.errors.join('; ');
      missing.add(record.category);
    }
    ruleVersionsSnapshot.push(entry);
  }

  return {
    findings: sortFindings(findings),
    ruleVersionsSnapshot,
    missingCategories: [...missing].sort(),
    status: missing.size > 0 ? 'PARTIAL' : 'COMPLETED',
  };
}

// ---------------------------------------------------------------------------
// Facts builder
// ---------------------------------------------------------------------------

type AnyFacts = PolicyAnalysisFacts | TermAnalysisFacts | SavingsAnalysisFacts | MotorAnalysisFacts;

function isMotor(f: AnyFacts): f is MotorAnalysisFacts {
  return 'productType' in f && f.productType === 'MOTOR';
}

function isTerm(f: AnyFacts): f is TermAnalysisFacts {
  return 'productType' in f && f.productType === 'TERM';
}

function isSavings(f: AnyFacts): f is SavingsAnalysisFacts {
  return 'productType' in f && f.productType === 'SAVINGS';
}

async function buildFacts(checkId: string, userId: string): Promise<AnyFacts> {
  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { id: true, policyId: true, asOf: true, policy: { select: { type: true } } },
  });
  if (!check) throw new Error(`PolicyHealthCheck ${checkId} not found for user ${userId}`);

  // Which rules and score apply is decided by the insurance record, never by
  // anything the LLM extracted from the documents.
  const productType: PolicyProductType | null = asProductType(check.policy.type);
  if (!productType) throw new Error(`Policy type ${check.policy.type} is not supported`);

  const data = await prisma.extractedPolicyData.findUnique({
    where: { checkId },
    select: { fields: true, conflicts: true },
  });
  if (!data) throw new Error(`No ExtractedPolicyData for check ${checkId}`);

  // Insurer metrics for the insurer named in the extraction (health or life table).
  const fields = data.fields as unknown as Record<string, { value: unknown; status: string } | undefined>;
  const nameField = fields['insurerName'];
  const insurerName =
    nameField && nameField.status !== 'NOT_FOUND' && typeof nameField.value === 'string' && nameField.value
      ? nameField.value
      : null;

  let insurer: PolicyAnalysisFacts['insurer'] = null;
  const insurerKind = insurerKindOf(productType);
  if (insurerName && insurerKind) {
    const row = matchInsurerRow(await loadLatestInsurerRows(insurerKind), insurerName);
    if (row) {
      insurer = {
        insurerName: row.insurerName,
        financialYear: row.financialYear,
        claimSettlementRatio: row.claimSettlementRatio,
        incurredClaimRatio: row.incurredClaimRatio,
        claimsTotal: row.claimsTotal,
        claimsSettled: row.claimsSettled,
        source: row.source,
        retrievedAt: row.retrievedAt.toISOString(),
      };
    }
  }

  const base = {
    asOf: check.asOf.toISOString(),
    userId,
    policyId: check.policyId,
    checkId,
    insurer,
    conflicts: (data.conflicts as unknown as PolicyFieldConflict[] | null) ?? [],
  };

  if (productType === 'MOTOR') {
    return {
      ...base,
      productType: 'MOTOR',
      constants: DEFAULT_MOTOR_RULE_CONSTANTS,
      extraction: data.fields as unknown as MotorAnalysisFacts['extraction'],
    };
  }
  if (productType === 'SAVINGS') {
    return {
      ...base,
      productType: 'SAVINGS',
      // From the insurance record, never from anything extracted.
      planKind: check.policy.type === 'ULIP' ? 'ULIP' : 'TRADITIONAL',
      constants: DEFAULT_SAVINGS_RULE_CONSTANTS,
      extraction: data.fields as unknown as SavingsAnalysisFacts['extraction'],
    };
  }
  if (productType === 'TERM') {
    return {
      ...base,
      productType: 'TERM',
      constants: DEFAULT_TERM_RULE_CONSTANTS,
      extraction: data.fields as unknown as TermAnalysisFacts['extraction'],
    };
  }
  return {
    ...base,
    constants: DEFAULT_POLICY_RULE_CONSTANTS,
    extraction: data.fields as unknown as import('./extractionSchema.js').PolicyExtraction,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface RunPolicyAnalysisResult extends PolicyRuleEvaluation {
  checkId: string;
  verdictId: string | null;
  score: string | null;
  ratingCategory: string | null;
}

/**
 * Run the policy analysis engine for one health check.
 *
 * Must be called inside the check owner's RLS context (runAsUser).
 */
export async function runPolicyAnalysis(
  checkId: string,
  userId: string,
  healthRulesOverride?: PolicyRule[],
): Promise<RunPolicyAnalysisResult> {
  // Mark as ANALYZING
  await runInTransaction((tx) =>
    tx.policyHealthCheck.update({
      where: { id: checkId },
      data: { status: 'ANALYZING' },
    }),
  );

  let facts: AnyFacts;
  try {
    facts = await buildFacts(checkId, userId);
  } catch (err) {
    await runInTransaction((tx) =>
      tx.policyHealthCheck.update({
        where: { id: checkId },
        data: { status: 'FAILED' },
      }),
    );
    throw err;
  }

  try {
    return await evaluateAndCommit(checkId, userId, facts, healthRulesOverride);
  } catch (err) {
    // Never leave the check spinning forever in ANALYZING.
    await runInTransaction((tx) =>
      tx.policyHealthCheck.update({ where: { id: checkId }, data: { status: 'FAILED' } }),
    ).catch((e) => logger.error({ err: e, checkId }, '[policyAnalysis] could not mark check FAILED'));
    throw err;
  }
}

async function evaluateAndCommit(
  checkId: string,
  userId: string,
  facts: AnyFacts,
  healthRulesOverride?: PolicyRule[],
): Promise<RunPolicyAnalysisResult> {
  const evaluation = isMotor(facts)
    ? evaluateRules<MotorAnalysisFacts>(facts, MOTOR_POLICY_RULES)
    : isSavings(facts)
      ? evaluateRules<SavingsAnalysisFacts>(facts, SAVINGS_POLICY_RULES)
      : isTerm(facts)
        ? evaluateRules<TermAnalysisFacts>(facts, TERM_POLICY_RULES)
        : evaluatePolicyRules(facts, healthRulesOverride ?? POLICY_RULES);
  const scoreResult = isMotor(facts)
    ? computeMotorScore(facts, evaluation.findings)
    : isSavings(facts)
      ? computeSavingsScore(facts, evaluation.findings)
      : isTerm(facts)
        ? computeTermScore(facts, evaluation.findings)
        : computePolicyScore(facts, evaluation.findings);
  const verdictDecision = decidePolicyVerdict(evaluation.findings, scoreResult.scoreSnapshot);

  let verdictId: string | null = null;

  await runInTransaction(async (tx) => {
    // Re-runs replace the check's findings (the verdict chain is the history).
    await tx.policyFinding.deleteMany({ where: { checkId } });
    if (evaluation.findings.length > 0) {
      await tx.policyFinding.createMany({
        data: evaluation.findings.map((f) => ({
          checkId,
          userId,
          ruleId: f.ruleId,
          ruleVersion: f.ruleVersion,
          code: f.code,
          category: f.category,
          severity: f.severity,
          confidence: f.confidence,
          headline: f.headline,
          evidence: f.evidence as unknown as Prisma.InputJsonValue,
          whatWouldChangeThis: f.whatWouldChangeThis,
        })),
        skipDuplicates: true,
      });
    }

    // Update the check with score + ruleVersionsSnapshot
    await tx.policyHealthCheck.update({
      where: { id: checkId },
      data: {
        status: evaluation.status === 'PARTIAL' ? 'PARTIAL' : 'COMPLETED',
        factsSnapshot: facts as unknown as Prisma.InputJsonValue,
        ruleVersionsSnapshot: evaluation.ruleVersionsSnapshot as unknown as Prisma.InputJsonValue,
        scoreSnapshot: scoreResult.scoreSnapshot as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    // Append-only verdict: same verdict + same reasons = no new row
    const existingVerdict = await tx.policyVerdict.findFirst({
      where: { checkId, supersededById: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, verdict: true, reasons: true },
    });

    const reasons = verdictDecision.reasons;
    const verdict = verdictDecision.verdict;
    const existingReasons = existingVerdict?.reasons as string[] | null;

    const isSame =
      existingVerdict !== null &&
      existingVerdict.verdict === verdict &&
      new Set(existingReasons ?? []).size === new Set(reasons).size &&
      (existingReasons ?? []).every((r) => reasons.includes(r));

    if (!isSame) {
      const created = await tx.policyVerdict.create({
        data: {
          checkId,
          userId,
          verdict,
          score: scoreResult.scoreSnapshot.overall
            ? parseFloat(scoreResult.scoreSnapshot.overall)
            : null,
          reasons: reasons as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      verdictId = created.id;

      if (existingVerdict !== null) {
        await tx.policyVerdict.update({
          where: { id: existingVerdict.id },
          data: { supersededById: created.id },
        });
      }
    } else {
      verdictId = existingVerdict!.id;
    }
  });

  if (evaluation.status === 'PARTIAL') {
    logger.warn(
      { checkId, userId, missingCategories: evaluation.missingCategories },
      '[policyAnalysis] run completed PARTIAL — at least one rule errored',
    );
  }

  return {
    checkId,
    verdictId,
    score: scoreResult.scoreSnapshot.overall,
    ratingCategory: scoreResult.scoreSnapshot.ratingCategory,
    findings: evaluation.findings,
    ruleVersionsSnapshot: evaluation.ruleVersionsSnapshot,
    missingCategories: evaluation.missingCategories,
    status: evaluation.status,
  };
}
