import { Decimal } from 'decimal.js';

/**
 * Pure maths for measuring a recommendation against doing nothing
 * (spec §6.3). Real NAVs and rates go in; rupees come out. No DB, no clock.
 */

const YEAR_DAYS = 365;

/** Interest a savings balance earns over `days` (simple, as savings accounts credit it). */
export function cashGrowth(amount: Decimal, ratePct: number, days: number): Decimal {
  return amount.times(ratePct).dividedBy(100).times(days).dividedBy(YEAR_DAYS);
}

/** What `amount` invested at NAV `start` gained by NAV `end`. */
export function navGrowth(amount: Decimal, start: Decimal, end: Decimal): Decimal {
  return amount.times(end.dividedBy(start).minus(1));
}

/** Liquid fund vs leaving it in savings. */
export function navVsCash(amount: Decimal, navStart: Decimal, navEnd: Decimal, savingsRatePct: number, days: number): Decimal {
  return navGrowth(amount, navStart, navEnd).minus(cashGrowth(amount, savingsRatePct, days));
}

export interface NavPath {
  start: Decimal;
  end: Decimal;
}

/** The same money on the direct plan vs the regular plan of one fund. */
export function directVsRegular(value: Decimal, regular: NavPath, direct: NavPath): Decimal {
  return navGrowth(value, direct.start, direct.end).minus(navGrowth(value, regular.start, regular.end));
}

/** What instalments bought in the dip are worth now, above what was paid. */
export function sipDipGain(buys: { amount: Decimal; nav: Decimal }[], navNow: Decimal): Decimal {
  return buys.reduce((s, b) => s.plus(navGrowth(b.amount, b.nav, navNow)), new Decimal(0));
}

/** Interest saved on a loan moved from one rate to a lower one, over `days`. */
export function loanInterestSaved(outstanding: Decimal, fromPct: number, toPct: number, days: number): Decimal {
  return outstanding.times(fromPct - toPct).dividedBy(100).times(days).dividedBy(YEAR_DAYS);
}

/** Missed its own promise: delivered under half the promised gain. No money promise, no miss. */
export function missesPromise(promisedGain: Decimal | null, actual: Decimal): boolean {
  if (promisedGain === null || promisedGain.lessThanOrEqualTo(0)) return false;
  return actual.lessThan(promisedGain.dividedBy(2));
}
