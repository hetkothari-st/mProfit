import { Decimal } from '@everypaisa/shared';

const PERCENT_TEXT = /^\d{1,3}(\.\d{1,2})?$/;
const AMOUNT_TEXT = /^\d{1,13}(\.\d{1,2})?$/;

export function isPercentText(s: string): boolean {
  return PERCENT_TEXT.test(s) && new Decimal(s).lte(100);
}

/** "₹1,00,000.50" -> "100000.50" */
export function normaliseAmountText(s: string): string {
  return s.replace(/[₹,\s]/g, '');
}

export function isAmountText(s: string): boolean {
  return AMOUNT_TEXT.test(normaliseAmountText(s));
}

/** n shares of 100% to two decimals that add up to exactly 100; the first takes the remainder. */
export function equalShares(n: number): string[] {
  if (n <= 0) return [];
  const base = new Decimal(100).dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const rest = new Decimal(100).minus(base.times(n));
  return Array.from({ length: n }, (_, i) => (i === 0 ? base.plus(rest) : base).toFixed(2));
}
