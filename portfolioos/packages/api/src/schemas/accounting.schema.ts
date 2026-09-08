import { z } from 'zod';

/**
 * Request shapes for the accounting module.
 *
 * These lived inside `accounting.controller.ts` and were not exported, so the
 * CA workspace — which calls the same services on behalf of a client — had no
 * way to reuse them and silently passed `req.body` through unvalidated. That
 * mattered more there than anywhere: `accounting.service.ts` performs no
 * format checking of its own, so this file is the ONLY place a money string is
 * ever proved to be one, and the CA path is the one surface where the caller
 * does not own the ledger they are writing to.
 *
 * Shared here so both controllers validate identically. A second copy would
 * drift, and the copy that drifted would be the one guarding somebody else's
 * books.
 */

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const;
export const VOUCHER_TYPES = [
  'JOURNAL',
  'PAYMENT',
  'RECEIPT',
  'CONTRA',
  'PURCHASE',
  'SALES',
] as const;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * Money crosses this boundary as a decimal string and is never parsed into a
 * JS number (§3.1). The regex is the guarantee that what reaches
 * `toDecimal()` downstream is well-formed.
 */
export const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

export const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().nullable().optional(),
  openingBalance: moneyString.optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

export const voucherEntrySchema = z.object({
  debitAccountId: z.string().min(1),
  creditAccountId: z.string().min(1),
  amount: moneyString,
  narration: z.string().max(500).optional(),
});

export const createVoucherSchema = z.object({
  type: z.enum(VOUCHER_TYPES),
  voucherNo: z.string().min(1).max(50),
  date: isoDate,
  narration: z.string().max(500).optional(),
  entries: z.array(voucherEntrySchema).min(1),
});

export const updateVoucherSchema = createVoucherSchema.partial();
