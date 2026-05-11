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

/**
 * System prompt is inlined here so the compiled `dist/` bundle has no
 * runtime dependency on a sibling `.txt` asset (tsc doesn't copy
 * non-TS files into dist, which broke `analytics.insights.ts` on
 * Railway — same fix applied here defensively). Changing the prompt is
 * a deliberate release action, not a runtime config knob.
 */
const SYSTEM_PROMPT = `You are a financial document parser for an Indian personal finance app. Extract structured transaction data from the document below. The input may be an email body OR text extracted from a broker contract-note PDF — treat both the same way.

Rules:
- Return VALID JSON matching the provided schema. No preamble, no markdown, no explanation outside JSON.
- Dates: ISO 8601 (YYYY-MM-DD). Convert any Indian format to this.
- Amounts: positive decimal string, no ₹ symbol, no commas. "1,23,456.78" -> "123456.78".
- If the document is promotional/marketing and contains no financial event, return event_type "OTHER" with confidence < 0.3.
- If multiple events are in one document (e.g. a contract note or statement listing 10 transactions), return the \`events\` array with one entry per event.
- Never invent data. If a field is not present in the document, set it null.
- confidence: 0.0 to 1.0. How certain you are this is a real financial event with the claimed type and amount.

Indian broker contract notes — equity equity (BUY / SELL):
- One event per traded row. ISIN goes in instrument_isin (format INE/INF + 9 alphanumerics). Symbol in instrument_symbol. Stock name in instrument_name.
- price = per-share trade rate. quantity = shares traded. amount = net amount for that row if listed; else null.
- Charges (brokerage, STT, GST) are NOT individual events — only emit one event per actual trade row.

F&O (Futures & Options) — when the email is a contract note or trade confirmation for a derivative:
- event_type = FNO_TRADE (do NOT use BUY/SELL for derivatives — those are equity-only)
- fno_side = "BUY" or "SELL" (the side of the trade, not the option type)
- fno_underlying = bare underlying ticker, e.g. "NIFTY", "RELIANCE", "BANKNIFTY"
- fno_instrument_type = "FUTURES" | "CALL" | "PUT"
- fno_strike_price = decimal string (null for futures)
- fno_expiry_date = YYYY-MM-DD
- fno_lot_size = integer (units per contract; e.g. NIFTY = 25 in 2026)
- fno_quantity_contracts = number of CONTRACTS, not lot-units. 1 NIFTY lot = qty="1".
- fno_trading_symbol = exchange tradingsymbol if present (e.g. "NIFTY26NOV24500CE")
- amount = net trade value (qty_contracts * lot_size * price). Positive even for sells; the side flag conveys direction.
- price = per-unit premium (option) or per-unit futures price.
- quantity = total units traded (qty_contracts * lot_size).
- For multiple-trade contract notes, emit one FNO_TRADE event per row.
`;

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
  // In development the gate is open as long as an API key is present, so
  // developers don't need to set ENABLE_LLM_PARSER=true manually. In
  // production BOTH flags are required (belt-and-suspenders per §16 G5).
  const gateOpen =
    env.ENABLE_LLM_PARSER === 'true' || env.NODE_ENV !== 'production';
  if (!gateOpen) {
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
