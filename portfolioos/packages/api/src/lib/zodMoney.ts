/**
 * Shared zod schemas for money strings + ISO dates used in controller bodies.
 *
 * Two flavors of money:
 *   - positiveMoneyString — quantities, fees, prices, premiums, etc. Anything
 *     that can never legitimately be negative on input.
 *   - signedMoneyString — bank-account balances (overdraft / OD allowed),
 *     P&L adjustments, balance snapshots.
 *
 * Centralizing these prevents each controller from rolling its own regex with
 * subtly different semantics (some allow negatives, some don't) — the bug
 * pattern that surfaced during the BankAccount review when bankAccounts'
 * local `moneyString` quietly diverged from creditCards' `moneyString`.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';

// Plain decimal, optionally in exponent form (decimal.js prints tiny values as
// "1e-7"). Deliberately excludes what Decimal() would otherwise accept:
// "NaN", "Infinity", hex/binary/octal literals and surrounding whitespace.
const DECIMAL_RE = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

/**
 * A number-or-string decimal input, for bodies that historically accepted both.
 *
 * `z.union([z.number(), z.string()])` let "NaN" and "Infinity" through to
 * `new Decimal(...)`, which accepts them, and Postgres `numeric` stores NaN —
 * one such row poisons every sum it is part of. `maxAbs` keeps the value inside
 * the column's precision so an oversized input is a 422, not a database 500.
 */
export function decimalInput(maxAbs: number) {
  return z.union([z.number(), z.string()]).superRefine((v, ctx) => {
    const valid = typeof v === 'number' ? Number.isFinite(v) : DECIMAL_RE.test(v);
    if (!valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a decimal number' });
      return;
    }
    if (new Prisma.Decimal(v).abs().gte(maxAbs)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Must be smaller than ${maxAbs}` });
    }
  });
}

export const positiveMoneyString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

export const signedMoneyString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const isoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');

export const last4Digits = z
  .string()
  .length(4)
  .regex(/^\d{4}$/, 'Expected 4 digits');

export const mmYY = z
  .string()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Expected MM/YY');
