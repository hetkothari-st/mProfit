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
