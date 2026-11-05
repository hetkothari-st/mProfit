import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { BASKET_CATEGORIES, type SpendCategory } from '@everypaisa/shared';
import { env } from '../../config/env.js';
import { ANTHROPIC_CLIENT_OPTIONS } from '../../lib/anthropicOptions.js';
import { logger } from '../../lib/logger.js';
import { checkLlmGate, recordSpend, warnIfZeroRetentionUnconfirmed } from '../../ingestion/llm/client.js';
import { checkBudget, estimateCostInr } from '../../ingestion/llm/budget.js';
import { redactForLlm } from '../../ingestion/pii.js';

/**
 * AI fallback for payees no rule or merchant entry recognises (spec §5 step 4).
 *
 * Only payee names are sent: no amounts, dates, account numbers or the user's
 * identity, and each name goes through the same PII redaction as email
 * parsing. One call covers up to MAX_PAYEES payees. It is skipped when AI is
 * off, the key is missing or the user's monthly AI budget is spent, and the
 * user is asked to tag those payees instead. Answers are stored per payee
 * (SpendPayeeTag, source "model"), so each payee is asked about once.
 */

export interface PayeeToTag {
  key: string;
  /** A display form of the payee, e.g. "SHARMA GENERAL STORE". */
  label: string;
}

export type PayeeTagger = (userId: string, payees: readonly PayeeToTag[]) => Promise<Map<string, SpendCategory>>;

export const MAX_PAYEES = 40;

const ALLOWED = [...BASKET_CATEGORIES, 'investment', 'loan_emi', 'tax', 'insurance_premium_life', 'credit_card_bill', 'uncategorised'] as const;

const ResponseSchema = z.object({
  tags: z.array(z.object({ id: z.number().int(), category: z.enum(ALLOWED) })),
});

const TOOL_NAME = 'tag_payees';
const TOOL = {
  name: TOOL_NAME,
  description: 'Give each payee the spending category it most likely belongs to.',
  input_schema: {
    type: 'object' as const,
    required: ['tags'],
    additionalProperties: false,
    properties: {
      tags: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'category'],
          additionalProperties: false,
          properties: {
            id: { type: 'integer' },
            category: { type: 'string', enum: [...ALLOWED] },
          },
        },
      },
    },
  },
};

const SYSTEM = `You sort payees from Indian bank and UPI statements into spending categories.
Each line is "<id>: <payee name as it appears on the statement>".
Rules:
- Use only the given categories. Answer "uncategorised" when the name alone does not tell you (for example a person's name, a generic shop name, or a payment app).
- groceries = supermarkets, kirana, vegetables, milk; dining_out = restaurants, food delivery; fuel_transport = fuel, cabs, trains, tolls; utilities = electricity, gas, water, property tax; household = furniture, appliances, home goods; domestic_help = maids, cooks, drivers, home services; lifestyle = entertainment, subscriptions, travel, hobbies, gyms.
- Never guess from the length or spelling of a person's name.
Return one tag per id.`;

export const aiPayeeTagger: PayeeTagger = async (userId, payees) => {
  const out = new Map<string, SpendCategory>();
  const batch = payees.slice(0, MAX_PAYEES);
  if (batch.length === 0) return out;
  if (!checkLlmGate().ok) return out;
  const budget = await checkBudget(userId);
  if (budget.status === 'capped') return out;

  const lines = batch.map((p, i) => `${i}: ${redactForLlm(p.label).text.slice(0, 80)}`).join('\n');
  warnIfZeroRetentionUnconfirmed('spending.payee_tags');
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, ...ANTHROPIC_CLIENT_OPTIONS });
  let resp;
  try {
    resp = await anthropic.messages.create({
      model: env.LLM_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      // The SDK's tool type does not accept our literal JSON schema shape directly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [TOOL] as any,
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: lines }],
    });
  } catch (err) {
    logger.warn({ err, userId }, '[spending] payee tagging call failed');
    await recordSpend({
      userId, model: env.LLM_MODEL, inputTokens: 0, outputTokens: 0, costInr: new Decimal(0),
      purpose: 'spending_payee_tags', success: false, errorMessage: (err as Error).message,
    });
    return out;
  }

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;
  await recordSpend({
    userId, model: env.LLM_MODEL, inputTokens, outputTokens,
    costInr: await estimateCostInr({ inputTokens, outputTokens }), purpose: 'spending_payee_tags', success: true,
  });

  const block = resp.content.find((b) => b.type === 'tool_use');
  const parsed = block && block.type === 'tool_use' ? ResponseSchema.safeParse(block.input) : null;
  if (!parsed?.success) {
    logger.warn({ userId }, '[spending] payee tagging returned no usable tags');
    return out;
  }
  for (const t of parsed.data.tags) {
    const p = batch[t.id];
    if (p) out.set(p.key, t.category);
  }
  return out;
};
