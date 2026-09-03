/**
 * Optional LLM narration for a single advisor recommendation.
 *
 * This layer is decorative by construction. The deterministic engine has
 * already chosen the security, the direction, the amount and the units, and has
 * already written a number-bearing `rationale` that is the authoritative text.
 * All this service adds is a friendlier paraphrase of that rationale, and the
 * recommendation must remain completely usable with `llmProse` null — every
 * caller renders `rationale` first and treats prose as an enhancement.
 *
 * Three separate stops, in order, before anything is written back:
 *   1. Gate — off unless ANTHROPIC_API_KEY is set AND
 *      ENABLE_LLM_ADVISOR_PROSE=true. Unlike the insights gate this does NOT
 *      open itself in development: prescriptive text is the one output where a
 *      convenience default is the wrong trade.
 *   2. Budget — the same monthly INR ledger the email parser and insights use,
 *      checked before the call and recorded after it.
 *   3. Consistency — `assertProseConsistency(rationale, prose)` must pass or
 *      the reply is thrown away unpersisted. This is the guard that stops a
 *      hallucinated figure reaching a user acting under a SEBI RIA licence, so
 *      it runs before the write, not after it, and there is no override.
 *
 * Structurally this mirrors analytics.insights.ts (forced tool call, zod
 * validation of the tool input, spend recorded on success and failure alike).
 * It deliberately does NOT reuse that module's SYSTEM_PROMPT: insights is
 * descriptive-only and must stay that way. See advisorSystemPrompt.ts.
 */

import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { Decimal } from 'decimal.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError } from '../../lib/errors.js';
import { checkBudget } from '../../ingestion/llm/budget.js';
import { recordSpend } from '../../ingestion/llm/client.js';
import { ADVISOR_PROSE_SYSTEM_PROMPT } from './advisorSystemPrompt.js';
import { assertProseConsistency } from './proseConsistency.js';
import type { TradeAction } from './types.js';

const TOOL_NAME = 'emit_recommendation_prose';
const TOOL_DESCRIPTION =
  'Emit the plain-language explanation of the recommendation supplied in the user message.';

/** Deliberately tight. Four sentences do not need more than this, and a hard
 *  ceiling is one more thing a runaway generation cannot get past. */
const MAX_PROSE_CHARS = 900;

const ProsePayloadSchema = z.object({
  prose: z.string().min(1).max(MAX_PROSE_CHARS),
});

const TOOL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prose'],
  properties: {
    prose: {
      type: 'string',
      maxLength: MAX_PROSE_CHARS,
      description: '2-4 plain sentences explaining why the recommendation follows from the figures.',
    },
  },
} as const;

// Sonnet-class pricing (Anthropic published USD/MTok, as of 2026-04), kept
// local for the same reason analytics.insights.ts keeps its own: changing the
// advisor's model must never move the email parser's Haiku constants. FX comes
// from the one `llm.usd_inr_fx` AppSetting all three surfaces share.
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

/** Runtime override, falling back to the env default. Same two-level knob the
 *  insights model uses, so ops manages both the same way. */
async function readAdvisorModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.advisor_model' } });
  if (row && typeof row.value === 'string') return row.value;
  return env.LLM_ADVISOR_MODEL;
}

function estimateCostInr(inputTokens: number, outputTokens: number, fx: Decimal): Decimal {
  const usd = USD_PER_MTOK_INPUT.mul(inputTokens)
    .plus(USD_PER_MTOK_OUTPUT.mul(outputTokens))
    .dividedBy(1_000_000);
  return usd.mul(fx);
}

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — gate should have refused earlier');
  }
  anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

/** Exposed for tests — resets the cached client so an env change takes effect. */
export function __resetAdvisorProseClientForTests(): void {
  anthropicClient = null;
}

/**
 * Whether the prose layer can run at all. Both halves are required: a key
 * without the flag, or the flag without a key, is off. Callers use this to
 * decide whether to offer the "explain this" affordance rather than letting the
 * user press a button that always returns 'disabled'.
 */
export function isAdvisorProseEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && env.ENABLE_LLM_ADVISOR_PROSE === 'true';
}

export type ProseResult =
  | { status: 'ok'; prose: string }
  | { status: 'disabled' | 'capped' | 'rejected' | 'failed'; reason: string };

/**
 * Everything the model is allowed to see. Note what is absent: no holdings, no
 * portfolio totals, no goal figures, no prices — only the three persisted
 * fields of the recommendation itself. The model cannot introduce a figure from
 * the wider portfolio because it was never shown one, which makes the
 * consistency check downstream a check on hallucination alone.
 */
function buildPromptContext(row: {
  category: string;
  rationale: string;
  action: unknown;
}): string {
  const actions = Array.isArray(row.action) ? (row.action as TradeAction[]) : [];
  const compact = {
    category: row.category,
    rationale: row.rationale,
    instructions: actions.map((a) => ({
      direction: a?.direction ?? null,
      bucket: a?.bucket ?? null,
      instrument: a?.instrumentName ?? null,
      units: a?.units ?? null,
      amountInr: a?.amountInr ?? null,
    })),
  };
  return JSON.stringify(compact, null, 2);
}

/**
 * Generate (or return the already-stored) narration for one recommendation.
 *
 * Never throws for an LLM-side problem — every failure mode is a status the
 * caller can render next to the authoritative rationale. A missing or
 * not-owned recommendation is the one genuine error, and surfaces as a 404.
 */
export async function generateProseForRecommendation(
  userId: string,
  recommendationId: string,
  opts?: { force?: boolean },
): Promise<ProseResult> {
  const rec = await prisma.advisorRecommendation.findFirst({
    where: { id: recommendationId, userId },
    select: { id: true, category: true, rationale: true, action: true, llmProse: true },
  });
  if (!rec) throw new NotFoundError('Recommendation not found');

  // Cached narration is returned as-is. There is no time window here (unlike
  // insights): the recommendation is immutable once written — a re-run
  // supersedes it with a new row rather than editing this one — so a stored
  // prose can never go stale relative to its rationale.
  if (rec.llmProse && !opts?.force) {
    return { status: 'ok', prose: rec.llmProse };
  }

  if (!isAdvisorProseEnabled()) {
    return {
      status: 'disabled',
      reason: env.ANTHROPIC_API_KEY
        ? 'AI narration is disabled (set ENABLE_LLM_ADVISOR_PROSE=true).'
        : 'ANTHROPIC_API_KEY is not set — AI narration is unavailable.',
    };
  }

  const budget = await checkBudget(userId);
  if (budget.status === 'capped') {
    logger.warn(
      { userId, recommendationId, spent: budget.spent.toString(), cap: budget.cap.toString() },
      'advisor.prose.budget_capped',
    );
    return {
      status: 'capped',
      reason: `Monthly LLM cap reached (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)}).`,
    };
  }

  const context = buildPromptContext(rec);
  const model = await readAdvisorModel();
  const fx = await readFx();

  let apiResponse:
    | {
        inputTokens: number;
        outputTokens: number;
        toolInput: unknown | null;
        stopReason: string | null;
      }
    | null = null;
  let apiError: Error | null = null;

  try {
    const client = getClient();
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      system: ADVISOR_PROSE_SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          input_schema: TOOL_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: context }],
    });
    const toolBlock = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    );
    apiResponse = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      toolInput: toolBlock?.input ?? null,
      stopReason: res.stop_reason,
    };
  } catch (err) {
    apiError = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: apiError, userId, recommendationId }, 'advisor.prose.api_error');
  }

  const inputTokens = apiResponse?.inputTokens ?? 0;
  const outputTokens = apiResponse?.outputTokens ?? 0;
  const costInr = estimateCostInr(inputTokens, outputTokens, fx);

  // Recorded before any of the checks below, and regardless of outcome: the
  // tokens were spent whether or not we end up keeping the text.
  await recordSpend({
    userId,
    model,
    inputTokens,
    outputTokens,
    costInr,
    purpose: 'advisor_prose',
    sourceRef: recommendationId,
    success: apiError === null && !!apiResponse?.toolInput,
    errorMessage: apiError?.message,
  });

  if (apiError || !apiResponse) {
    return { status: 'failed', reason: apiError?.message ?? 'unknown Anthropic error' };
  }
  if (apiResponse.toolInput == null) {
    return {
      status: 'failed',
      reason: `Model returned stop_reason="${apiResponse.stopReason}" without calling ${TOOL_NAME}`,
    };
  }

  const parsed = ProsePayloadSchema.safeParse(apiResponse.toolInput);
  if (!parsed.success) {
    logger.warn(
      { userId, recommendationId, zodError: parsed.error.flatten() },
      'advisor.prose.validation_error',
    );
    return {
      status: 'failed',
      reason: `Tool output failed schema validation: ${parsed.error.message}`,
    };
  }

  const prose = parsed.data.prose.trim();

  // The load-bearing line of this file. Any figure in the prose that is not in
  // the deterministic rationale means the model invented a number about the
  // user's money, and nothing is written. Rejections are logged loudly because
  // a rising rate here is a signal that the prompt or the model needs work.
  const consistency = assertProseConsistency(rec.rationale, prose);
  if (!consistency.ok) {
    logger.warn(
      { userId, recommendationId, model, offending: consistency.offending },
      'advisor.prose.rejected_inconsistent',
    );
    return {
      status: 'rejected',
      reason: `Narration referenced figures absent from the rationale and was discarded: ${consistency.offending.join(', ')}`,
    };
  }

  await prisma.advisorRecommendation.update({
    where: { id: rec.id },
    data: {
      llmProse: prose,
      llmModel: model,
      llmCostInr: costInr.toFixed(4),
    },
  });

  logger.info(
    {
      userId,
      recommendationId,
      model,
      inputTokens,
      outputTokens,
      costInr: costInr.toFixed(4),
    },
    'advisor.prose.ok',
  );

  return { status: 'ok', prose };
}
