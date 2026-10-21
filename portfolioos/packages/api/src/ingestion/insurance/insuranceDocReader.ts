/**
 * Read an insurance document — policy document, premium receipt, renewal
 * notice or claim letter — into structured fields.
 *
 * A language model does the reading (insurers have no common format), and
 * nothing it returns is trusted on its own: every amount, date, the policy
 * number and the holder's name must appear in the document text
 * (ingestion/verify/sourceVerification). Fields that do not are reported as
 * problems, and a document with problems goes to the user for review
 * instead of updating their policies.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from '@everypaisa/shared';
import { ANTHROPIC_CLIENT_OPTIONS } from '../../lib/anthropicOptions.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { checkLlmGate, recordSpend, warnIfZeroRetentionUnconfirmed } from '../llm/client.js';
import { checkBudget } from '../llm/budget.js';
import { redactForLlm } from '../pii.js';
import { figureAppears, indexSource, verifyFigures, type SourceIndex } from '../verify/sourceVerification.js';

export const INSURANCE_DOC_KINDS = ['POLICY_DOCUMENT', 'PREMIUM_RECEIPT', 'RENEWAL_NOTICE', 'CLAIM_LETTER', 'OTHER'] as const;
const POLICY_TYPES = ['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT', 'HEALTH', 'MOTOR', 'HOME', 'TRAVEL', 'PERSONAL_ACCIDENT', 'OTHER'] as const;
const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'SINGLE'] as const;
const CLAIM_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED'] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const money = z.string().regex(/^\d+(\.\d+)?$/).nullable();

export const InsuranceDocExtractSchema = z.object({
  doc_kind: z.enum(INSURANCE_DOC_KINDS),
  insurer: z.string().nullable(),
  policy_number: z.string().nullable(),
  policy_type: z.enum(POLICY_TYPES).nullable(),
  plan_name: z.string().nullable(),
  policy_holder: z.string().nullable(),
  insured_members: z.array(z.object({ name: z.string(), relation: z.string().nullable() })),
  nominees: z.array(z.object({ name: z.string(), relation: z.string().nullable() })),
  sum_assured: money,
  premium_amount: money,
  premium_frequency: z.enum(FREQUENCIES).nullable(),
  start_date: date,
  end_date: date,
  next_premium_due: date,
  premium_paid_amount: money,
  premium_paid_on: date,
  period_from: date,
  period_to: date,
  vehicle_registration: z.string().nullable(),
  claim: z
    .object({
      claim_number: z.string().nullable(),
      claim_date: date,
      claim_type: z.string().nullable(),
      claimed_amount: money,
      settled_amount: money,
      status: z.enum(CLAIM_STATUSES).nullable(),
      settled_on: date,
      rejection_reason: z.string().nullable(),
    })
    .nullable(),
});
export type InsuranceDocExtract = z.infer<typeof InsuranceDocExtractSchema>;

const nullable = (type: string, description?: string) => ({ type: [type, 'null'], ...(description ? { description } : {}) });
const MONEY = 'Positive decimal string, no ₹ symbol or commas ("1,23,456.00" → "123456.00").';
const DATE = 'YYYY-MM-DD. Convert any Indian date format.';

const TOOL_NAME = 'record_insurance_document';
const TOOL = {
  name: TOOL_NAME,
  description: 'Record the details of one insurance document.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: Object.keys(InsuranceDocExtractSchema.shape),
    properties: {
      doc_kind: { type: 'string', enum: INSURANCE_DOC_KINDS },
      insurer: nullable('string', 'Insurance company name'),
      policy_number: nullable('string', 'Exactly as printed'),
      policy_type: { type: ['string', 'null'], enum: [...POLICY_TYPES, null] },
      plan_name: nullable('string'),
      policy_holder: nullable('string', 'Proposer / policy owner, exactly as printed'),
      insured_members: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['name', 'relation'], properties: { name: { type: 'string' }, relation: nullable('string') } },
      },
      nominees: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['name', 'relation'], properties: { name: { type: 'string' }, relation: nullable('string') } },
      },
      sum_assured: nullable('string', MONEY),
      premium_amount: nullable('string', `Premium per instalment. ${MONEY}`),
      premium_frequency: { type: ['string', 'null'], enum: [...FREQUENCIES, null] },
      start_date: nullable('string', DATE),
      end_date: nullable('string', `Maturity or policy expiry. ${DATE}`),
      next_premium_due: nullable('string', DATE),
      premium_paid_amount: nullable('string', `On a receipt: the amount paid. ${MONEY}`),
      premium_paid_on: nullable('string', DATE),
      period_from: nullable('string', `Period the payment or cover is for. ${DATE}`),
      period_to: nullable('string', DATE),
      vehicle_registration: nullable('string', 'Motor policies only'),
      claim: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['claim_number', 'claim_date', 'claim_type', 'claimed_amount', 'settled_amount', 'status', 'settled_on', 'rejection_reason'],
        properties: {
          claim_number: nullable('string'),
          claim_date: nullable('string', DATE),
          claim_type: nullable('string'),
          claimed_amount: nullable('string', MONEY),
          settled_amount: nullable('string', MONEY),
          status: { type: ['string', 'null'], enum: [...CLAIM_STATUSES, null] },
          settled_on: nullable('string', DATE),
          rejection_reason: nullable('string'),
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You read Indian insurance documents: policy documents/schedules, premium receipts, renewal notices and claim letters.
Rules:
- Record only what the document states. If a field is not in the document, set it null (or an empty list). Never estimate or infer a figure.
- Copy the policy number and names exactly as printed.
- Amounts: positive decimal strings, no ₹ or commas. Dates: YYYY-MM-DD.
- doc_kind: POLICY_DOCUMENT for a policy schedule/bond/certificate, PREMIUM_RECEIPT for proof of a payment, RENEWAL_NOTICE for a premium-due or renewal reminder, CLAIM_LETTER for any claim intimation/approval/settlement/rejection, OTHER otherwise.
- claim: only for claim letters; null otherwise.
Return only the tool call.`;

const INR_PER_INPUT = new Decimal('0.80').div(1_000_000).times(83);
const INR_PER_OUTPUT = new Decimal('4').div(1_000_000).times(83);
const MAX_CHARS = 12_000;

export type CallModel = (text: string) => Promise<{ input: unknown; inputTokens: number; outputTokens: number }>;

async function callAnthropic(text: string) {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, ...ANTHROPIC_CLIENT_OPTIONS });
  const resp = await anthropic.messages.create({
    model: env.LLM_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [TOOL] as unknown as Anthropic.Messages.Tool[],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: text }],
  });
  const block = resp.content.find((b) => b.type === 'tool_use');
  return {
    input: block && block.type === 'tool_use' ? block.input : null,
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
  };
}

/** Squash spacing and case so "ABC/123 456" in a PDF matches "abc/123456". */
function compact(s: string): string {
  return s.toUpperCase().replace(/[\s\-–]/g, '');
}

function nameAppears(name: string, src: SourceIndex): boolean {
  const tokens = name.toUpperCase().split(/[^A-Z]+/).filter((t) => t.length > 1);
  return tokens.length > 0 && tokens.every((t) => src.upper.includes(t));
}

/** Every field of the extract that is not in the document. */
export function verifyInsuranceExtract(x: InsuranceDocExtract, text: string): string[] {
  const src = indexSource(text);
  const problems: string[] = [];
  const compactText = compact(text);

  if (x.policy_number && !compactText.includes(compact(x.policy_number))) {
    // Problems are stored in plain text: name the number by its last 4 only.
    problems.push(`policy number ending ${compact(x.policy_number).slice(-4)} does not appear in the document`);
  }
  if (x.policy_holder && !nameAppears(x.policy_holder, src)) {
    problems.push(`policy holder "${x.policy_holder}" does not appear in the document`);
  }
  for (const [label, v] of [
    ['sum assured', x.sum_assured],
    ['premium', x.premium_amount],
    ['premium paid', x.premium_paid_amount],
    ['claimed amount', x.claim?.claimed_amount],
    ['settled amount', x.claim?.settled_amount],
  ] as const) {
    if (v && !figureAppears(v, src)) problems.push(`${label} ${v} does not appear in the document`);
  }
  for (const [label, d] of [
    ['start date', x.start_date],
    ['end date', x.end_date],
    ['next premium due', x.next_premium_due],
    ['premium paid on', x.premium_paid_on],
    ['period from', x.period_from],
    ['period to', x.period_to],
    ['claim date', x.claim?.claim_date],
    ['settled on', x.claim?.settled_on],
  ] as const) {
    if (d) problems.push(...verifyFigures({ date: d }, src).map((p) => p.replace(/^date/, label)));
  }
  return problems;
}

export type ReadResult =
  | { ok: true; extract: InsuranceDocExtract; problems: string[] }
  | { ok: false; reason: 'llm_unavailable' | 'over_budget' | 'no_text' | 'model_error' | 'invalid_output'; message: string };

export async function readInsuranceDocument(
  text: string,
  ctx: { userId: string; sourceRef: string },
  deps: { callModel?: CallModel } = {},
): Promise<ReadResult> {
  if (!text.trim()) return { ok: false, reason: 'no_text', message: 'The PDF has no readable text.' };
  if (!deps.callModel) {
    const gate = checkLlmGate();
    if (!gate.ok) return { ok: false, reason: 'llm_unavailable', message: gate.message };
    const budget = await checkBudget(ctx.userId);
    if (budget.status === 'capped') return { ok: false, reason: 'over_budget', message: 'Monthly reading budget reached.' };
    warnIfZeroRetentionUnconfirmed('insurance.document');
  }

  const redacted = redactForLlm(text.slice(0, MAX_CHARS)).text;
  let out: Awaited<ReturnType<CallModel>>;
  try {
    out = await (deps.callModel ?? callAnthropic)(redacted);
  } catch (err) {
    logger.warn({ err, sourceRef: ctx.sourceRef }, '[insuranceDoc] model call failed');
    if (!deps.callModel) {
      await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: 0, outputTokens: 0, costInr: new Decimal(0), purpose: 'insurance_document', sourceRef: ctx.sourceRef, success: false, errorMessage: (err as Error).message });
    }
    return { ok: false, reason: 'model_error', message: (err as Error).message };
  }
  if (!deps.callModel) {
    const costInr = INR_PER_INPUT.times(out.inputTokens).plus(INR_PER_OUTPUT.times(out.outputTokens));
    await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costInr, purpose: 'insurance_document', sourceRef: ctx.sourceRef, success: true });
  }

  const parsed = InsuranceDocExtractSchema.safeParse(out.input);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_output', message: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  // Verified against the ORIGINAL text, not the redacted copy the model saw:
  // anything it returned must be in the real document.
  return { ok: true, extract: parsed.data, problems: verifyInsuranceExtract(parsed.data, text) };
}
