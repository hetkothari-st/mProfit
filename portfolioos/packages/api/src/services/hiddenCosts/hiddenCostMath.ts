import { Decimal } from 'decimal.js';

/**
 * Hidden Cost X-ray — the pure maths. Money is Decimal throughout; rates are
 * plain percent numbers (1.5 = 1.5%).
 */

/** The 20-year view: the same yearly cost, every year, each growing at this rate. */
export const COMPOUND_YEARS = 20;
export const COMPOUND_RATE_PCT = 12;

/**
 * Estimates, each stated on the page with its basis.
 * - ULIP: IRDAI caps the net reduction in yield at 2.25% a year for policies
 *   over 10 years; we show "up to" that.
 * - PMS: a 2% fixed management fee is the common Indian PMS fee.
 * - Exit load: most equity and hybrid funds charge 1% on units sold within a year.
 */
export const ULIP_CHARGE_CAP_PCT = 2.25;
export const PMS_FIXED_FEE_PCT = 2;
export const EXIT_LOAD_PCT = 1;
const EXIT_LOAD_DAYS = 365;
const EXIT_LOAD_CATEGORIES = new Set(['EQUITY', 'HYBRID']);

/** What a yearly cost, paid every year for `years` years and each grown at `ratePct`, adds up to. */
export function compoundYearly(annual: Decimal, ratePct = COMPOUND_RATE_PCT, years = COMPOUND_YEARS): Decimal {
  const r = new Decimal(ratePct).dividedBy(100);
  return annual.times(r.plus(1).pow(years).minus(1)).dividedBy(r);
}

/** A fund's yearly charge on its value. */
export function yearlyTerCost(value: Decimal, terPct: number): Decimal {
  return value.times(terPct).dividedBy(100);
}

/** `pct` percent of `value`. */
export const pctOf = (value: Decimal, pct: number): Decimal => value.times(pct).dividedBy(100);

// Charge words banks and card issuers use. A bare "fee" is left out on
// purpose: it is school, exam and club fees far more often than a bank charge.
const CHARGE =
  /\b(charges?|chrg|chgs?|late (payment )?fee|annual fee|joining fee|renewal fee|finance charges?|penal(ty)?|non[- ]?maint\w*|min(imum)?\.? ?bal\w*|sms alerts?|amc|gst on)\b/i;
const NOT_A_CHARGE = /\b(reversal|reversed|refund|waive[dr]?|cashback)\b/i;
// A charge word in a payment someone sorted as a bill ("Electricity charges",
// "Late payment fee" on a school bill) is that bill, not a bank charge.
const CHARGE_CATEGORIES = new Set(['uncategorised', 'other_consumption']);

/** A bank or card debit that is a charge: SMS alerts, ATM, late or annual fees, finance charges, minimum-balance penalties. */
export function isBankCharge(narration: string, category: string | null): boolean {
  if (category !== null && !CHARGE_CATEGORIES.has(category)) return false;
  return CHARGE.test(narration) && !NOT_A_CHARGE.test(narration);
}

/** An exit load estimate on one sale, or null when none is likely. */
export function exitLoadEstimate(sellAmount: Decimal, buyDate: Date, sellDate: Date, category: string | null): Decimal | null {
  if (!category || !EXIT_LOAD_CATEGORIES.has(category)) return null;
  const days = (sellDate.getTime() - buyDate.getTime()) / 86_400_000;
  if (days >= EXIT_LOAD_DAYS) return null;
  return pctOf(sellAmount, EXIT_LOAD_PCT);
}
