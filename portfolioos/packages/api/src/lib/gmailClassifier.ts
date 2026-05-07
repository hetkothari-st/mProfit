import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from '@portfolioos/shared';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { redactForLlm } from '../ingestion/pii.js';
import { checkBudget, type BudgetStatus } from '../ingestion/llm/budget.js';
import { checkLlmGate, recordSpend } from '../ingestion/llm/client.js';

/**
 * Per-attachment financial-document classifier. Wraps Claude Haiku
 * in a tool-use call that emits a single classification verdict.
 *
 * Used by gmailScanWorker during the CLASSIFYING phase. Returns a
 * typed discriminated union — never throws on expected failure modes
 * (gate closed, budget capped, validation error). Real network errors
 * are caught and surfaced as `api_error`.
 */

const ClassificationSchema = z.object({
  is_financial: z.boolean(),
  doc_type: z.enum([
    'CONTRACT_NOTE',
    'CAS',
    'BANK_STATEMENT',
    'CC_STATEMENT',
    'FD_CERTIFICATE',
    'INSURANCE',
    'MF_STATEMENT',
    'SALARY_SLIP',
    'TAX_DOCUMENT',
    'OTHER',
    'NOT_FINANCIAL',
  ]),
  confidence: z.number().min(0).max(1),
  suggested_parser: z.string().nullable().optional(),
  reason: z.string(),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export interface ClassifyInput {
  userId: string;
  fileName: string;
  sender: string;
  subject: string;
  first4kbText: string;
}

export interface ClassifyUsage {
  inputTokens: number;
  outputTokens: number;
  costInr: string;
}

export type ClassifyResult =
  | { ok: true; classification: Classification; usage: ClassifyUsage; budget: BudgetStatus }
  | {
      ok: false;
      reason:
        | 'disabled'
        | 'missing_api_key'
        | 'budget_capped'
        | 'api_error'
        | 'no_tool_use'
        | 'validation_error';
      message: string;
    };

const SYSTEM_PROMPT = `You are a financial document classifier. Decide if the supplied file is a financial transaction document — contract notes, CAS statements, bank statements, credit-card statements, FD certificates, insurance premium receipts, mutual fund AMC statements, or salary slips with structured pay data — and NOT a marketing email, OTP confirmation, generic invoice, or newsletter.

Return your decision via the classify_attachment tool. confidence below 0.4 means "not sure" — set is_financial=false in that case.`;

const TOOL_NAME = 'classify_attachment';
const TOOL = {
  name: TOOL_NAME,
  description: 'Emit the classification verdict for a single email attachment.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['is_financial', 'doc_type', 'confidence', 'reason'],
    properties: {
      is_financial: { type: 'boolean' },
      doc_type: {
        type: 'string',
        enum: [
          'CONTRACT_NOTE',
          'CAS',
          'BANK_STATEMENT',
          'CC_STATEMENT',
          'FD_CERTIFICATE',
          'INSURANCE',
          'MF_STATEMENT',
          'SALARY_SLIP',
          'TAX_DOCUMENT',
          'OTHER',
          'NOT_FINANCIAL',
        ],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      suggested_parser: { type: ['string', 'null'] },
      reason: { type: 'string' },
    },
  },
};

// Anthropic Haiku 4.5 published pricing (Apr 2026): $0.80/MTok input,
// $4/MTok output. ₹/$ ≈ 83. Convert to INR per token.
const INR_PER_INPUT_TOKEN = new Decimal('0.80').dividedBy(1_000_000).times(83);
const INR_PER_OUTPUT_TOKEN = new Decimal('4').dividedBy(1_000_000).times(83);

export async function classifyAttachmentWithLlm(
  input: ClassifyInput,
): Promise<ClassifyResult> {
  const gate = checkLlmGate();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, message: gate.message };
  }
  const budget = await checkBudget(input.userId);
  if (budget.status === 'capped') {
    return {
      ok: false,
      reason: 'budget_capped',
      message: `Monthly LLM cap reached (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)})`,
    };
  }

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });

  const redacted = redactForLlm(input.first4kbText);
  const userPayload = `Filename: ${input.fileName}
From: ${input.sender}
Subject: ${input.subject}

--- First 4KB of extracted text (PII-redacted) ---
${redacted.text}`;

  let resp;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await anthropic.messages.create({
      model: env.LLM_MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      tools: [TOOL] as any,
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userPayload }],
    });
  } catch (err) {
    logger.warn({ err, fileName: input.fileName }, '[gmailClassifier] anthropic api error');
    await recordSpend({
      userId: input.userId,
      model: env.LLM_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costInr: new Decimal(0),
      purpose: 'gmail_classify',
      sourceRef: input.fileName,
      success: false,
      errorMessage: (err as Error).message,
    });
    return { ok: false, reason: 'api_error', message: (err as Error).message };
  }

  const block = resp.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    return { ok: false, reason: 'no_tool_use', message: 'Model did not call the classify tool' };
  }
  const parsed = ClassificationSchema.safeParse(block.input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation_error',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }

  const usageRaw = (resp as { usage?: { input_tokens?: number; output_tokens?: number } }).usage ?? {};
  const inputTokens = usageRaw.input_tokens ?? 0;
  const outputTokens = usageRaw.output_tokens ?? 0;
  const costInr = INR_PER_INPUT_TOKEN.times(inputTokens)
    .plus(INR_PER_OUTPUT_TOKEN.times(outputTokens));

  await recordSpend({
    userId: input.userId,
    model: env.LLM_MODEL,
    inputTokens,
    outputTokens,
    costInr,
    purpose: 'gmail_classify',
    sourceRef: input.fileName,
    success: true,
  });

  return {
    ok: true,
    classification: parsed.data,
    usage: { inputTokens, outputTokens, costInr: costInr.toFixed(4) },
    budget,
  };
}
