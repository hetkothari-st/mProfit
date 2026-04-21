import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { Decimal } from '@portfolioos/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { redactForLlm, type RedactionResult } from '../pii.js';
import {
  ANTHROPIC_TOOL_DESCRIPTION,
  ANTHROPIC_TOOL_JSON_SCHEMA,
  ANTHROPIC_TOOL_NAME,
  ParsedEventsSchema,
  type ParsedEvent,
  type ParsedEvents,
} from './schema.js';
import {
  checkBudget,
  estimateCostInr,
  type BudgetStatus,
} from './budget.js';

/**
 * Phase 5-A LLM parser wrapper — wraps the Claude Haiku 4.5 Messages API
 * in a contract the rest of the ingestion pipeline can call without
 * knowing about Anthropic, token counting, or zero-retention headers.
 *
 * Responsibilities:
 *   1. §16 Gate G5 — refuse to fire live unless BOTH `ENABLE_LLM_PARSER`
 *      is true AND `ANTHROPIC_API_KEY` is set. The refusal is code-level,
 *      not documentation — flipping one flag without the other is a stop.
 *   2. §17 budget — `checkBudget(userId)` before each call; 'capped' short-
 *      circuits with a `budget_capped` reason so the caller archives the
 *      event per §6.11.
 *   3. §15.9 redaction — the email body is run through `redactForLlm`
 *      before it crosses the process boundary, and the category counts
 *      are logged for audit telemetry.
 *   4. §6.1 tool_use — we force `emit_events` so Haiku has no option but
 *      to return structured JSON matching our JSON Schema. The response
 *      is re-validated with Zod before being handed back; mismatches
 *      surface as `validation_error` (caller routes to `IngestionFailure`).
 *   5. §8 ledger — every call, success OR fail, writes one `LlmSpend`
 *      row so a flaky upstream that charges per-attempt cannot silently
 *      exhaust the monthly cap.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * System prompt is read once at module load. The file is committed in the
 * repo (source-controlled); changing it is a deliberate release action,
 * not a runtime config knob.
 */
const SYSTEM_PROMPT = readFileSync(
  join(__dirname, 'system-prompt.txt'),
  'utf8',
);

/** Shared client — reused across calls so keep-alive helps with back-to-back parses. */
let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — guard should have fired earlier');
  }
  anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export interface LlmParseInput {
  /** Owner of the resulting LlmSpend row. Required for RLS + budget scoping. */
  userId: string;
  /** Raw email body (HTML or text). Will be redacted before send. */
  emailBody: string;
  /** Opaque reference — gmail message id, file hash, etc. Goes into LlmSpend.sourceRef for audit. */
  sourceRef: string;
  /** Human-readable purpose string (e.g. "gmail_parse", "template_learning"). Goes into LlmSpend.purpose. */
  purpose: string;
}

export type LlmParseResult =
  | {
      ok: true;
      events: ParsedEvent[];
      isMarketing: boolean;
      usage: LlmUsage;
      budget: BudgetStatus;
      redaction: RedactionResult['stats'];
    }
  | {
      ok: false;
      reason: LlmFailureReason;
      message: string;
      usage?: LlmUsage;
      budget?: BudgetStatus;
    };

export type LlmFailureReason =
  | 'disabled'          // ENABLE_LLM_PARSER=false
  | 'missing_api_key'   // ANTHROPIC_API_KEY unset
  | 'budget_capped'     // monthly spend ≥ cap
  | 'api_error'         // Anthropic returned an error or network failed
  | 'no_tool_use'       // model replied with text instead of calling the tool
  | 'validation_error'; // tool input failed Zod validation

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costInr: Decimal;
}

/**
 * Pre-flight: returns `null` if the gate is open, otherwise a result
 * describing why we refuse. Extracted so callers (poller, tests) can
 * check the gate without triggering a redact+call.
 */
export function checkLlmGate():
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'missing_api_key'; message: string } {
  if (env.ENABLE_LLM_PARSER !== 'true') {
    return {
      ok: false,
      reason: 'disabled',
      message:
        'LLM parser is disabled (ENABLE_LLM_PARSER!=true). Set to "true" to allow calls.',
    };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      reason: 'missing_api_key',
      message: 'ANTHROPIC_API_KEY is not set — cannot call Claude.',
    };
  }
  return { ok: true };
}

/**
 * Parse an email through Claude Haiku 4.5. Never throws — all failure
 * modes return a `{ ok: false, reason, message }` result so the poller
 * can decide whether to DLQ, archive, or retry.
 */
export async function parseEmailWithLlm(
  input: LlmParseInput,
): Promise<LlmParseResult> {
  // --- Gate G5 ---
  const gate = checkLlmGate();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, message: gate.message };
  }

  // --- Budget check (§17) ---
  const budget = await checkBudget(input.userId);
  if (budget.status === 'capped') {
    logger.warn(
      {
        userId: input.userId,
        spentInr: budget.spent.toString(),
        capInr: budget.cap.toString(),
        sourceRef: input.sourceRef,
      },
      'llm.budget.capped — refusing call',
    );
    return {
      ok: false,
      reason: 'budget_capped',
      message: `Monthly LLM cap reached (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)})`,
      budget,
    };
  }

  // --- Redact PII before the body crosses the boundary (§15.9) ---
  const redacted = redactForLlm(input.emailBody);
  if (env.ANTHROPIC_ZERO_RETENTION_CONFIRMED !== 'true') {
    // §13 reminder — belt-and-braces warning so we can't forget to set
    // the Anthropic console toggle before running in prod.
    logger.warn(
      { userId: input.userId, sourceRef: input.sourceRef },
      'llm.zero_retention_unconfirmed — set ANTHROPIC_ZERO_RETENTION_CONFIRMED=true after enabling in Anthropic console',
    );
  }

  const model = env.LLM_MODEL;

  let apiResponse:
    | { inputTokens: number; outputTokens: number; toolInput: unknown | null; stopReason: string | null }
    | null = null;
  let apiError: Error | null = null;

  try {
    const client = getClient();
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: ANTHROPIC_TOOL_NAME,
          description: ANTHROPIC_TOOL_DESCRIPTION,
          // JSON Schema type from the SDK is narrower than ours (demands
          // type:'object'); our const carries that literal already. Cast
          // to the SDK's input_schema to satisfy the type checker.
          input_schema:
            ANTHROPIC_TOOL_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      // Force tool use — we don't want Haiku to reply in prose.
      tool_choice: { type: 'tool', name: ANTHROPIC_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: redacted.text,
        },
      ],
    });

    const toolBlock = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === ANTHROPIC_TOOL_NAME,
    );
    apiResponse = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      toolInput: toolBlock?.input ?? null,
      stopReason: res.stop_reason,
    };
  } catch (err) {
    apiError = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: apiError, userId: input.userId, sourceRef: input.sourceRef },
      'llm.api_error',
    );
  }

  // --- Ledger write (§8) — always, success or fail ---
  const usage: LlmUsage = apiResponse
    ? {
        inputTokens: apiResponse.inputTokens,
        outputTokens: apiResponse.outputTokens,
        costInr: await estimateCostInr({
          inputTokens: apiResponse.inputTokens,
          outputTokens: apiResponse.outputTokens,
        }),
      }
    : {
        inputTokens: 0,
        outputTokens: 0,
        costInr: new Decimal(0),
      };

  await recordSpend({
    userId: input.userId,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costInr: usage.costInr,
    purpose: input.purpose,
    sourceRef: input.sourceRef,
    success: apiError === null,
    errorMessage: apiError?.message,
  });

  if (apiError || !apiResponse) {
    return {
      ok: false,
      reason: 'api_error',
      message: apiError?.message ?? 'unknown Anthropic error',
      usage,
      budget,
    };
  }

  if (apiResponse.toolInput === null) {
    return {
      ok: false,
      reason: 'no_tool_use',
      message: `Model returned stop_reason="${apiResponse.stopReason}" without calling ${ANTHROPIC_TOOL_NAME}`,
      usage,
      budget,
    };
  }

  // --- Re-validate with Zod — the model can technically violate its
  // own tool schema (rare, but happens) and we'd rather fail here than
  // downstream in the projection step. ---
  const parsed = ParsedEventsSchema.safeParse(apiResponse.toolInput);
  if (!parsed.success) {
    logger.warn(
      {
        userId: input.userId,
        sourceRef: input.sourceRef,
        zodError: parsed.error.flatten(),
      },
      'llm.validation_error',
    );
    return {
      ok: false,
      reason: 'validation_error',
      message: `Tool output failed schema validation: ${parsed.error.message}`,
      usage,
      budget,
    };
  }

  const data: ParsedEvents = parsed.data;

  logger.info(
    {
      userId: input.userId,
      sourceRef: input.sourceRef,
      eventCount: data.events.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costInr: usage.costInr.toFixed(4),
      redaction: redacted.stats,
      budget: {
        spent: budget.spent.toString(),
        warn: budget.warn.toString(),
        cap: budget.cap.toString(),
        status: budget.status,
      },
    },
    'llm.parse.ok',
  );

  return {
    ok: true,
    events: data.events,
    isMarketing: data.is_marketing ?? false,
    usage,
    budget,
    redaction: redacted.stats,
  };
}

/**
 * Persist one LlmSpend row. Extracted so tests can observe the ledger
 * without having to run a real Anthropic call. The Prisma client is
 * user-scoped (RLS) so writes happen inside the caller's ambient
 * context if one is set.
 */
export async function recordSpend(opts: {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costInr: Decimal;
  purpose: string;
  sourceRef?: string;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.llmSpend.create({
      data: {
        userId: opts.userId,
        model: opts.model,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        costInr: opts.costInr.toFixed(4),
        purpose: opts.purpose,
        sourceRef: opts.sourceRef,
        success: opts.success,
        errorMessage: opts.errorMessage,
      },
    });
  } catch (err) {
    // Ledger write must not mask the original result — log and swallow.
    // A missed ledger row is less bad than a hidden parse result.
    logger.error(
      { err, userId: opts.userId, sourceRef: opts.sourceRef },
      'llm.spend.write_failed',
    );
  }
}

/** Exposed for tests — resets the cached client so an env change takes effect. */
export function __resetLlmClientForTests(): void {
  anthropicClient = null;
}
