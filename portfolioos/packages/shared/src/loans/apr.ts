import { Decimal } from '../decimal.js';
import type { Fees, ScheduleRow } from './emi.types.js';

export interface FeeSummary { processingFee: Decimal; gst: Decimal; otherCharges: Decimal; total: Decimal }

/** Module-local clone: 40 significant digits keeps the bisection exact on long schedules. */
const Dec = Decimal.clone({ precision: 40 });
const ZERO = new Decimal(0);
const paise = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function loanFees(principal: Decimal, fees?: Fees): FeeSummary {
  if (!fees) return { processingFee: ZERO, gst: ZERO, otherCharges: ZERO, total: ZERO };
  const processingFee = paise(
    fees.processingFeeKind === 'PCT' ? principal.times(fees.processingFeeValue).div(100) : fees.processingFeeValue,
  );
  const gst = paise(processingFee.times(fees.gstPct).div(100));
  const otherCharges = paise(fees.otherCharges);
  return { processingFee, gst, otherCharges, total: processingFee.plus(gst).plus(otherCharges) };
}

export interface LoanRates {
  /** Effective annual rate, (1+i)^12 - 1, as a percentage to 2 dp. */
  aprPct: Decimal;
  /** Nominal annual rate, i x 12, as a percentage to 2 dp. */
  nominalPct: Decimal;
}

/**
 * APR from actual cash flows: the borrower receives `netReceived` at t0 and
 * pays each row's EMI + prepayment at month k. Monthly IRR `i` by bisection,
 * reported both annualised as (1+i)^12 - 1 and as the nominal i x 12.
 */
export function loanRates(netReceived: Decimal, schedule: ScheduleRow[]): LoanRates {
  const received = new Dec(netReceived);
  const payments = schedule.map((r) => new Dec(r.emi).plus(r.prepayment));
  const pv = (i: InstanceType<typeof Dec>) => {
    const d = new Dec(1).div(i.plus(1));
    let factor = new Dec(1);
    let total = new Dec(0);
    for (const p of payments) {
      factor = factor.times(d);
      total = total.plus(p.times(factor));
    }
    return total;
  };
  const pct = (d: InstanceType<typeof Dec>) => new Decimal(d.times(100).toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  // Payments never exceed what was received -> no cost of borrowing.
  if (pv(new Dec(0)).lte(received)) return { aprPct: new Decimal(0).toDecimalPlaces(2), nominalPct: new Decimal(0).toDecimalPlaces(2) };
  let lo = new Dec(0);
  let hi = new Dec(1); // 100% a month - far above any real loan
  const tolerance = new Dec('1e-12');
  for (let k = 0; k < 200 && hi.minus(lo).gt(tolerance); k++) {
    const mid = lo.plus(hi).div(2);
    if (pv(mid).gt(received)) lo = mid;
    else hi = mid;
  }
  return { aprPct: pct(lo.plus(1).pow(12).minus(1)), nominalPct: pct(lo.times(12)) };
}

/** APR only; see `loanRates`. */
export function loanApr(netReceived: Decimal, schedule: ScheduleRow[]): Decimal {
  return loanRates(netReceived, schedule).aprPct;
}
