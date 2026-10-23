import { z } from 'zod';
import { LRS_PURPOSES as PURPOSES } from './constants';

// An empty input registers as "" — not undefined — so `.optional()` alone
// rejected a blank "FX rate (optional)" or "TCS deducted" and the form would
// not submit, with no message (neither field rendered its error).
const optionalAmount = z
  .union([z.literal(''), z.string().trim().regex(/^\d+(\.\d+)?$/, 'Enter a number, e.g. 83.25')])
  .optional();

export const lrsSchema = z.object({
  remittanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().min(3).max(3),
  foreignAmount: z.string().regex(/^-?\d+(\.\d+)?$/),
  fxRate: optionalAmount,
  purpose: z.enum(PURPOSES),
  bankName: z.string().max(160).optional(),
  remittanceRef: z.string().max(200).optional(),
  tcsDeducted: optionalAmount,
  notes: z.string().max(2000).optional(),
});
export type LrsForm = z.infer<typeof lrsSchema>;
