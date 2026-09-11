/**
 * AI Assistant — Anthropic client.
 *
 * One adviser turn: the client's facts, the library passages that fit the
 * question and the pre-computed PortfolioContext go into the user message;
 * the model streams its answer and may call read-only tools (advisorTools.ts)
 * for detail — at most `MAX_TOOL_ROUNDS` times, after which it must answer
 * with what it has.
 *
 * Cost is bounded on purpose: the static system prompt and tool list are
 * prompt-cached, the facts are cached per user (userFacts.ts), the tool
 * rounds are capped and `max_tokens` is modest. Spend is recorded in the
 * same LLM ledger the insights feature uses.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Decimal } from 'decimal.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recordSpend } from '../ingestion/llm/client.js';
import { AI_ASSISTANT_SYSTEM_PROMPT } from './systemPrompt.js';
import { ADVISOR_TOOLS, runAdvisorTool, type ToolOutcome } from './advisorTools.js';
import { knowledgeForPrompt, type KnowledgeHit } from './knowledge/search.js';
import type { AssistantContext } from './contextBuilder.js';
import type { AdvisorFacts } from '../services/advisor/types.js';

// Sonnet-class list prices. Cached input is billed at a tenth of the input
// rate on a read and 1.25x on the write that creates the cache entry.
const USD_PER_MTOK_INPUT = new Decimal('3.00');
const USD_PER_MTOK_OUTPUT = new Decimal('15.00');
const USD_PER_MTOK_CACHE_READ = USD_PER_MTOK_INPUT.times('0.1');
const USD_PER_MTOK_CACHE_WRITE = USD_PER_MTOK_INPUT.times('1.25');
const FX_USD_INR_DEFAULT = new Decimal('90');

const MAX_TOOL_ROUNDS = 3;
// A ceiling, not a spend: output is billed as used. Answers are kept short
// by the prompt; the headroom is so a tool round plus the answer never runs
// the budget dry and leaves the client with nothing.
const MAX_OUTPUT_TOKENS = 2048;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — AI assistant is disabled.');
  }
  anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

async function readFx(): Promise<Decimal> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.usd_inr_fx' } });
  if (!row) return FX_USD_INR_DEFAULT;
  const v = row.value;
  if (typeof v === 'number' || typeof v === 'string') return new Decimal(v);
  return FX_USD_INR_DEFAULT;
}

async function readAssistantModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.assistant_model' } });
  if (row && typeof row.value === 'string') return row.value;
  return env.LLM_ASSISTANT_MODEL;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

function estimateCostInr(u: TurnUsage, fx: Decimal): Decimal {
  const usd = USD_PER_MTOK_INPUT.mul(u.inputTokens)
    .plus(USD_PER_MTOK_OUTPUT.mul(u.outputTokens))
    .plus(USD_PER_MTOK_CACHE_READ.mul(u.cacheReadTokens))
    .plus(USD_PER_MTOK_CACHE_WRITE.mul(u.cacheWriteTokens))
    .dividedBy(1_000_000);
  return usd.mul(fx);
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * History the API will accept and the model can follow: empty turns dropped
 * (an earlier failed reply is saved empty), starting with the client, and
 * consecutive turns from the same side merged so roles alternate.
 */
export function sanitizeHistory(history: HistoryMessage[]): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of history) {
    const content = m.content.trim();
    if (!content) continue;
    if (out.length === 0 && m.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}

// ─── The tool loop ───────────────────────────────────────────────

interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface TurnStreamLike extends AsyncIterable<unknown> {
  finalMessage(): Promise<{ content: unknown[]; stop_reason: string | null; usage: RawUsage }>;
}

/** The slice of the Anthropic client a turn needs — a fake in tests. */
export interface TurnClient {
  messages: { stream(params: Anthropic.MessageStreamParams): TurnStreamLike };
}

export interface AdvisorTurnParams {
  client: TurnClient;
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  maxRounds: number;
  maxTokens?: number;
  execTool: (name: string, input: unknown) => Promise<ToolOutcome>;
}

export interface AdvisorTurnResult {
  fullText: string;
  toolsUsed: string[];
  usage: TurnUsage;
  /** Why the last call stopped — kept for the advice record and for logs. */
  stopReason: string | null;
}

/** What the client sees when a turn produced no text, instead of silence. */
function emptyTurnMessage(stopReason: string | null): string {
  if (stopReason === 'refusal') {
    return "I can't help with that one. Ask me about your plan, your goals or your portfolio instead.";
  }
  return "I couldn't finish that answer. Please ask again, or break it into a smaller question.";
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

function isToolUse(b: unknown): b is ToolUseBlock {
  return typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'tool_use';
}

function textDelta(event: unknown): string | null {
  const e = event as { type?: unknown; delta?: { type?: unknown; text?: unknown } };
  if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string') {
    return e.delta.text;
  }
  return null;
}

/**
 * Stream one adviser turn. Yields text as it arrives; when the model asks for
 * tools, runs them and continues. After `maxRounds` tool rounds the next call
 * forbids tools, so a turn always ends in an answer.
 */
export async function* runAdvisorTurn(p: AdvisorTurnParams): AsyncGenerator<string, AdvisorTurnResult> {
  const messages = [...p.messages];
  const toolsUsed = new Set<string>();
  const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let fullText = '';

  for (let round = 0; ; round++) {
    const capped = round >= p.maxRounds;
    const stream = p.client.messages.stream({
      model: p.model,
      max_tokens: p.maxTokens ?? MAX_OUTPUT_TOKENS,
      system: p.system,
      tools: p.tools,
      messages,
      // Explicitly off: the figures come from facts and tools, and thinking
      // tokens would eat the output budget and cost.
      thinking: { type: 'disabled' as const },
      ...(capped ? { tool_choice: { type: 'none' as const } } : {}),
    });

    // Text written before a tool call ("Let me check…") and the answer after
    // it are separate paragraphs, not one run-on line.
    let breakPending = fullText.length > 0;
    for await (const event of stream) {
      const text = textDelta(event);
      if (!text) continue;
      const chunk = breakPending ? `\n\n${text}` : text;
      breakPending = false;
      fullText += chunk;
      yield chunk;
    }

    const final = await stream.finalMessage();
    usage.inputTokens += final.usage.input_tokens ?? 0;
    usage.outputTokens += final.usage.output_tokens ?? 0;
    usage.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += final.usage.cache_creation_input_tokens ?? 0;

    const calls = final.content.filter(isToolUse);
    if (capped || final.stop_reason !== 'tool_use' || calls.length === 0) {
      if (!fullText.trim()) {
        logger.warn({ stopReason: final.stop_reason, round, usage }, '[ai.assistant] turn ended with no text');
        const fallback = emptyTurnMessage(final.stop_reason);
        fullText = fallback;
        yield fallback;
      }
      return { fullText, toolsUsed: [...toolsUsed], usage, stopReason: final.stop_reason };
    }

    messages.push({ role: 'assistant', content: final.content as Anthropic.ContentBlockParam[] });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      toolsUsed.add(call.name);
      const out = await p.execTool(call.name, call.input);
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(out.result),
        ...(out.ok ? {} : { is_error: true }),
      });
    }
    messages.push({ role: 'user', content: results });
  }
}

// ─── The assistant's turn, end to end ────────────────────────────

export interface AdvisorInputs {
  /** The client's facts block (userFacts.ts). */
  factsText: string;
  /** The advisor engine's facts, for tools; null if they couldn't be built. */
  facts: AdvisorFacts | null;
  financialYear: string;
  /** Library passages that fit the question. */
  knowledge: KnowledgeHit[];
}

/** The user message: facts, reading, pre-computed data, then the question. */
function buildUserTurn(userMessage: string, context: AssistantContext, advisor: AdvisorInputs): string {
  const parts = [`<user_facts>\n${advisor.factsText}\n</user_facts>`];
  const reading = knowledgeForPrompt(advisor.knowledge);
  if (reading) parts.push(`<library>\n${reading}\n</library>`);
  parts.push(
    `<portfolio_context>\n${JSON.stringify(context)}\n</portfolio_context>`,
    `<question>\n${userMessage.trim()}\n</question>`,
  );
  return parts.join('\n\n');
}

// Cached: the system prompt and tool list are identical on every turn, so
// only the first turn in a cache window pays full price for them. The
// breakpoint on the system block covers the tools too (tools come first).
const CACHED_SYSTEM: Anthropic.TextBlockParam[] = [
  { type: 'text', text: AI_ASSISTANT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
];

export interface StreamResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costInr: string;
  model: string;
  toolsUsed: string[];
  knowledgeIds: string[];
}

/**
 * Async generator that yields text chunks as the adviser streams them. The
 * `onDone` callback receives the finished text, usage, cost and what the
 * adviser relied on (tools, library passages), so the caller can persist
 * the advice record.
 */
export async function* streamAssistantResponse(
  userId: string,
  userMessage: string,
  context: AssistantContext,
  history: HistoryMessage[],
  advisor: AdvisorInputs,
  onDone?: (result: StreamResult) => Promise<void> | void,
): AsyncGenerator<string> {
  const client = getClient();
  const model = await readAssistantModel();
  const fx = await readFx();

  const messages: Anthropic.MessageParam[] = sanitizeHistory([
    ...history.slice(-10),
    { role: 'user', content: buildUserTurn(userMessage, context, advisor) },
  ]);

  const knowledgeIds = advisor.knowledge.map((h) => h.entry.id);
  const toolCtx = { userId, facts: advisor.facts, financialYear: advisor.financialYear };
  let usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  try {
    const turn = runAdvisorTurn({
      client: client as unknown as TurnClient,
      model,
      system: CACHED_SYSTEM,
      tools: ADVISOR_TOOLS,
      messages,
      maxRounds: MAX_TOOL_ROUNDS,
      execTool: (name, input) => runAdvisorTool(name, input, toolCtx),
    });
    let step = await turn.next();
    while (!step.done) {
      yield step.value;
      step = await turn.next();
    }
    const { fullText, toolsUsed } = step.value;
    usage = step.value.usage;

    const costInr = estimateCostInr(usage, fx);
    await recordSpend({
      userId,
      model,
      inputTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      costInr,
      purpose: 'ai_assistant',
      sourceRef: `assistant:${context.queryIntent}`,
      success: true,
    });
    if (onDone) {
      await onDone({
        fullText,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        costInr: costInr.toFixed(4),
        model,
        toolsUsed,
        knowledgeIds,
      });
    }
  } catch (err) {
    logger.error({ err, userId }, '[ai.assistant] stream failed');
    const message = err instanceof Error ? err.message : 'The AI assistant is temporarily unavailable.';
    // Emit a short fallback so the client still gets something readable.
    yield `\n\n_(The AI assistant hit an error: ${message})_`;
    await recordSpend({
      userId,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costInr: new Decimal(0),
      purpose: 'ai_assistant',
      sourceRef: `assistant:${context.queryIntent}`,
      success: false,
      errorMessage: message,
    }).catch((spendErr: unknown) => {
      logger.warn({ err: spendErr }, '[ai.assistant] could not record failed spend');
    });
  }
}

export interface ParsedCard {
  cardType: 'holding' | 'goal' | 'stat' | 'action';
  data: Record<string, unknown>;
}

/**
 * Extract the trailing \`\`\`json { ... } \`\`\` block emitted by the
 * assistant. Strips the block from the visible text and returns the
 * parsed card. If no block or parse fails, returns { cleanText, card: null }.
 */
export function parseResponseForCard(response: string): {
  cleanText: string;
  card: ParsedCard | null;
} {
  const match = response.match(/```json\s*([\s\S]+?)\s*```\s*$/);
  if (!match) return { cleanText: response.trim(), card: null };
  try {
    const parsed = JSON.parse(match[1]!) as ParsedCard;
    if (
      parsed &&
      typeof parsed === 'object' &&
      ['holding', 'goal', 'stat', 'action'].includes(String(parsed.cardType))
    ) {
      const cleanText = response.slice(0, match.index).trim();
      return { cleanText, card: parsed };
    }
  } catch (err) {
    logger.warn({ err }, '[ai.assistant] card parse failed');
  }
  return { cleanText: response.trim(), card: null };
}
