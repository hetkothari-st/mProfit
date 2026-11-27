import { Decimal } from 'decimal.js';

/**
 * A per-card credit limit above this is unusual enough to ask "Is this
 * right?" — a slip of a zero turns ₹2,50,000 into ₹25,00,000. Advisory only:
 * the limit is still saved.
 */
export const CREDIT_LIMIT_CHECK_ABOVE_INR = '2500000';

export const CREDIT_LIMIT_CHECK_MESSAGE =
  'Is this right? That is an unusually high limit for one card — check for an extra zero. You can still save it.';

/** True when a typed limit ("25,00,001", "₹3000000") is above the check threshold. Unparseable input is false. */
export function creditLimitLooksHigh(raw: string | null | undefined): boolean {
  const s = (raw ?? '').replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return false;
  return new Decimal(s).greaterThan(CREDIT_LIMIT_CHECK_ABOVE_INR);
}
