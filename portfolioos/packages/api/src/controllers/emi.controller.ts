import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  EmiError, summariseLoan, validateLoanWire, validateTaxWire, loanFromWire, taxFromWire,
  type LoanInputWire, type TaxInputWire,
} from '@everypaisa/shared';
import { BadRequestError } from '../lib/errors.js';
import { buildEmiPdf, buildEmiXlsx } from '../services/loans/emi/emiExport.js';

const mode = z.enum(['REDUCE_EMI', 'REDUCE_TENURE']);
// Shape only; value rules live in the shared validator so web and API agree.
const body = z.object({
  title: z.string().trim().max(80).optional(),
  input: z.object({
    principal: z.string().max(30),
    annualRatePct: z.string().max(10),
    tenureMonths: z.number(),
    firstEmiDate: z.string().max(10),
    emiOverride: z.string().max(30).optional(),
    prepayments: z.array(z.object({ month: z.number(), amount: z.string().max(30), recurrence: z.enum(['ONCE', 'YEARLY']), mode })).max(50).optional(),
    rateChanges: z.array(z.object({ fromMonth: z.number(), annualRatePct: z.string().max(10), mode })).max(50).optional(),
    fees: z.object({ processingFeeKind: z.enum(['PCT', 'AMOUNT']), processingFeeValue: z.string().max(30), gstPct: z.string().max(10), otherCharges: z.string().max(30) }).optional(),
  }),
  tax: z.object({
    regime: z.enum(['OLD', 'NEW']),
    loanKind: z.enum(['HOME_SELF', 'HOME_LET_OUT', 'EDUCATION', 'NONE']),
    slabPct: z.string().max(10),
    remaining80C: z.string().max(30),
  }).optional(),
});

const FORMATS = {
  pdf: { type: 'application/pdf', build: buildEmiPdf },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', build: buildEmiXlsx },
} as const;

export async function exportHandler(req: Request, res: Response): Promise<void> {
  const format = String(req.query['format'] ?? '');
  if (format !== 'pdf' && format !== 'xlsx') throw new BadRequestError('format must be pdf or xlsx', { field: 'format' });
  const parsed = body.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid request body', { field: parsed.error.issues[0]?.path.join('.') });
  const input = parsed.data.input as LoanInputWire;
  const tax = parsed.data.tax as TaxInputWire | undefined;
  const errors = [...validateLoanWire(input), ...(tax ? validateTaxWire(tax) : [])];
  if (errors.length > 0) throw new BadRequestError(errors[0]!.message, { field: errors[0]!.field });

  let summary;
  try {
    summary = summariseLoan(loanFromWire(input), tax ? taxFromWire(tax) : undefined);
  } catch (err) {
    if (err instanceof EmiError) throw new BadRequestError(err.message, { field: err.field });
    throw err;
  }
  const f = FORMATS[format];
  const file = await f.build(summary, { title: parsed.data.title || 'Loan', input, tax });
  res.setHeader('Content-Type', f.type);
  res.setHeader('Content-Disposition', `attachment; filename="emi-schedule.${format}"`);
  res.send(file);
}
