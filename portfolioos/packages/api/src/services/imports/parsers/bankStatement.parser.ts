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

const ADAPTER_ID = 'bank.statement.pdf';
const ADAPTER_VER = '1';

// INR cost per token for Haiku 4.5
const INR_PER_INPUT = new Decimal('0.80').div(1_000_000).times(83);
const INR_PER_OUTPUT = new Decimal('4').div(1_000_000).times(83);

const BANK_KEYWORDS = [
  'ACCOUNT STATEMENT', 'BANK STATEMENT', 'TRANSACTION DETAILS', 'PASSBOOK',
  'OPENING BALANCE', 'CLOSING BALANCE', 'STATEMENT OF ACCOUNT',
  'CREDIT', 'DEBIT', 'BALANCE', 'NEFT', 'IMPS', 'RTGS', 'UPI',
];

const KNOWN_BANKS = [
  'HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'INDUSIND', 'YES BANK',
  'PNB', 'CANARA', 'BANK OF BARODA', 'UNION BANK', 'IDFC', 'RBL',
  'FEDERAL', 'SOUTH INDIAN', 'KARNATAKA', 'DCB', 'BANDHAN',
];

const RowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  credit_amount: z.string().nullable().optional(),
  debit_amount: z.string().nullable().optional(),
  transaction_ref: z.string().nullable().optional(),
  transaction_type: z.enum(['CREDIT', 'DEBIT']),
});

const ResponseSchema = z.object({
  bank_name: z.string().nullable().optional(),
  account_last4: z.string().nullable().optional(),
  transactions: z.array(RowSchema),
});

type ParsedBankRow = z.infer<typeof RowSchema>;

const TOOL_NAME = 'extract_bank_transactions';
const TOOL = {
  name: TOOL_NAME,
  description: 'Extract all transactions from a bank account statement.',
  input_schema: {
    type: 'object' as const,
    required: ['transactions'],
    additionalProperties: false,
    properties: {
      bank_name: { type: 'string', description: 'Bank name (e.g. HDFC Bank, SBI)' },
      account_last4: { type: 'string', description: 'Last 4 digits of account number' },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['date', 'description', 'transaction_type'],
          additionalProperties: false,
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            description: { type: 'string' },
            credit_amount: { type: ['string', 'null'], description: 'Amount credited, positive decimal string, no ₹ or commas' },
            debit_amount: { type: ['string', 'null'], description: 'Amount debited, positive decimal string, no ₹ or commas' },
            transaction_ref: { type: ['string', 'null'], description: 'UTR/reference number if present' },
            transaction_type: { type: 'string', enum: ['CREDIT', 'DEBIT'] },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a bank statement parser for an Indian bank account statement.
Extract every transaction row — credits (money received) and debits (money spent).

Rules:
- Dates: convert any format to YYYY-MM-DD (e.g. "01/01/2024" → "2024-01-01").
- Amounts: positive decimal strings without ₹ or commas (e.g. "1,23,456.78" → "123456.78").
- credit_amount: set for CREDIT rows (salary, transfers in, interest).
- debit_amount: set for DEBIT rows (expenses, transfers out, EMIs).
- Include ALL rows: opening balance, closing balance, and every transaction line.
- Skip header rows, footer rows, and rows with no date or amount.
- Return ONLY the tool call, no prose.`;

function detectBank(text: string): string {
  const upper = text.toUpperCase();
  return KNOWN_BANKS.find((b) => upper.includes(b)) ?? 'Unknown Bank';
}

export const bankStatementParser: Parser = {
  name: 'bank-statement',

  canHandle(_ctx, sample) {
    const text = typeof sample === 'string' ? sample.toUpperCase() : '';
    if (!text) return false;
    const keywordHits = BANK_KEYWORDS.filter((k) => text.includes(k)).length;
    if (keywordHits < 3) return false;
    // Must not look like a contract note or CAS
    if (text.includes('CONTRACT NOTE') || text.includes('CONSOLIDATED ACCOUNT STATEMENT')) return false;
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
          warnings: ['PDF is password-protected. Enter the password to unlock.'],
        };
      }
      throw err;
    }

    if (!pdfText.trim()) {
      return {
        adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [],
        warnings: ['Bank statement PDF has no extractable text — scanned image not supported.'],
      };
    }

    const gate = checkLlmGate();
    if (!gate.ok) {
      return {
        adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [],
        warnings: [`LLM unavailable (${gate.reason}): ${gate.message}`],
      };
    }

    const budget = await checkBudget(ctx.userId);
    if (budget.status === 'capped') {
      return {
        adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [],
        warnings: [`Monthly LLM cap reached — bank statement not parsed.`],
      };
    }

    const redacted = redactForLlm(pdfText.slice(0, 8000));
    const bankName = detectBank(pdfText);

    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    let resp;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resp = await anthropic.messages.create({
        model: env.LLM_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [TOOL] as any,
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: redacted.text }],
      });
    } catch (err) {
      logger.warn({ err, fileName: ctx.fileName }, '[bankStatement] anthropic error');
      const cost = new Decimal(0);
      await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: 0, outputTokens: 0, costInr: cost, purpose: 'bank_statement_parse', sourceRef: ctx.fileName, success: false, errorMessage: (err as Error).message });
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`LLM call failed: ${(err as Error).message}`] };
    }

    const inTok = resp.usage?.input_tokens ?? 0;
    const outTok = resp.usage?.output_tokens ?? 0;
    const costInr = INR_PER_INPUT.times(inTok).plus(INR_PER_OUTPUT.times(outTok));
    await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: inTok, outputTokens: outTok, costInr, purpose: 'bank_statement_parse', sourceRef: ctx.fileName, success: true });

    const block = resp.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['LLM did not return structured data.'] };
    }

    const parsed = ResponseSchema.safeParse(block.input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error, fileName: ctx.fileName }, '[bankStatement] schema validation failed');
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`Schema validation failed: ${parsed.error.message}`] };
    }

    const effectiveBankName = parsed.data.bank_name ?? bankName;
    const acct = parsed.data.account_last4 ? ` (xxxx${parsed.data.account_last4})` : '';

    const transactions = parsed.data.transactions
      .map((row: ParsedBankRow) => {
        const isCredit = row.transaction_type === 'CREDIT';
        const rawAmt = isCredit ? row.credit_amount : row.debit_amount;
        if (!rawAmt) return null;
        return {
          assetClass: 'CASH' as const,
          transactionType: isCredit ? ('DEPOSIT' as const) : ('WITHDRAWAL' as const),
          assetName: `${effectiveBankName}${acct}`,
          tradeDate: row.date,
          quantity: rawAmt,
          price: '1',
          orderNo: row.transaction_ref ?? undefined,
          narration: row.description,
        };
      })
      .filter(<T>(x: T | null): x is T => x !== null);

    logger.info({ fileName: ctx.fileName, count: transactions.length }, '[bankStatement] parsed');
    return { broker: effectiveBankName, adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions, warnings: [] };
  },
};
