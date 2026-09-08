/**
 * The MF verdict prose job (`docs/mf-analytics/05-FINDINGS-ENGINE.md §6`, §7).
 *
 * ---------------------------------------------------------------------------
 * Why this is a separate queue
 * ---------------------------------------------------------------------------
 *
 * `05 §7`, last line of the orchestrator: "enqueue prose job (**separate
 * queue; failures never affect the run status**)". That sentence is the whole
 * architecture of this file.
 *
 * The analysis run is the regulated artefact — findings, verdicts,
 * `factsSnapshot`, `ruleVersionsSnapshot` — and it is complete the moment
 * `mfAnalysisEngine.service.ts` commits. The narration is decoration on top of
 * it: `06 §6` says that when `proseVerified` is false the UI shows the
 * deterministic headlines and **no error to the user**, because a failed
 * narration is not a failed analysis. If prose generation ran inside the run,
 * an Anthropic outage would turn a perfectly good analysis into a `FAILED` row
 * and remove correct findings from a user's screen. So it runs afterwards, on
 * its own queue, and every failure path below terminates in "leave the verdict
 * row exactly as the engine wrote it".
 *
 * ---------------------------------------------------------------------------
 * Why an in-process queue rather than Bull
 * ---------------------------------------------------------------------------
 *
 * Same reasoning as `mfAnalysisJob.ts`, which this file deliberately mirrors:
 * `lib/queue.ts` has two Bull queues and both exist because their work is
 * long, retryable and must survive a restart. This work is none of those. A
 * narration lost to a deploy is regenerated on the next run, and a narration
 * *retried* after a restart would spend a second time on a fund whose prose
 * had already landed. What it does need is coalescing — a burst of holdings
 * changes produces a burst of runs — so the queue is a `Map` keyed by run id.
 *
 * ---------------------------------------------------------------------------
 * Registration
 * ---------------------------------------------------------------------------
 *
 * Deliberately absent from `src/index.ts` and `jobs/index.ts`. This module
 * exports `startMfProseJob` and the boot sequence wires it, matching
 * `startMfAnalysisJob` / `startMfPeerRankJob`.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import type { MfFinding, MfVerdictKind } from '@portfolioos/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { checkBudget } from '../ingestion/llm/budget.js';
import { recordSpend } from '../ingestion/llm/client.js';
import {
  findAdvisoryImperatives,
  verifyProseNumbers,
} from '../services/advisor/proseConsistency.js';
import {
  MF_PROSE_MAX_CHARS,
  MF_PROSE_TOOL_DESCRIPTION,
  MF_PROSE_TOOL_NAME,
  MF_PROSE_TOOL_SCHEMA,
  buildMfProseSystemPrompt,
  buildMfProseUserMessage,
  mfProseImperativesPermitted,
  type MfProseFinding,
  type MfProsePillar,
  type MfProsePromptInput,
} from '../ai/prompts/mfAnalysis.prose.js';
import type { MfAnalysisFacts, MfFundFacts } from '../services/mfAnalytics/types.js';

// ---------------------------------------------------------------------------
// Ledger identity
// ---------------------------------------------------------------------------

/**
 * `LlmSpend.purpose` for this surface. Distinct from `advisor_prose` so the
 * two narration layers can be budgeted, priced and — most importantly —
 * *alerted on* separately: `06 §7` asks for a prose verification failure rate
 * for THIS pipeline, and a shared purpose string would mix in the advisor's.
 */
export const MF_PROSE_PURPOSE = 'mf_analysis_prose';

/**
 * Prefix on `LlmSpend.errorMessage` for a narration the verifier threw away.
 *
 * This is what makes `06 §7`'s alert computable from durable rows rather than
 * from a log scrape. A verification failure and an Anthropic 500 are both
 * `success: false`, and only the first one indicates a prompt regression — the
 * thing the alert is actually watching for.
 */
export const PROSE_VERIFICATION_FAILED_PREFIX = 'PROSE_VERIFICATION_FAILED';

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Sonnet-class published pricing (USD/MTok, as of 2026-04), kept local for the
 * same reason `advisorProse.service.ts` keeps its own copy: changing what the
 * MF narrator costs must never silently move the email parser's Haiku
 * constants. FX comes from the single `llm.usd_inr_fx` AppSetting all LLM
 * surfaces share, so one ops change moves them together.
 */
const USD_PER_MTOK_INPUT = new Decimal('3.00');
const USD_PER_MTOK_OUTPUT = new Decimal('15.00');
const FX_USD_INR_DEFAULT = new Decimal('90');

async function readFx(): Promise<Decimal> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.usd_inr_fx' } });
  if (!row) return FX_USD_INR_DEFAULT;
  const v = row.value;
  if (typeof v === 'number' || typeof v === 'string') return new Decimal(v);
  return FX_USD_INR_DEFAULT;
}

/** Runtime override, falling back to the env default — the same two-level knob
 *  the advisor and assistant models use, so ops manages all three the same way. */
async function readMfProseModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.mf_prose_model' } });
  if (row && typeof row.value === 'string') return row.value;
  return env.LLM_ADVISOR_MODEL;
}

function estimateCostInr(inputTokens: number, outputTokens: number, fx: Decimal): Decimal {
  const usd = USD_PER_MTOK_INPUT.mul(inputTokens)
    .plus(USD_PER_MTOK_OUTPUT.mul(outputTokens))
    .dividedBy(1_000_000);
  return usd.mul(fx);
}

// ---------------------------------------------------------------------------
// Transport (and the test seam)
// ---------------------------------------------------------------------------

export interface MfProseTransportRequest {
  model: string;
  system: string;
  userMessage: string;
}

export interface MfProseTransportResponse {
  inputTokens: number;
  outputTokens: number;
  /** Null when the model answered without calling the tool. */
  prose: string | null;
  stopReason: string | null;
}

export type MfProseTransport = (
  req: MfProseTransportRequest,
) => Promise<MfProseTransportResponse>;

let transportOverride: MfProseTransport | null = null;

/**
 * Replace the Anthropic call for a test.
 *
 * The seam is a function rather than a mocked SDK module because the tests
 * that matter here are about what happens to a *specific reply* — a number
 * absent from the evidence, a number that differs in the last decimal, an
 * imperative under a prohibition — and expressing those as a stub reply is
 * direct where mocking a client's message-block shape is ceremony. `05 §8.6`
 * requires this test and it must never reach a real model.
 */
export function __setMfProseTransportForTests(t: MfProseTransport | null): void {
  transportOverride = t;
}

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — the gate should have refused earlier');
  }
  anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const ProsePayloadSchema = z.object({ prose: z.string().min(1).max(MF_PROSE_MAX_CHARS) });

const anthropicTransport: MfProseTransport = async (req) => {
  const res = await getClient().messages.create({
    model: req.model,
    max_tokens: 700,
    system: req.system,
    tools: [
      {
        name: MF_PROSE_TOOL_NAME,
        description: MF_PROSE_TOOL_DESCRIPTION,
        input_schema: MF_PROSE_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    // Forced, not offered. A narration is the only acceptable reply, and a
    // model that answers in free text has produced something with no schema
    // and no length ceiling.
    tool_choice: { type: 'tool', name: MF_PROSE_TOOL_NAME },
    messages: [{ role: 'user', content: req.userMessage }],
  });

  const toolBlock = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === MF_PROSE_TOOL_NAME,
  );
  // Re-validated with Zod even though the tool schema was sent: a model can
  // violate its own tool schema, rarely but really, and the alternative is
  // discovering it as a type error three frames deeper.
  const parsed = toolBlock ? ProsePayloadSchema.safeParse(toolBlock.input) : null;

  return {
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    prose: parsed?.success === true ? parsed.data.prose.trim() : null,
    stopReason: res.stop_reason,
  };
};

function transport(): MfProseTransport {
  return transportOverride ?? anthropicTransport;
}

// ---------------------------------------------------------------------------
// The gate (`05 §6`, `06 §6`)
// ---------------------------------------------------------------------------

/**
 * Whether narration can run at all. Both halves are required: a key without
 * the flag, or the flag without a key, is off.
 *
 * `05 §6`: the pipeline is "skipped entirely (findings still shown) if either
 * is off". Absence of prose is never an error to the user, so callers treat
 * `false` as "do nothing", never as a condition to report.
 */
export function isMfProseEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && env.ENABLE_LLM_ADVISOR_PROSE === 'true';
}

function riaVerdictsEnabled(): boolean {
  return env.RIA_VERDICTS_ENABLED === 'true';
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export type MfProseOutcome =
  | 'verified'
  /** Numbers or an imperative failed the post-check; prose discarded. */
  | 'rejected'
  /** Transport, tool-use or schema failure. */
  | 'failed'
  /** Monthly LLM budget exhausted before the call. No tokens spent. */
  | 'capped'
  /** Nothing worth narrating (a clean HOLD with no findings). No call made. */
  | 'skipped';

export interface MfProseVerdictResult {
  verdictId: string;
  schemeCode: string;
  outcome: MfProseOutcome;
  /** Populated for `rejected`: the tokens or imperatives that failed the check. */
  offending?: string[];
  reason?: string;
}

export interface MfProseRunResult {
  runId: string;
  /** True when the feature flag or the API key is off; nothing was attempted. */
  disabled: boolean;
  results: MfProseVerdictResult[];
  /** Total INR recorded against this run, written to `MfAnalysisRun.llmSpendInr`. */
  spendInr: string;
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

function toProseFindings(findings: readonly MfFinding[]): MfProseFinding[] {
  return findings.map((f) => ({
    code: f.code,
    category: f.category,
    severity: f.severity,
    headline: f.headline,
    whatWouldChangeThis: f.whatWouldChangeThis,
    evidence: f.evidence.map((e) => ({
      metric: e.metric,
      label: e.label,
      ...(e.horizonYears === undefined ? {} : { horizonYears: e.horizonYears }),
      value: e.value,
      ...(e.categoryMedian === undefined ? {} : { categoryMedian: e.categoryMedian }),
      ...(e.percentile === undefined ? {} : { percentile: e.percentile }),
      ...(e.benchmarkValue === undefined ? {} : { benchmarkValue: e.benchmarkValue }),
      unit: e.unit,
    })),
  }));
}

function toProsePillars(fund: MfFundFacts): MfProsePillar[] {
  const score = fund.score;
  if (score === null) return [];
  return Object.entries(score.pillars).map(([pillar, p]) => ({
    pillar,
    score: p.score,
    weight: p.weight,
  }));
}

/**
 * Assemble the one payload the model sees for one fund.
 *
 * Everything comes from the run's own `factsSnapshot` and the run's own
 * findings — never a live read of another table, and never a second user's
 * anything. Building it from the snapshot rather than from current data also
 * makes the narration reproducible: re-running this against a stored run
 * yields the same prompt six months later, which is what makes a rejected
 * narration diagnosable at all.
 */
export function buildMfProsePromptInput(args: {
  fund: MfFundFacts;
  verdict: MfVerdictKind;
  reasons: string[];
  findings: readonly MfFinding[];
  switchCost: { exitLoadInr: string; taxInr: string; breakEvenMonths: string | null } | null;
  replacementName: string | null;
  riaVerdictsEnabled: boolean;
}): MfProsePromptInput {
  const { fund } = args;
  const held = fund.held;
  const score = fund.score;

  const input: MfProsePromptInput = {
    schemeName: fund.meta.schemeName,
    sebiSubCategory: fund.meta.sebiSubCategory,
    planType: fund.meta.planType,
    verdict: args.verdict,
    reasons: args.reasons,
    rating: score?.rating ?? null,
    ratingStatus: score?.ratingStatus ?? 'UNSCORED',
    composite: score?.composite ?? null,
    pillars: toProsePillars(fund),
    findings: toProseFindings(args.findings),
    holding: {
      units: held.units,
      investedValue: held.investedValue,
      currentValue: held.currentValue,
      absoluteGain: held.absoluteGain,
      absoluteGainPct: held.absoluteGainPct,
      userXirr: held.userXirr,
      holdingPeriodDays: held.holdingPeriodDays,
      sipActive: held.sipActive,
      weightInMfPortfolio: held.weightInMfPortfolio,
    },
  };

  // The replacement is attached ONLY on the branch that is allowed to name it.
  // Not "mentioned only in that branch's prompt": absent from the payload, so
  // a model that ignores an instruction still has no fund name to offer.
  if (
    args.replacementName !== null &&
    args.switchCost !== null &&
    mfProseImperativesPermitted({ riaVerdictsEnabled: args.riaVerdictsEnabled, verdict: args.verdict })
  ) {
    input.replacement = {
      name: args.replacementName,
      exitLoadInr: args.switchCost.exitLoadInr,
      taxInr: args.switchCost.taxInr,
      breakEvenMonths: args.switchCost.breakEvenMonths,
    };
  }

  return input;
}

// ---------------------------------------------------------------------------
// One verdict
// ---------------------------------------------------------------------------

interface VerdictRow {
  id: string;
  schemeCode: string;
  verdict: MfVerdictKind;
  reasons: string[];
  switchCost: { exitLoadInr: string; taxInr: string; breakEvenMonths: string | null } | null;
  suggestedReplacementSchemeCode: string | null;
}

/**
 * Generate, verify and persist the narration for a single verdict.
 *
 * Returns an outcome; **never throws** for anything the model or the network
 * did. The caller is a queue drain that must continue to the next fund, and
 * one fund's bad reply is not a reason to leave eleven others unnarrated.
 */
async function proseForVerdict(args: {
  userId: string;
  runId: string;
  row: VerdictRow;
  fund: MfFundFacts;
  findings: readonly MfFinding[];
  /**
   * Resolved from `facts.approvedUniverse`, never from the verdict row: the
   * row stores a scheme CODE, and a code in the payload is a run of digits the
   * verifier would then have to allow the model to quote as though it were a
   * figure. The reader needs the name anyway.
   */
  replacementName: string | null;
  model: string;
  fx: Decimal;
  ria: boolean;
}): Promise<{ result: MfProseVerdictResult; costInr: Decimal }> {
  const { userId, runId, row, findings, model, fx, ria } = args;
  const zero = new Decimal(0);

  // Nothing to narrate. A clean HOLD carries no findings by construction
  // (`mfVerdict.ts` row 6 returns an empty reasons list), and three sentences
  // about the absence of observations is exactly the padding `05 §6.2`
  // forbids — as well as a paid call for no information.
  if (findings.length === 0) {
    return {
      result: { verdictId: row.id, schemeCode: row.schemeCode, outcome: 'skipped', reason: 'no findings to narrate' },
      costInr: zero,
    };
  }

  const promptInput = buildMfProsePromptInput({
    fund: args.fund,
    verdict: row.verdict,
    reasons: row.reasons,
    findings,
    switchCost: row.switchCost,
    replacementName: args.replacementName,
    riaVerdictsEnabled: ria,
  });

  const system = buildMfProseSystemPrompt({ riaVerdictsEnabled: ria, verdict: row.verdict });
  // THE ONE STRING. What the model is shown and what the verifier allows are
  // the same value, so the two can never drift apart. See the header of
  // `ai/prompts/mfAnalysis.prose.ts`.
  const userMessage = buildMfProseUserMessage(promptInput);

  let response: MfProseTransportResponse | null = null;
  let apiError: Error | null = null;
  try {
    response = await transport()({ model, system, userMessage });
  } catch (err) {
    apiError = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: apiError, userId, runId, schemeCode: row.schemeCode }, 'mf.prose.api_error');
  }

  const inputTokens = response?.inputTokens ?? 0;
  const outputTokens = response?.outputTokens ?? 0;
  const costInr = estimateCostInr(inputTokens, outputTokens, fx);

  const fail = async (
    outcome: MfProseOutcome,
    reason: string,
    offending?: string[],
  ): Promise<{ result: MfProseVerdictResult; costInr: Decimal }> => {
    await recordSpend({
      userId,
      model,
      inputTokens,
      outputTokens,
      costInr,
      purpose: MF_PROSE_PURPOSE,
      sourceRef: row.id,
      success: false,
      errorMessage: reason,
    });
    // The verdict row is left EXACTLY as the engine wrote it: prose null,
    // proseVerified false. `06 §6` then renders the deterministic headlines
    // and says nothing to the user about the narration that did not happen.
    return {
      result: {
        verdictId: row.id,
        schemeCode: row.schemeCode,
        outcome,
        reason,
        ...(offending === undefined ? {} : { offending }),
      },
      costInr,
    };
  };

  if (apiError !== null || response === null) {
    return fail('failed', apiError?.message ?? 'unknown Anthropic error');
  }
  if (response.prose === null) {
    return fail(
      'failed',
      `Model returned stop_reason="${response.stopReason}" without a valid ${MF_PROSE_TOOL_NAME} payload`,
    );
  }

  const prose = response.prose.trim();

  // ---- The anti-hallucination check (`05 §6.3`) ----------------------------
  //
  // This is the load-bearing line of the whole pipeline. A fabricated number
  // that renders as advice is the worst thing this layer can produce: a reader
  // cannot tell a computed rupee figure from a plausible-sounding one, and
  // neither can the adviser who signs it off. Tolerance is rounding to the
  // precision the prose itself displayed — nothing more.
  const numbers = verifyProseNumbers({ allowed: [userMessage], prose });
  if (!numbers.ok) {
    logger.warn(
      { userId, runId, verdictId: row.id, schemeCode: row.schemeCode, model, offending: numbers.offending },
      'mf.prose.rejected_inconsistent',
    );
    return fail(
      'rejected',
      `${PROSE_VERIFICATION_FAILED_PREFIX}: narration contained figures absent from the evidence: ${numbers.offending.join(', ')}`,
      numbers.offending,
    );
  }

  // ---- The compliance check (`06 §4`) -------------------------------------
  //
  // The prompt forbids imperatives on every branch except an RIA-enabled
  // SWITCH_CANDIDATE. An unverified prompt constraint is a comment, so the
  // output is checked against the same rule the prompt states.
  if (!mfProseImperativesPermitted({ riaVerdictsEnabled: ria, verdict: row.verdict })) {
    const imperatives = findAdvisoryImperatives(prose);
    if (imperatives.length > 0) {
      logger.warn(
        { userId, runId, verdictId: row.id, schemeCode: row.schemeCode, model, imperatives },
        'mf.prose.rejected_imperative',
      );
      return fail(
        'rejected',
        `${PROSE_VERIFICATION_FAILED_PREFIX}: narration gave an instruction where advice is not permitted: ${imperatives.join(', ')}`,
        imperatives,
      );
    }
  }

  await recordSpend({
    userId,
    model,
    inputTokens,
    outputTokens,
    costInr,
    purpose: MF_PROSE_PURPOSE,
    sourceRef: row.id,
    success: true,
  });

  await runInTransaction((tx) =>
    tx.mfFundVerdict.update({
      where: { id: row.id },
      data: { prose, proseModel: model, proseVerified: true },
    }),
  );

  return {
    result: { verdictId: row.id, schemeCode: row.schemeCode, outcome: 'verified' },
    costInr,
  };
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

function parseReasons(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
}

function parseSwitchCost(
  raw: unknown,
): { exitLoadInr: string; taxInr: string; breakEvenMonths: string | null } | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.exitLoadInr !== 'string' || typeof o.taxInr !== 'string') return null;
  return {
    exitLoadInr: o.exitLoadInr,
    taxInr: o.taxInr,
    breakEvenMonths: typeof o.breakEvenMonths === 'string' ? o.breakEvenMonths : null,
  };
}

/**
 * The display name of a suggested replacement, from the run's own snapshot.
 *
 * Returns null when the code is not in the snapshot's approved universe — in
 * which case the payload carries no replacement at all, and the narration
 * cannot name a fund it has no name for. Silently degrading to the code would
 * put "120503" in front of a reader as though it meant something.
 */
function resolveReplacementName(facts: MfAnalysisFacts, schemeCode: string | null): string | null {
  if (schemeCode === null) return null;
  const match = facts?.approvedUniverse?.find((c) => c.schemeCode === schemeCode);
  return match?.schemeName ?? null;
}

/**
 * Narrate every verdict of one completed run.
 *
 * **Must be called inside the run owner's RLS context.** Every table touched
 * here is user-scoped and fails closed to zero rows without one, which would
 * read as "this run has no verdicts" and silently produce nothing.
 *
 * The budget is checked before EVERY call, not once at the top: a run over a
 * large book can cross the cap partway through, and the correct behaviour is
 * to stop at that fund with the narrations already earned kept, rather than to
 * spend past the cap because the first check passed.
 */
export async function generateProseForRun(
  userId: string,
  runId: string,
): Promise<MfProseRunResult> {
  const empty: MfProseRunResult = { runId, disabled: false, results: [], spendInr: '0' };

  // Gate first, before a single query: `05 §6` skips the pipeline entirely
  // when the flag or the key is off, and a disabled deployment should not be
  // reading facts snapshots to decide to do nothing.
  if (!isMfProseEnabled()) return { ...empty, disabled: true };

  const run = await prisma.mfAnalysisRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, status: true, factsSnapshot: true },
  });
  if (run === null) {
    // Not an error worth throwing: a run can legitimately vanish between the
    // enqueue and the drain (a test tearing down, a deleted user).
    logger.warn({ userId, runId }, 'mf.prose.run_not_found');
    return empty;
  }
  if (run.status === 'FAILED' || run.status === 'RUNNING') {
    // Narrating an incomplete analysis would put prose on findings that are
    // still moving. The next completed run gets narrated instead.
    return empty;
  }

  const facts = run.factsSnapshot as unknown as MfAnalysisFacts;
  const funds = facts?.funds ?? {};

  const verdictRows = await prisma.mfFundVerdict.findMany({
    where: { runId, userId },
    select: {
      id: true,
      schemeCode: true,
      verdict: true,
      reasons: true,
      switchCost: true,
      suggestedReplacementSchemeCode: true,
      prose: true,
    },
    orderBy: { schemeCode: 'asc' },
  });

  const findingRows = await prisma.mfFinding.findMany({
    where: { runId, userId },
    // Ordered by code so two narrations of the same run see the findings in
    // the same sequence. The prompt is reproducible or a rejection is not
    // diagnosable.
    orderBy: [{ code: 'asc' }],
  });

  const findingsByScheme = new Map<string, MfFinding[]>();
  for (const f of findingRows) {
    if (f.schemeCode === null) continue;
    const bucket = findingsByScheme.get(f.schemeCode);
    const finding = {
      id: f.id,
      runId: f.runId,
      schemeCode: f.schemeCode,
      ruleId: f.ruleId,
      ruleVersion: f.ruleVersion,
      code: f.code,
      category: f.category,
      severity: f.severity,
      confidence: f.confidence.toString(),
      headline: f.headline,
      evidence: f.evidence,
      whatWouldChangeThis: f.whatWouldChangeThis,
      createdAt: f.createdAt.toISOString(),
    } as unknown as MfFinding;
    if (bucket === undefined) findingsByScheme.set(f.schemeCode, [finding]);
    else bucket.push(finding);
  }

  const model = await readMfProseModel();
  const fx = await readFx();
  const ria = riaVerdictsEnabled();

  const results: MfProseVerdictResult[] = [];
  let total = new Decimal(0);

  for (const row of verdictRows) {
    // Already narrated (a re-drain of the same run, or a verdict the engine
    // did not supersede). Regenerating would spend twice for the same text.
    if (row.prose !== null) continue;

    const fund = funds[row.schemeCode];
    if (fund === undefined) {
      // The snapshot and the verdict rows disagree — possible only if the run
      // was written by an older engine. Recorded, not swallowed, and not fatal.
      logger.warn({ userId, runId, schemeCode: row.schemeCode }, 'mf.prose.fund_absent_from_snapshot');
      results.push({
        verdictId: row.id,
        schemeCode: row.schemeCode,
        outcome: 'skipped',
        reason: 'scheme absent from factsSnapshot',
      });
      continue;
    }

    const budget = await checkBudget(userId);
    if (budget.status === 'capped') {
      // `05 §6`: over budget, the pipeline is skipped and the findings are
      // still shown. No call, no tokens, no error to the user.
      logger.info(
        { userId, runId, spent: budget.spent.toString(), cap: budget.cap.toString() },
        'mf.prose.budget_capped',
      );
      results.push({
        verdictId: row.id,
        schemeCode: row.schemeCode,
        outcome: 'capped',
        reason: `Monthly LLM cap reached (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)}).`,
      });
      continue;
    }

    const { result, costInr } = await proseForVerdict({
      userId,
      runId,
      row: {
        id: row.id,
        schemeCode: row.schemeCode,
        verdict: row.verdict,
        reasons: parseReasons(row.reasons),
        switchCost: parseSwitchCost(row.switchCost),
        suggestedReplacementSchemeCode: row.suggestedReplacementSchemeCode,
      },
      fund,
      findings: findingsByScheme.get(row.schemeCode) ?? [],
      replacementName: resolveReplacementName(facts, row.suggestedReplacementSchemeCode),
      model,
      fx,
      ria,
    });
    results.push(result);
    total = total.plus(costInr);
  }

  // `05 §6.4`: "Record spend on the run." Written once, at the end, so a run
  // that narrated twelve funds carries one figure rather than twelve updates
  // of the same column. Zero is still written: "we narrated this run and it
  // cost nothing" is a different fact from "we never tried", which the null
  // the engine leaves behind already says.
  if (results.length > 0) {
    await runInTransaction((tx) =>
      tx.mfAnalysisRun.update({
        where: { id: runId },
        data: { llmSpendInr: total.toFixed(4) },
      }),
    );
  }

  logger.info(
    {
      userId,
      runId,
      model,
      verdicts: results.length,
      verified: results.filter((r) => r.outcome === 'verified').length,
      rejected: results.filter((r) => r.outcome === 'rejected').length,
      failed: results.filter((r) => r.outcome === 'failed').length,
      spendInr: total.toFixed(4),
    },
    'mf.prose.run_complete',
  );

  return { runId, disabled: false, results, spendInr: total.toFixed(4) };
}

// ---------------------------------------------------------------------------
// Coalescing queue
// ---------------------------------------------------------------------------

/** Runs with narration pending, keyed by run id so a duplicate enqueue of the
 *  same run collapses rather than paying for the same text twice. */
const pending = new Map<string, string>();

let started = false;
let draining = false;

/**
 * Queue a run for narration. Returns immediately and **never throws**.
 *
 * This is called from the tail of `mfAnalysisEngine.service.ts`, after its
 * commit. `05 §7` is explicit that prose "failures never affect the run
 * status", so the enqueue is a `void` with no failure mode the engine can
 * observe: not a promise it could reject, not a value it could branch on.
 *
 * A no-op when the gate is off, so a deployment without an API key does not
 * accumulate a map of runs nobody will ever narrate.
 */
export function enqueueMfProse(userId: string, runId: string): void {
  if (!isMfProseEnabled()) return;
  pending.set(runId, userId);
  if (started && !draining) void drainMfProseQueue();
}

/**
 * Narrate everything currently queued, one run at a time.
 *
 * Serial, and each run in its own user's RLS context. Never throws: a run that
 * fails is logged and the loop continues, because one user's narration problem
 * must not stop everybody else's — the same guarantee the analysis engine
 * gives its rules, one level up.
 *
 * Exported so a test can await the drain instead of polling for it.
 */
export async function drainMfProseQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pending.size > 0) {
      const [runId, userId] = pending.entries().next().value as [string, string];
      pending.delete(runId);
      try {
        await runAsUser(userId, () => generateProseForRun(userId, runId));
      } catch (err) {
        logger.error({ err, userId, runId }, 'mf.prose.run_failed');
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Start the worker. Named starter, deliberately NOT registered anywhere.
 *
 * There is no cron: an analysis run is the schedule. Starting opens the drain
 * for anything enqueued during boot.
 */
export function startMfProseJob(): void {
  if (process.env.ENABLE_MF_PROSE_JOB === 'false') {
    logger.info('[mfProse] job disabled via ENABLE_MF_PROSE_JOB=false');
    return;
  }
  if (!isMfProseEnabled()) {
    logger.info(
      '[mfProse] narration disabled (needs ANTHROPIC_API_KEY and ENABLE_LLM_ADVISOR_PROSE=true) — findings are unaffected',
    );
    return;
  }
  started = true;
  logger.info({ queued: pending.size }, '[mfProse] job started — narrates completed analysis runs');
  if (pending.size > 0) void drainMfProseQueue();
}

/** Stop accepting drains and forget anything queued. For tests and shutdown;
 *  a dropped narration is regenerated by the next analysis run. */
export function stopMfProseJob(): void {
  started = false;
  pending.clear();
}

// ---------------------------------------------------------------------------
// Verification-failure-rate alert (`06 §7`)
// ---------------------------------------------------------------------------

/**
 * `06 §7`: "Prose verification failure rate > 5% over a day (indicates prompt
 * regression)."
 *
 * The rate is deliberately narrow: **verification failures over verification
 * outcomes**. An Anthropic outage produces a hundred `failed` rows and tells
 * an operator nothing about the prompt; only a reply that arrived and was
 * thrown away for containing a number the evidence did not have is evidence
 * that the prompt, the model version or the payload shape has moved.
 */
export const PROSE_VERIFICATION_FAILURE_RATE_THRESHOLD = new Decimal('0.05');

/**
 * Below this many verified-or-rejected outcomes in the day, no alert is raised.
 *
 * Without a floor, the first rejection of a quiet day is a 100% failure rate
 * and pages somebody about a single fund. The alert is watching for a
 * regression, which is a property of a population.
 */
export const PROSE_VERIFICATION_MIN_SAMPLE = 20;

export interface ProseVerificationRateResult {
  day: string;
  verified: number;
  rejected: number;
  rate: string;
  alerted: boolean;
  /** Why no alert, when none was raised. */
  reason?: string;
}

function utcDayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * `IngestionFailure` and `Alert` both require a `userId`; this is
 * cross-tenant operational work owned by nobody. Attribute it to the oldest
 * active ADMIN — the same resolution every reference-data job in `src/jobs`
 * uses, because two of them disagreeing about who owns an ops alert is how
 * half of them end up somewhere nobody is looking.
 */
async function resolveOpsUserId(override?: string): Promise<string | null> {
  if (override !== undefined) return override;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Compute the day's prose verification failure rate and raise an ops alert if
 * it breaches. Safe to run repeatedly — the alert is deduped by
 * `(userId, type, title, triggerDate)`, the same key the other reference-data
 * jobs use.
 *
 * Reads across every user's `LlmSpend`, so it runs under `runAsSystem`: this
 * is a question about the fleet, which no single user's RLS context can
 * answer. Nothing user-identifying leaves the function.
 */
export async function checkMfProseVerificationFailureRate(opts: {
  day?: Date;
  opsUserId?: string;
} = {}): Promise<ProseVerificationRateResult> {
  const day = opts.day ?? new Date();
  const { start, end } = utcDayBounds(day);
  const dayLabel = start.toISOString().slice(0, 10);

  return runAsSystem(async () => {
    const rows = await prisma.llmSpend.findMany({
      where: { purpose: MF_PROSE_PURPOSE, createdAt: { gte: start, lt: end } },
      select: { success: true, errorMessage: true },
    });

    let verified = 0;
    let rejected = 0;
    for (const r of rows) {
      if (r.success) verified += 1;
      else if (r.errorMessage?.startsWith(PROSE_VERIFICATION_FAILED_PREFIX) === true) rejected += 1;
      // Everything else is a transport or schema failure and is deliberately
      // outside both the numerator and the denominator.
    }

    const sample = verified + rejected;
    const rate = sample === 0 ? new Decimal(0) : new Decimal(rejected).dividedBy(sample);
    const base: ProseVerificationRateResult = {
      day: dayLabel,
      verified,
      rejected,
      rate: rate.toFixed(4),
      alerted: false,
    };

    if (sample < PROSE_VERIFICATION_MIN_SAMPLE) {
      return { ...base, reason: `only ${sample} verification outcomes; minimum sample is ${PROSE_VERIFICATION_MIN_SAMPLE}` };
    }
    if (rate.lessThanOrEqualTo(PROSE_VERIFICATION_FAILURE_RATE_THRESHOLD)) {
      return { ...base, reason: 'within threshold' };
    }

    const opsUserId = await resolveOpsUserId(opts.opsUserId);
    const title = `MF prose verification failures: ${dayLabel}`;
    const description =
      `${rejected} of ${sample} generated fund narrations (${rate.times(100).toFixed(1)}%) were discarded ` +
      `because they contained a figure absent from the evidence or an instruction that is not permitted. ` +
      `The threshold is ${PROSE_VERIFICATION_FAILURE_RATE_THRESHOLD.times(100).toFixed(0)}%. ` +
      `A rate this high indicates a prompt regression or a model change, not a run of unlucky funds. ` +
      `No user saw the discarded text — the deterministic headlines were shown instead.`;

    if (opsUserId === null) {
      logger.error({ title, verified, rejected }, `[mfProse] ${description} (no ADMIN user to alert)`);
      return { ...base, reason: 'no ADMIN user to alert' };
    }

    const existing = await prisma.alert.findFirst({
      where: { userId: opsUserId, type: 'CUSTOM', title, triggerDate: start },
      select: { id: true },
    });
    if (existing === null) {
      await prisma.alert.create({
        data: {
          userId: opsUserId,
          type: 'CUSTOM',
          title,
          description,
          triggerDate: start,
          metadata: { source: MF_PROSE_PURPOSE, verified, rejected, rate: rate.toFixed(4) },
        },
      });
    }
    logger.warn({ title, verified, rejected, rate: rate.toFixed(4) }, `[mfProse] ${description}`);
    return { ...base, alerted: true };
  });
}
