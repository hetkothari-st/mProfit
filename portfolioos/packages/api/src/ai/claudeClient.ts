/**
 * AI Assistant — Anthropic client (Claude Sonnet).
 *
 * Uses `@anthropic-ai/sdk` (already a dependency for analytics.insights).
 * The user message embeds the PortfolioContext as a JSON block so the
 * model reads fresh data on every turn. Streaming variant emits text
 * chunks via an async generator; the router converts those to SSE.
 *
 * Cost accounting: reuses `recordSpend` from the ingestion LLM ledger
 * so the AI assistant contributes to the same monthly LLM-cost view
 * the analytics insights already populate.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Decimal } from 'decimal.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recordSpend } from '../ingestion/llm/client.js';
import { AI_ASSISTANT_SYSTEM_PROMPT } from './systemPrompt.js';
import type { AssistantContext } from './contextBuilder.js';

const SONNET_USD_PER_MTOK_INPUT = new Decimal('3.00');
const SONNET_USD_PER_MTOK_OUTPUT = new Decimal('15.00');
const FX_USD_INR_DEFAULT = new Decimal('90');

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
  return env.LLM_INSIGHTS_MODEL;
}

function estimateCostInr(inputTokens: number, outputTokens: number, fx: Decimal): Decimal {
  const usd = SONNET_USD_PER_MTOK_INPUT.mul(inputTokens)
    .plus(SONNET_USD_PER_MTOK_OUTPUT.mul(outputTokens))
    .dividedBy(1_000_000);
  return usd.mul(fx);
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Wraps the pre-computed context so Claude sees it as part of the turn. */
function buildUserTurn(userMessage: string, context: AssistantContext): string {
  const contextBlock = JSON.stringify(context, null, 2);
  return `${userMessage.trim()}\n\nPortfolioContext (pre-computed, accurate — use these numbers directly, do not re-compute):\n\`\`\`json\n${contextBlock}\n\`\`\``;
}

interface StreamResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
  costInr: string;
  model: string;
}

/**
 * Async generator that yields text chunks as Claude streams them. The
 * `onDone` callback (if passed) receives the finalised usage + cost
 * once the stream ends, so the caller can record spend + persist the
 * response without holding a big buffer in memory during streaming.
 */
export async function* streamAssistantResponse(
  userId: string,
  userMessage: string,
  context: AssistantContext,
  history: HistoryMessage[],
  onDone?: (result: StreamResult) => Promise<void> | void,
): AsyncGenerator<string> {
  const client = getClient();
  const model = await readAssistantModel();
  const fx = await readFx();

  const messages: Anthropic.MessageParam[] = [];
  for (const m of history.slice(-10)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: buildUserTurn(userMessage, context) });

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 1024,
      system: AI_ASSISTANT_SYSTEM_PROMPT,
      messages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        fullText += chunk;
        yield chunk;
      } else if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      } else if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens ?? inputTokens;
      }
    }
    const costInr = estimateCostInr(inputTokens, outputTokens, fx);
    await recordSpend({
      userId,
      model,
      inputTokens,
      outputTokens,
      costInr,
      purpose: 'ai_assistant',
      sourceRef: `assistant:${context.queryIntent}`,
      success: true,
    });
    const result: StreamResult = {
      fullText,
      inputTokens,
      outputTokens,
      costInr: costInr.toFixed(4),
      model,
    };
    if (onDone) await onDone(result);
  } catch (err) {
    logger.error({ err, userId }, '[ai.assistant] stream failed');
    const message =
      err instanceof Error ? err.message : 'The AI assistant is temporarily unavailable.';
    // Emit a short fallback so the client still gets something readable.
    yield `\n\n_(The AI assistant hit an error: ${message})_`;
    await recordSpend({
      userId,
      model,
      inputTokens,
      outputTokens,
      costInr: new Decimal(0),
      purpose: 'ai_assistant',
      sourceRef: `assistant:${context.queryIntent}`,
      success: false,
      errorMessage: message,
    }).catch(() => undefined);
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
