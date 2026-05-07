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

const ADAPTER_ID = 'fd.certificate.pdf';
const ADAPTER_VER = '1';

const INR_PER_INPUT = new Decimal('0.80').div(1_000_000).times(83);
const INR_PER_OUTPUT = new Decimal('4').div(1_000_000).times(83);

const FD_KEYWORDS = [
  'FIXED DEPOSIT', 'FD ADVICE', 'FD RECEIPT', 'DEPOSIT RECEIPT',
  'TERM DEPOSIT', 'TIME DEPOSIT', 'FD CONFIRMATION',
  'MATURITY DATE', 'MATURITY AMOUNT', 'DEPOSIT DATE',
  'INTEREST RATE', 'PRINCIPAL AMOUNT',
];

const FdSchema = z.object({
  bank_name: z.string().nullable().optional(),
  fd_number: z.string().nullable().optional(),
  principal_amount: z.string(),
  interest_rate: z.string().nullable().optional(),
  interest_frequency: z.string().nullable().optional(),
  deposit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maturity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  maturity_amount: z.string().nullable().optional(),
  fd_type: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  fixed_deposits: z.array(FdSchema),
});

type ParsedFd = z.infer<typeof FdSchema>;

const TOOL_NAME = 'extract_fixed_deposits';
const TOOL = {
  name: TOOL_NAME,
  description: 'Extract fixed deposit details from an FD certificate or advice document.',
  input_schema: {
    type: 'object' as const,
    required: ['fixed_deposits'],
    additionalProperties: false,
    properties: {
      fixed_deposits: {
        type: 'array',
        items: {
          type: 'object',
          required: ['principal_amount', 'deposit_date'],
          additionalProperties: false,
          properties: {
            bank_name: { type: ['string', 'null'] },
            fd_number: { type: ['string', 'null'], description: 'FD/receipt/certificate number' },
            principal_amount: { type: 'string', description: 'Principal invested, decimal string without ₹ or commas' },
            interest_rate: { type: ['string', 'null'], description: 'Annual rate as decimal string e.g. "7.10"' },
            interest_frequency: { type: ['string', 'null'], description: 'MONTHLY | QUARTERLY | HALF_YEARLY | ANNUAL | CUMULATIVE' },
            deposit_date: { type: 'string', description: 'YYYY-MM-DD opening date' },
            maturity_date: { type: ['string', 'null'], description: 'YYYY-MM-DD maturity date' },
            maturity_amount: { type: ['string', 'null'], description: 'Maturity/redemption amount if stated' },
            fd_type: { type: ['string', 'null'], description: 'CUMULATIVE | NON_CUMULATIVE | FLEXI etc.' },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a fixed deposit certificate parser for an Indian bank.
Extract every FD detail from the document.

Rules:
- Dates: convert any format to YYYY-MM-DD.
- Amounts: positive decimal string, no ₹ symbol, no commas ("1,00,000" → "100000").
- interest_rate: decimal percentage WITHOUT the % sign (e.g. "7.10" not "7.10%").
- interest_frequency: normalize to MONTHLY | QUARTERLY | HALF_YEARLY | ANNUAL | CUMULATIVE.
- If multiple FDs in one document, return all of them.
- Return ONLY the tool call.`;

export const fdCertificateParser: Parser = {
  name: 'fd-certificate',

  canHandle(_ctx, sample) {
    const text = typeof sample === 'string' ? sample.toUpperCase() : '';
    if (!text) return false;
    const hits = FD_KEYWORDS.filter((k) => text.includes(k)).length;
    return hits >= 2;
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
          warnings: ['FD certificate PDF is password-protected. Enter the password to unlock.'],
        };
      }
      throw err;
    }

    if (!pdfText.trim()) {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['FD PDF has no extractable text.'] };
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
      logger.warn({ err, fileName: ctx.fileName }, '[fdCertificate] anthropic error');
      await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: 0, outputTokens: 0, costInr: new Decimal(0), purpose: 'fd_certificate_parse', sourceRef: ctx.fileName, success: false, errorMessage: (err as Error).message });
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`LLM call failed: ${(err as Error).message}`] };
    }

    const inTok = resp.usage?.input_tokens ?? 0;
    const outTok = resp.usage?.output_tokens ?? 0;
    const costInr = INR_PER_INPUT.times(inTok).plus(INR_PER_OUTPUT.times(outTok));
    await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: inTok, outputTokens: outTok, costInr, purpose: 'fd_certificate_parse', sourceRef: ctx.fileName, success: true });

    const block = resp.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['LLM did not return structured data.'] };
    }

    const parsed = ResponseSchema.safeParse(block.input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error, fileName: ctx.fileName }, '[fdCertificate] schema validation failed');
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`Schema validation failed: ${parsed.error.message}`] };
    }

    const transactions = parsed.data.fixed_deposits.map((fd: ParsedFd) => {
      const bankName = fd.bank_name ?? 'Bank';
      const rateStr = fd.interest_rate ? ` ${fd.interest_rate}%` : '';
      const label = fd.fd_number ? `FD #${fd.fd_number}` : 'Fixed Deposit';
      const assetName = `${bankName} ${label}${rateStr}`;

      return {
        assetClass: 'FIXED_DEPOSIT' as const,
        transactionType: 'DEPOSIT' as const,
        assetName,
        tradeDate: fd.deposit_date,
        quantity: fd.principal_amount,
        price: '1',
        maturityDate: fd.maturity_date ?? undefined,
        interestRate: fd.interest_rate ?? undefined,
        interestFrequency: fd.interest_frequency ?? undefined,
        orderNo: fd.fd_number ?? undefined,
        narration: fd.fd_type ? `FD Type: ${fd.fd_type}` : undefined,
      };
    });

    logger.info({ fileName: ctx.fileName, count: transactions.length }, '[fdCertificate] parsed');
    return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions, warnings: [] };
  },
};
