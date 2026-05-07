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

const ADAPTER_ID = 'salary.slip.pdf';
const ADAPTER_VER = '1';

const INR_PER_INPUT = new Decimal('0.80').div(1_000_000).times(83);
const INR_PER_OUTPUT = new Decimal('4').div(1_000_000).times(83);

const SALARY_KEYWORDS = [
  'SALARY SLIP', 'PAY SLIP', 'PAYSLIP', 'PAY STATEMENT',
  'SALARY STATEMENT', 'PAY ADVICE', 'COMPENSATION',
  'NET PAY', 'NET SALARY', 'GROSS SALARY', 'TAKE HOME',
  'BASIC SALARY', 'BASIC PAY', 'HRA', 'PROVIDENT FUND',
  'PF DEDUCTION', 'PROFESSIONAL TAX', 'TDS ON SALARY',
];

const SlipSchema = z.object({
  employer: z.string().nullable().optional(),
  employee_name: z.string().nullable().optional(),
  month_year: z.string().nullable().optional(),
  pay_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  basic: z.string().nullable().optional(),
  hra: z.string().nullable().optional(),
  other_allowances: z.string().nullable().optional(),
  gross_salary: z.string().nullable().optional(),
  pf_deduction: z.string().nullable().optional(),
  tds_deduction: z.string().nullable().optional(),
  professional_tax: z.string().nullable().optional(),
  other_deductions: z.string().nullable().optional(),
  total_deductions: z.string().nullable().optional(),
  net_pay: z.string(),
});

const ResponseSchema = z.object({
  salary_slips: z.array(SlipSchema),
});

type ParsedSlip = z.infer<typeof SlipSchema>;

const TOOL_NAME = 'extract_salary_slips';
const TOOL = {
  name: TOOL_NAME,
  description: 'Extract salary/compensation details from a pay slip.',
  input_schema: {
    type: 'object' as const,
    required: ['salary_slips'],
    additionalProperties: false,
    properties: {
      salary_slips: {
        type: 'array',
        items: {
          type: 'object',
          required: ['net_pay'],
          additionalProperties: false,
          properties: {
            employer: { type: ['string', 'null'], description: 'Company/employer name' },
            employee_name: { type: ['string', 'null'] },
            month_year: { type: ['string', 'null'], description: 'e.g. "April 2024"' },
            pay_date: { type: ['string', 'null'], description: 'YYYY-MM-DD when salary was credited, or last day of month if not specified' },
            basic: { type: ['string', 'null'], description: 'Basic salary component, decimal string' },
            hra: { type: ['string', 'null'], description: 'House rent allowance, decimal string' },
            other_allowances: { type: ['string', 'null'], description: 'Sum of all other allowances, decimal string' },
            gross_salary: { type: ['string', 'null'], description: 'Gross (before deductions)' },
            pf_deduction: { type: ['string', 'null'], description: 'Employee PF deduction' },
            tds_deduction: { type: ['string', 'null'], description: 'TDS / income tax deduction' },
            professional_tax: { type: ['string', 'null'], description: 'Professional tax deduction' },
            other_deductions: { type: ['string', 'null'], description: 'Other deductions total' },
            total_deductions: { type: ['string', 'null'], description: 'Total of all deductions' },
            net_pay: { type: 'string', description: 'Net take-home amount, positive decimal string without ₹ or commas' },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a salary slip parser for Indian employees.
Extract compensation details from the pay slip.

Rules:
- Dates: YYYY-MM-DD. If only month/year given, use the last day of that month.
- Amounts: positive decimal string, no ₹ or commas ("45,500" → "45500").
- net_pay is required — it is the take-home / net salary after all deductions.
- If document has multiple months, return each as a separate entry.
- Return ONLY the tool call.`;

// Derive a pay date from month_year string like "April 2024" or "Apr-2024"
function inferPayDate(monthYear: string | null | undefined, fallback: string): string {
  if (!monthYear) return fallback;
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const lower = monthYear.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const parts = lower.split(/\s+/);
  let month: string | undefined;
  let year: string | undefined;
  for (const part of parts) {
    if (months[part]) month = months[part];
    if (/^\d{4}$/.test(part)) year = part;
  }
  if (month && year) {
    // Last day of the month
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  }
  return fallback;
}

export const salarySlipParser: Parser = {
  name: 'salary-slip',

  canHandle(_ctx, sample) {
    const text = typeof sample === 'string' ? sample.toUpperCase() : '';
    if (!text) return false;
    const hits = SALARY_KEYWORDS.filter((k) => text.includes(k)).length;
    return hits >= 3;
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
          warnings: ['Salary slip PDF is password-protected. Enter the password to unlock.'],
        };
      }
      throw err;
    }

    if (!pdfText.trim()) {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['Salary slip PDF has no extractable text.'] };
    }

    const gate = checkLlmGate();
    if (!gate.ok) {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`LLM unavailable: ${gate.message}`] };
    }

    const budget = await checkBudget(ctx.userId);
    if (budget.status === 'capped') {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['Monthly LLM cap reached.'] };
    }

    const redacted = redactForLlm(pdfText.slice(0, 5000));
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
      logger.warn({ err, fileName: ctx.fileName }, '[salarySlip] anthropic error');
      await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: 0, outputTokens: 0, costInr: new Decimal(0), purpose: 'salary_slip_parse', sourceRef: ctx.fileName, success: false, errorMessage: (err as Error).message });
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`LLM call failed: ${(err as Error).message}`] };
    }

    const inTok = resp.usage?.input_tokens ?? 0;
    const outTok = resp.usage?.output_tokens ?? 0;
    const costInr = INR_PER_INPUT.times(inTok).plus(INR_PER_OUTPUT.times(outTok));
    await recordSpend({ userId: ctx.userId, model: env.LLM_MODEL, inputTokens: inTok, outputTokens: outTok, costInr, purpose: 'salary_slip_parse', sourceRef: ctx.fileName, success: true });

    const block = resp.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: ['LLM did not return structured data.'] };
    }

    const parsed = ResponseSchema.safeParse(block.input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error, fileName: ctx.fileName }, '[salarySlip] schema validation failed');
      return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions: [], warnings: [`Schema validation failed: ${parsed.error.message}`] };
    }

    const today = new Date().toISOString().slice(0, 10);
    const transactions = parsed.data.salary_slips.map((slip: ParsedSlip) => {
      const tradeDate = slip.pay_date ?? inferPayDate(slip.month_year, today);
      const employer = slip.employer ?? 'Employer';
      const monthLabel = slip.month_year ? ` (${slip.month_year})` : '';
      const assetName = `Salary — ${employer}`;

      const narrationParts: string[] = [`Salary${monthLabel}`];
      if (slip.gross_salary) narrationParts.push(`Gross: ₹${slip.gross_salary}`);
      if (slip.total_deductions) narrationParts.push(`Deductions: ₹${slip.total_deductions}`);

      return {
        assetClass: 'CASH' as const,
        transactionType: 'DEPOSIT' as const,
        assetName,
        tradeDate,
        quantity: slip.net_pay,
        price: '1',
        broker: employer,
        narration: narrationParts.join(' | '),
      };
    });

    logger.info({ fileName: ctx.fileName, count: transactions.length }, '[salarySlip] parsed');
    return { adapter: ADAPTER_ID, adapterVer: ADAPTER_VER, transactions, warnings: [] };
  },
};
