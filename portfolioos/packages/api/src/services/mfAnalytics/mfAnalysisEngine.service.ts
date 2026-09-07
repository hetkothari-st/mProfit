/**
 * The MF findings orchestrator (`docs/mf-analytics/05-FINDINGS-ENGINE.md §7`).
 *
 * Builds facts once, asks every registered rule about them, turns the answers
 * into verdicts, and writes the lot down. It is the exact mirror of
 * `services/advisor/advisorEngine.service.ts`, and it exists to guarantee the
 * same three properties `CONTEXT.md §9.8` names — restated here because each
 * one is a decision that looks like over-engineering until the day it does not:
 *
 *  1. **A broken rule is a broken rule, not a broken run.** Every `evaluate`
 *     call is individually try/caught. The failure is recorded on
 *     `ruleVersionsSnapshot` and the other thirty-two rules still produce
 *     findings; the run comes back `PARTIAL`, carrying the finding categories
 *     that are missing so the UI can *name* the hole rather than rendering a
 *     shorter page that looks complete.
 *
 *  2. **"Why was X *not* flagged?" is answerable.** `ruleVersionsSnapshot`
 *     records EVERY rule that ran, including the ones that emitted nothing.
 *     Silence becomes evidence — "we asked, at this version, and the answer was
 *     no" — instead of the absence of evidence, which is indistinguishable
 *     from never having asked.
 *
 *  3. **A re-run never rewrites history.** Verdicts are append-only. Same
 *     verdict AND same reasons set: nothing is written, not even a touch.
 *     Anything else: a NEW row, with the old row's `supersededById` pointed at
 *     it. The figures a user was shown are the figures that stay on record —
 *     which is the record-keeping `06 §4` says SEBI expects of an adviser.
 *
 * ---------------------------------------------------------------------------
 * Replay
 * ---------------------------------------------------------------------------
 *
 * `evaluateRules` and `replayAnalysis` below are **pure**: facts in, findings
 * and verdicts out, no database, no clock. That is what makes `05 §8.8`
 * possible — load a stored `MfAnalysisRun.factsSnapshot`, hand it to a rule at
 * a newer version, and see what a threshold change would have done to real
 * historical runs, on a machine with no access to the reference tables. The
 * whole reason `factsSnapshot` is a closed JSON value (`types.ts`) is to make
 * that call legal.
 */

import { Prisma } from '@prisma/client';
import type {
  MfFinding,
  MfFindingCategory,
  MfFindingSeverity,
  MfRuleRunRecord,
} from '@portfolioos/shared';
import { logger } from '../../lib/logger.js';
import { runInTransaction } from '../../lib/prisma.js';
import { getEffectiveScope, type EffectiveScope } from '../familyScope.service.js';
import { buildMfAnalysisFacts, toSnapshotSafe } from './mfFacts.builder.js';
import { getRules, MF_RULES } from './rules/registry.js';
import { decideVerdicts, type MfVerdictDecision } from './mfVerdict.js';
import type { MfAnalysisFacts, MfRule } from './types.js';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** `MfAnalysisRun.triggeredBy` (`05 §1`). */
export type MfAnalysisTrigger = 'HOLDINGS_CHANGE' | 'SCORE_UPDATE' | 'USER_REFRESH' | 'SCHEDULE';

export interface RunMfAnalysisOptions {
  /** Default `USER_REFRESH`: an unattributed run is almost always a person
   *  pressing refresh, and mislabelling it as `SCHEDULE` would corrupt the
   *  rate-limit evidence the job reads back out of these rows. */
  triggeredBy?: MfAnalysisTrigger;
  /** Pinned by tests and by a replay. Production passes nothing. */
  asOf?: Date;
  /** Household view. Provenance on the run; never part of the RLS predicate
   *  (see the `MfAnalysisRun.familyId` schema comment). */
  familyId?: string;
  /** Overridable so a test can run one rule, or a deliberately broken one,
   *  without touching the registry every other suite iterates. */
  rules?: MfRule[];
}

/** The pure half of a run: what the rules said, and what was not asked. */
export interface MfRuleEvaluation {
  findings: MfFinding[];
  /** One entry per rule in the registry, emitters and silent rules alike. */
  ruleVersionsSnapshot: MfRuleRunRecord[];
  /** Categories a failed rule would have covered. Empty on a clean run. */
  missingCategories: MfFindingCategory[];
  status: 'COMPLETED' | 'PARTIAL';
}

export interface MfAnalysisRunResult extends MfRuleEvaluation {
  runId: string;
  asOf: string;
  triggeredBy: MfAnalysisTrigger;
  verdicts: MfVerdictDecision[];
  /** Verdict rows actually written. */
  verdictsCreated: number;
  /** Previous heads that gained a `supersededById`. */
  verdictsSuperseded: number;
  /** Funds whose standing verdict was left completely untouched. */
  verdictsUnchanged: number;
  startedAt: string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Deterministic ordering
// ---------------------------------------------------------------------------

/**
 * Severity, most serious first. Used only for ordering — never as a numeric
 * "score" — because the decision table branches on the severity *name* and a
 * rank that leaked into the logic would let a future INFO-vs-NOTICE tweak
 * silently change a verdict.
 */
const SEVERITY_RANK: Readonly<Record<MfFindingSeverity, number>> = Object.freeze({
  CRITICAL: 0,
  WARNING: 1,
  NOTICE: 2,
  INFO: 3,
});

/**
 * Two runs over identical facts must write rows in identical sequence.
 *
 * Without this, the finding order — and therefore the *order of the reasons
 * list* on a verdict — would depend on the registry array's order and on
 * `Object.keys` insertion order. Both are stable in practice and neither is
 * guaranteed by anything a test would catch, and the supersede comparison in
 * `05 §8.5` ("first row byte-identical") is a diff against exactly that.
 */
function sortFindings(findings: MfFinding[]): MfFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.schemeCode ?? '').localeCompare(b.schemeCode ?? '') ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.code.localeCompare(b.code),
  );
}

// ---------------------------------------------------------------------------
// Rule evaluation — pure, and the entry point for replay (`05 §8.8`)
// ---------------------------------------------------------------------------

interface RuleRecord {
  ruleId: string;
  version: string;
  ran: boolean;
  emitted: number;
  category: MfFindingCategory;
  errors: string[];
}

/**
 * A rule failure, formatted so the snapshot says *how bad* and *where*.
 *
 * A FUND rule is called once per fund, so it can fail for one scheme and
 * succeed for eleven. Recording only the first message would make a systematic
 * failure and a one-scheme data problem look identical in the snapshot, and
 * that difference is the whole diagnosis.
 */
function formatRuleError(errors: readonly string[]): string {
  if (errors.length === 1) return errors[0]!;
  return `${errors.length} failures; first: ${errors[0]!}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Run every rule against one fact set. **Pure**: no I/O, no clock, no `prisma`.
 *
 * FUND rules are evaluated once per fund in `facts.funds`; PORTFOLIO rules
 * once. A rule that throws is caught per call — per *fund*, for a FUND rule —
 * so one scheme with a malformed metrics row cannot suppress the same rule's
 * verdict on the other eleven.
 *
 * A rule the loop never reached — a FUND rule for a user who holds no funds —
 * is recorded with `ran: false`. That is also evidence, and a different piece
 * of evidence from "ran and said nothing": the first means there was nothing
 * to ask about, the second means we asked.
 *
 * `ran: false` never makes a run `PARTIAL`. Only an error does.
 */
export function evaluateRules(facts: MfAnalysisFacts, rules: MfRule[] = MF_RULES): MfRuleEvaluation {
  const records = new Map<string, RuleRecord>();
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

  const findings: MfFinding[] = [];

  const fundRules = rules.filter((r) => r.scope === 'FUND');
  // Sorted so the evaluation order does not depend on the facts object's key
  // insertion order, which depends on the order the builder's queries returned.
  const schemeCodes = Object.keys(facts.funds).sort();

  for (const schemeCode of schemeCodes) {
    for (const rule of fundRules) {
      const record = records.get(rule.id)!;
      record.ran = true;
      try {
        const emitted = rule.evaluate(facts, schemeCode);
        if (Array.isArray(emitted)) {
          findings.push(...emitted);
          record.emitted += emitted.length;
        }
      } catch (err) {
        // Recorded, not swallowed: this catch writes the failure onto the run's
        // ruleVersionsSnapshot, which is what `portfolioos/no-silent-catch`
        // asks for and what makes guarantee (1) observable rather than merely
        // claimed.
        record.errors.push(`[${schemeCode}] ${errorMessage(err)}`);
      }
    }
  }

  for (const rule of rules.filter((r) => r.scope === 'PORTFOLIO')) {
    const record = records.get(rule.id)!;
    record.ran = true;
    try {
      const emitted = rule.evaluate(facts);
      if (Array.isArray(emitted)) {
        findings.push(...emitted);
        record.emitted += emitted.length;
      }
    } catch (err) {
      record.errors.push(errorMessage(err));
    }
  }

  const ruleVersionsSnapshot: MfRuleRunRecord[] = [];
  const missing = new Set<MfFindingCategory>();

  // Registry order, not error order: the snapshot is read as a checklist of
  // "who was asked", and a list that reshuffles between runs cannot be diffed.
  for (const rule of rules) {
    const record = records.get(rule.id)!;
    const entry: MfRuleRunRecord = {
      ruleId: record.ruleId,
      version: record.version,
      ran: record.ran,
      emitted: record.emitted,
    };
    if (record.errors.length > 0) {
      entry.error = formatRuleError(record.errors);
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

/**
 * Replay a stored run's facts against a (possibly newer) rule set.
 *
 * This is `05 §8.8`'s test seam and the reason `factsSnapshot` exists. It
 * takes the facts as a **value** — typically `JSON.parse` of the stored column,
 * or the column handed straight over by Prisma — and needs nothing else: no
 * `MfSchemeMetrics`, no `MfPeerRank`, no `MfSchemeScore`, no network. Bump a
 * rule's thresholds, replay six months of stored runs, and count how many
 * findings appear or vanish before shipping the change.
 */
export function replayAnalysis(
  facts: MfAnalysisFacts,
  rules: MfRule[] = MF_RULES,
): MfRuleEvaluation & { verdicts: MfVerdictDecision[] } {
  const evaluation = evaluateRules(facts, rules);
  return { ...evaluation, verdicts: decideVerdicts(facts, evaluation.findings) };
}

// ---------------------------------------------------------------------------
// Supersede (`05 §5`, guarantee 3)
// ---------------------------------------------------------------------------

function parseReasons(raw: Prisma.JsonValue): string[] {
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
}

/**
 * Do two verdicts cite the same evidence?
 *
 * A **set** comparison, deliberately: `05 §5` says "same `reasons` set", and
 * the order a reason appears in is an artefact of which row of the decision
 * table matched and in what sequence the findings were sorted. Two runs that
 * reached the same conclusion for the same reasons in a different order have
 * not produced new advice, and superseding on that would churn the user's
 * history with rows that differ in nothing they can see.
 *
 * Duplicates are collapsed for the same reason — a reason listed twice is
 * still one reason — which also means the comparison cannot be fooled by a
 * length check alone.
 */
export function sameReasonSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const code of setA) if (!setB.has(code)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the MF findings engine for one user.
 *
 * **Must be called inside the caller's RLS context** — `runAsUser(userId, …)`
 * in the job, or an authenticated request. Not `runAsSystem`: the analysis
 * belongs to the user whose holdings produced it, every table it touches is
 * user-scoped, and the session variable is what makes ownership true at the
 * database rather than at the `where` clause (`CONTEXT.md §3.4`).
 *
 * Shape of the run, per `05 §7`:
 *
 *   create MfAnalysisRun(RUNNING) -> build facts -> evaluate rules -> decide
 *   verdicts -> ONE write transaction -> COMPLETED | PARTIAL
 *
 * The compute phase deliberately holds **no** database transaction. A run over
 * a large household is seconds of pure CPU over facts already in memory, and
 * wrapping it would serialise unrelated API traffic behind it for the whole
 * duration (`CLAUDE.md` BUG-011, and the reason `runInTransaction` exists at
 * all). The transaction is opened once, at the end, around the commit.
 */
export async function runMfAnalysis(
  userId: string,
  opts: RunMfAnalysisOptions = {},
): Promise<MfAnalysisRunResult> {
  const triggeredBy = opts.triggeredBy ?? 'USER_REFRESH';
  const asOf = opts.asOf ?? new Date();
  const rules = opts.rules ?? MF_RULES;
  const startedAt = new Date();

  const scope: EffectiveScope = await getEffectiveScope(
    userId,
    opts.familyId === undefined ? {} : { familyId: opts.familyId },
  );

  // The run row is created FIRST and empty, because `facts.portfolio.runId`
  // has to be the real id: `makeFinding` stamps every finding with it, so a
  // placeholder here would put a fake run id on real findings. `factsSnapshot`
  // and `portfolioAnalysis` are filled in by the commit below — they are
  // required columns with no meaningful "not yet" value, so `{}` stands in for
  // the window in which the run genuinely has no facts.
  const run = await runInTransaction((tx) =>
    tx.mfAnalysisRun.create({
      data: {
        userId,
        familyId: opts.familyId ?? null,
        asOf,
        status: 'RUNNING',
        factsSnapshot: {},
        portfolioAnalysis: {},
        ruleVersionsSnapshot: [],
        triggeredBy,
        startedAt,
      },
      select: { id: true },
    }),
  );

  let facts: MfAnalysisFacts;
  try {
    facts = await buildMfAnalysisFacts(scope, asOf, { runId: run.id });
  } catch (err) {
    // A rule that throws is a data point (guarantee 1). A facts build that
    // throws is not: there is nothing for any rule to be asked about, so the
    // run really has failed and says so rather than reporting PARTIAL with
    // thirty-three silent rules, which would read as "nothing is wrong".
    await runInTransaction((tx) =>
      tx.mfAnalysisRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', completedAt: new Date() },
      }),
    );
    throw err;
  }

  const evaluation = evaluateRules(facts, rules);
  const verdicts = decideVerdicts(facts, evaluation.findings);
  const completedAt = new Date();

  let verdictsCreated = 0;
  let verdictsSuperseded = 0;
  let verdictsUnchanged = 0;
  let persistedFindings: MfFinding[] = evaluation.findings;

  await runInTransaction(async (tx) => {
    await tx.mfAnalysisRun.update({
      where: { id: run.id },
      data: {
        status: evaluation.status,
        // `toSnapshotSafe` re-asserts the JSON closure at the boundary rather
        // than trusting the builder to have kept it. A Decimal or a Date that
        // sneaks in here serialises to something the replay cannot turn back,
        // and the failure would surface months later in a code path nobody
        // watches.
        factsSnapshot: toSnapshotSafe(facts, '$') as unknown as Prisma.InputJsonValue,
        portfolioAnalysis: toSnapshotSafe(
          facts.portfolio,
          '$.portfolio',
        ) as unknown as Prisma.InputJsonValue,
        ruleVersionsSnapshot: evaluation.ruleVersionsSnapshot as unknown as Prisma.InputJsonValue,
        completedAt,
      },
    });

    if (evaluation.findings.length > 0) {
      const rows = await tx.mfFinding.createManyAndReturn({
        data: evaluation.findings.map((f) => ({
          runId: run.id,
          userId,
          schemeCode: f.schemeCode,
          ruleId: f.ruleId,
          ruleVersion: f.ruleVersion,
          code: f.code,
          category: f.category,
          severity: f.severity,
          confidence: f.confidence,
          headline: f.headline,
          evidence: f.evidence as unknown as Prisma.InputJsonValue,
          whatWouldChangeThis: f.whatWouldChangeThis,
          createdAt: completedAt,
        })),
        select: { id: true },
      });
      // The database assigns the real ids; `makeFinding`'s deterministic id is
      // a dedupe key, not a primary key. Swap them in so the returned value
      // matches what a later read of the run will see.
      persistedFindings = evaluation.findings.map((f, i) => ({ ...f, id: rows[i]?.id ?? f.id }));
    }

    for (const decision of verdicts) {
      // The current head of this scheme's verdict chain: the one row a user
      // could be looking at right now. A superseded row is history and is
      // never reconsidered.
      const existing = await tx.mfFundVerdict.findFirst({
        where: { userId, schemeCode: decision.schemeCode, supersededById: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, verdict: true, reasons: true },
      });

      if (
        existing !== null &&
        existing.verdict === decision.verdict &&
        sameReasonSet(parseReasons(existing.reasons), decision.reasons)
      ) {
        // Guarantee 3, the strict reading of `05 §5`: "same verdict and same
        // reasons set => no new row (touch nothing)". Not an update of the
        // run id, not a refreshed timestamp — nothing. The row keeps pointing
        // at the run that produced the figures the user was actually shown.
        //
        // Consequence, accepted: a re-run that changes only the *suggested
        // replacement* or the switch cost, with the verdict and reasons
        // identical, does not supersede. `05 §5` names verdict and reasons and
        // nothing else, and today no verdict can carry a replacement at all
        // (see `mfVerdict.ts` on row 3), so the case is unreachable rather
        // than merely rare.
        verdictsUnchanged += 1;
        continue;
      }

      const created = await tx.mfFundVerdict.create({
        data: {
          runId: run.id,
          userId,
          schemeCode: decision.schemeCode,
          verdict: decision.verdict,
          reasons: decision.reasons as unknown as Prisma.InputJsonValue,
          suggestedReplacementSchemeCode: decision.suggestedReplacementSchemeCode,
          switchCost:
            decision.switchCost === null
              ? Prisma.JsonNull
              : (decision.switchCost as unknown as Prisma.InputJsonValue),
          createdAt: completedAt,
        },
        select: { id: true },
      });
      verdictsCreated += 1;

      if (existing !== null) {
        // The forward pointer goes on the OLD row and nothing else about it
        // changes. `supersededById` is `@unique`, so the chain stays linear and
        // "what was live on date D" has exactly one answer.
        await tx.mfFundVerdict.update({
          where: { id: existing.id },
          data: { supersededById: created.id },
        });
        verdictsSuperseded += 1;
      }
    }
  });

  if (evaluation.status === 'PARTIAL') {
    logger.warn(
      {
        runId: run.id,
        userId,
        missingCategories: evaluation.missingCategories,
        failedRules: evaluation.ruleVersionsSnapshot.filter((r) => r.error !== undefined),
      },
      '[mfAnalysis] run completed PARTIAL — at least one rule errored',
    );
  }

  return {
    runId: run.id,
    asOf: asOf.toISOString(),
    triggeredBy,
    findings: persistedFindings,
    ruleVersionsSnapshot: evaluation.ruleVersionsSnapshot,
    missingCategories: evaluation.missingCategories,
    status: evaluation.status,
    verdicts,
    verdictsCreated,
    verdictsSuperseded,
    verdictsUnchanged,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  };
}

/**
 * Rules for one scope, re-exported so a caller (a controller explaining "we
 * ran these 24 checks on this fund") does not have to import the registry and
 * filter it in a second, drifting way.
 */
export { getRules };
