import { Decimal } from '../decimal.js';
import { addMonthsIso } from './emiDates.js';
import { EmiError, type EmiWarning, type LoanInput, type RateChange, type ScheduleResult, type ScheduleRow } from './emi.types.js';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
/** Safety cap; inputs are limited to 480 months but rate rises can stretch a loan. */
const MAX_ROWS = 1200;

const monthlyRate = (annualRatePct: Decimal) => annualRatePct.div(1200);
const paise = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Standard reducing-balance EMI, rounded UP to the rupee so the final
 * instalment is never larger than the EMI. Never below Rs 1 for a positive
 * balance (a tiny balance spread over many months would otherwise round to 0).
 */
export function emiFor(principal: Decimal, annualRatePct: Decimal, months: number): Decimal {
  if (!Number.isInteger(months) || months < 1) {
    throw new EmiError('INVALID_INPUT', 'Tenure must be at least 1 month', 'tenureMonths');
  }
  const r = monthlyRate(annualRatePct);
  let emi: Decimal;
  if (r.isZero()) {
    emi = principal.div(months);
  } else {
    const f = r.plus(1).pow(months);
    emi = principal.times(r).times(f).div(f.minus(1));
  }
  emi = emi.toDecimalPlaces(0, Decimal.ROUND_CEIL);
  return principal.gt(0) ? Decimal.max(emi, ONE) : emi;
}

/** Largest loan (whole rupees, rounded down) this EMI pays off in `months`. */
export function maxLoanFor(emi: Decimal, annualRatePct: Decimal, months: number): Decimal {
  const r = monthlyRate(annualRatePct);
  if (r.isZero()) return emi.times(months).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const f = r.plus(1).pow(months);
  return emi.times(f.minus(1)).div(r.times(f)).toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

/** Months needed to repay `principal` at a fixed `emi` (rounded up). */
export function tenureForEmi(principal: Decimal, emi: Decimal, annualRatePct: Decimal): number {
  const r = monthlyRate(annualRatePct);
  if (r.isZero()) return principal.div(emi).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
  const interest = principal.times(r);
  if (emi.lte(interest)) {
    throw new EmiError('EMI_TOO_LOW', 'EMI never pays off the loan - it does not cover the monthly interest', 'emi');
  }
  const n = emi.div(emi.minus(interest)).ln().div(r.plus(1).ln());
  // Trim float-ish noise so an exact 120 does not become 121.
  return n.toDecimalPlaces(9).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
}

export function buildEmiSchedule(input: LoanInput): ScheduleResult {
  const warnings = new Set<EmiWarning>();
  let rate = input.annualRatePct;
  let balance = input.principal;
  let emi = input.emiOverride ?? emiFor(balance, rate, input.tenureMonths);
  const startEmi = emi;
  /** Month in which the loan is planned to close; moves with prepayments and rate changes. */
  let plannedEnd = input.emiOverride ? tenureForEmi(balance, emi, rate) : input.tenureMonths;

  const changes = new Map<number, RateChange>();
  for (const c of input.rateChanges ?? []) changes.set(c.fromMonth, c);
  const prepays = input.prepayments ?? [];

  const rows: ScheduleRow[] = [];
  for (let m = 1; balance.gt(0) && m <= MAX_ROWS; m++) {
    const change = changes.get(m);
    if (change) {
      rate = change.annualRatePct;
      const remaining = Math.max(plannedEnd - m + 1, 1);
      if (change.mode === 'REDUCE_EMI') {
        emi = emiFor(balance, rate, remaining);
      } else if (emi.lte(balance.times(monthlyRate(rate)))) {
        emi = emiFor(balance, rate, remaining);
        warnings.add('NEGATIVE_AMORTISATION_AVOIDED');
      } else {
        plannedEnd = m - 1 + tenureForEmi(balance, emi, rate);
      }
    }

    const opening = balance;
    const interest = paise(opening.times(monthlyRate(rate)));
    let principal = emi.minus(interest);
    let paid = emi;
    if (m >= plannedEnd || principal.gte(opening)) {
      principal = opening;
      paid = opening.plus(interest);
    }
    balance = opening.minus(principal);

    let prepaid = ZERO;
    for (const p of prepays) {
      const due = p.month === m || (p.recurrence === 'YEARLY' && m > p.month && (m - p.month) % 12 === 0);
      if (!due || balance.lte(0)) continue;
      let amount = p.amount;
      if (amount.gt(balance)) {
        warnings.add('PREPAYMENT_CAPPED');
        amount = balance;
      }
      balance = balance.minus(amount);
      prepaid = prepaid.plus(amount);
      if (balance.gt(0)) {
        if (p.mode === 'REDUCE_EMI') emi = emiFor(balance, rate, Math.max(plannedEnd - m, 1));
        else plannedEnd = m + tenureForEmi(balance, emi, rate);
      }
    }

    rows.push({
      month: m,
      date: addMonthsIso(input.firstEmiDate, m - 1),
      opening,
      emi: paid,
      interest,
      principal,
      prepayment: prepaid,
      closing: balance,
      ratePct: rate,
    });
  }

  const months = rows.length;
  if (prepays.some((p) => p.month > months)) warnings.add('PREPAYMENT_AFTER_CLOSE');
  if ((input.rateChanges ?? []).some((c) => c.fromMonth > months)) warnings.add('RATE_CHANGE_AFTER_CLOSE');

  const sum = (pick: (r: ScheduleRow) => Decimal) => rows.reduce((acc, r) => acc.plus(pick(r)), ZERO);
  const totalInterest = sum((r) => r.interest);
  const totalPrincipal = sum((r) => r.principal);
  const totalPrepaid = sum((r) => r.prepayment);
  const totalEmi = sum((r) => r.emi);

  return {
    emi: startEmi,
    months,
    schedule: rows,
    totalInterest,
    totalPrincipal,
    totalPrepaid,
    totalPaid: totalEmi.plus(totalPrepaid),
    warnings: [...warnings],
  };
}
