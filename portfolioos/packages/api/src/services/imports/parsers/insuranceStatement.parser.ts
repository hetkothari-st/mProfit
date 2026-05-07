import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { readPdfText, isPdfPasswordError, getUserPdfPasswords } from '../../../lib/pdf.js';
import { checkLlmGate, recordSpend } from '../../../ingestion/llm/client.js';
import { checkBudget } from '../../../ingestion/llm/budget.js';
import { redactForLlm } from '../../../ingestion/pii.js';
import { Decimal } from '@portfolioos/shared';
import type { Parser, ParserContext, ParserResult } from './types.js';

const ADAPTER_ID = 'insurance.statement.pdf';
const ADAPTER_VER = '1';

const INR_PER_INPUT = new Decimal('0.80').div(1_000_000).times(83);
const INR_PER_OUTPUT = new Decimal('4').div(1_000_000).times(83);

const INSURANCE_KEYWORDS = [
  'POLICY NUMBER', 'SUM ASSURED', 'PREMIUM', 'INSURER', 'INSURANCE',
  'LIFE INSURANCE', 'HEALTH INSURANCE', 'MOTOR INSURANCE',
  'POLICY HOLDER', 'PREMIUM RECEIPT', 'PREMIUM NOTICE', 'RENEWAL',
  'MATURITY BENEFIT', 'DEATH BENEFIT', 'CLAIM', 'PREMIUM DUE',
];

const PremiumSchema = z.object({
  insurer: z.string(),
  policy_number: z.string().nullable().optional(),
  policy_type: z.string().nullable().optional(),
  policy_holder: z.string().nullable().optional(),
  premium_amount: z.string(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_from: z.string().nullable().optional(),
  period_to: z.string().nullable().optional(),
  sum_assured: z.string().nullable().optional(),
  next_due_date: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  premiums: z.array(PremiumSchema),
});

type ParsedPremium = z.infer<typeof PremiumSchema>;

const TOOL_NAME = 'extract_insurance_premiums';
const TOOL = {
  name: TOOL_NAME,
  description: 'Extract premium payment details from an insurance policy document.',
  input_schema: {
    type: 'object' as const,
    required: ['premiums'],
    additionalProperties: false,
    properties: {
      premiums: {
        type: 'array',
        items: {
          type: 'object',
          required: ['insurer', 'premium_amount', 'payment_date'],
          additionalProperties: false,
          properties: {
            insurer: { type: 'string', description: 'Insurance company name' },
            policy_number: { type: ['string', 'null'] },
            policy_type: { type: ['string', 'null'], description: 'TERM | WHOLE_LIFE | ULIP | ENDOWMENT | HEALTH | MOTOR | HOME | TRAVEL | OTHER' },
            policy_holder: { type: ['string', 'null'] },
            premium_amount: { type: 'string', description: 'Premium paid, positive decimal string without ₹ or commas' },
            payment_date: { type: 'string', description: 'YYYY-MM-DD date when premium was paid or document date' },
            period_from: { type: ['string', 'null'], description: 'YYYY-MM-DD coverage period start' },
            period_to: { type: ['string', 'null'], description: 'YYYY-MM-DD coverage period end' },
            sum_assured: { type: ['string', 'null'], description: 'Sum assured / coverage amount' },
            next_due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD next premium due date' },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are an insurance document parser for Indian insurance policies.
Extract every premium payment from the document.

Rules:
- Dates: YYYY-MM-DD. Convert any Indian format.
- Amounts: positive decimal string, no ₹ or commas.
- If the document is a premium receipt/notice extract the paid premium amount and date.
- If the document is a policy schedule, extract the annual/periodic premium amount.
- Return ONLY the tool call.`;

export const insuranceStatementParser: Parser = {
  name: 'insurance-statement',

  canHandle(_ctx, sample) {
    const text = typeof sample === 'string' ? sample.toUpperCase() : '';
    if (!text) return false;
    const hits = INSURANCE_KEYWORDS.filter((k) => text.includes(k)).length;
    // Need at least 3 keywords to be confident this is an insurance doc
    if (hits < 3) return false;
    // Must not look like a bank statement
    if (text.includes('ACCOUNT STATEMENT') || text.includes('BANK STATEMENT')) return false;
    return true;
  },

  async parse(ctx: ParserContext): Promise<ParserResult> {
    const passwords = await getUserPdfPasswords(ctx.userId);
    let pdfText: string;
    try {
      const r = await readPdfText(ctx.filePath, passwords);
      pdfText = r.text;
    } catch (err) {
      if (isPdfPasswordError(err)) {
        return {
          adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [],
          warnings: ['Insurance PDF is password-protected. Enter the password to unlock.'],
        };
      }
      throw err;
    }

    if (!pdfText.trim()) {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['Insurance PDF has no extractable text.'] };
    }

    const gate = checkLlmGate();
    if (!gate.ok) {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`LLM unavailable: ${gate.message}`] };
    }

    const budget = await checkBudget(ctx.userId);
    if (budget.status === 'capped') {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['Monthly LLM cap reached.'] };
    }

    const redacted = redactForLlm(pdfText.slice(0, 6000));
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    let resp;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resp = await anthropic.messages.create({
        model: env.LLM_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [TOOL] as any,
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: redacted.text }],
      });
    } catch (err) {
      logger.warn({ err, fileName: ctx.fileName }, '[insuranceStatement] anthropic error');
      await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: 0, outputTokens: 0, costInr: new Decimal(0), purpose: 'insurance_parse', sourceRef: ctx.fileName, success: false, errorMessage: (err as Error).message });
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`LLM call failed: ${(err as Error).message}`] };
    }

    const inTok = resp.usage?.input_tokens ?? 0;
    const outTok = resp.usage?.output_tokens ?? 0;
    const costInr = INR_PER_INPUT.times(inTok).plus(INR_PER_OUTPUT.times(outTok));
    await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: inTok, outputTokens: outTok, costInr, purpose: 'insurance_parse', sourceRef: ctx.fileName, success: true });

    const block = resp.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['LLM did not return structured data.'] };
    }

    const parsed = ResponseSchema.safeParse(block.input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error, fileName: ctx.fileName }, '[insuranceStatement] schema validation failed');
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`Schema validation failed: ${parsed.error.message}`] };
    }

    const transactions = parsed.data.premiums.map((p: ParsedPremium) => {
      const policyRef = p.policy_number ? ` #${p.policy_number}` : '';
      const assetName = `${p.insurer}${policyRef}`;
      const narrationParts: string[] = [];
      if (p.policy_type) narrationParts.push(p.policy_type);
      if (p.period_from && p.period_to) narrationParts.push(`Coverage: ${p.period_from} to ${p.period_to}`);
      if (p.sum_assured) narrationParts.push(`SA: ₹${p.sum_assured}`);

      return {
        assetClass: 'INSURANCE' as const,
        transactionType: 'DEPOSIT' as const,
        assetName,
        tradeDate: p.payment_date,
        quantity: p.premium_amount,
        price: '1',
        orderNo: p.policy_number ?? undefined,
        narration: narrationParts.join(' | ') || 'Premium payment',
        broker: p.insurer,
      };
    });

    logger.info({ fileName: ctx.fileName, count: transactions.length }, '[insuranceStatement] parsed');
    return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions, warnings: [] };
  },
};
