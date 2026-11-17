/**
 * Loans service — Approach C: computed amortization + stored payments.
 *
 * The amortization schedule is computed on-the-fly from the loan's terms
 * and the stored LoanPayment rows (EMIs, prepayments, foreclosure).
 * No schedule rows are persisted — they are always derived.
 *
 * Money math uses decimal.js throughout (never JS Number) per §3.2.
 */

import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  Decimal as SharedDecimal,
  indianFy,
  loanTaxBenefit,
  serializeMoney,
  type LoanRateBenchmark,
  type LoanRateType,
  type ScheduleRow,
} from '@everypaisa/shared';
import { loanAccountNumberColumns, PLATE_SELECT, readLoanAccountNumber, revealVehicle } from '../security/piiAtRest.service.js';
import { last4 } from '../pf/pfCredentials.service.js';
import { isRealDate } from './loanRates/sanity.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const LOAN_TYPES = [
  'HOME',
  'CAR',
  'PERSONAL',
  'EDUCATION',
  'BUSINESS',
  'GOLD',
  'LAS',
  'OTHER',
] as const;

export const PAYMENT_TYPES = [
  'EMI',
  'PREPAYMENT',
  'FORECLOSURE',
  'PROCESSING_FEE',
] as const;

export const PREPAYMENT_OPTIONS = ['REDUCE_TENURE', 'REDUCE_EMI'] as const;

export const LOAN_STATUSES = ['ACTIVE', 'CLOSED', 'FORECLOSED', 'DEFAULT'] as const;

/**
 * Statuses whose balance is still owed. A DEFAULT loan has stopped being
 * repaid, not stopped being owed, so it counts as a liability everywhere an
 * ACTIVE one does (net worth, dashboard, will estate). EMI reminders and
 * forecasts stay ACTIVE-only: there is no schedule being kept to remind about.
 */
export const OUTSTANDING_LOAN_STATUSES = ['ACTIVE', 'DEFAULT'];

/** Days before an EMI on which a reminder is raised; 0 is the due date itself. */
const ALERT_THRESHOLDS = [30, 15, 7, 1, 0] as const;

/**
 * A missed EMI is reported as overdue only while it is this recent. Loans are
 * often added mid-tenure and their earlier EMIs never marked paid; alerting on
 * those would flag history the user never meant to track.
 */
const OVERDUE_WINDOW_DAYS = 30;

/** Both loan forms save "80C+24B"; "80C_24B" is the older code. */
const HOME_LOAN_TAX_SECTIONS = new Set(['80C+24B', '80C_24B']);

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateLoanInput {
  lenderName: string;
  accountNumber?: string | null;
  loanType: (typeof LOAN_TYPES)[number];
  borrowerName: string;
  principalAmount: string;
  interestRate: string;
  tenureMonths: number;
  emiAmount: string;
  disbursementDate: string;
  firstEmiDate: string;
  prepaymentOption?: (typeof PREPAYMENT_OPTIONS)[number];
  vehicleId?: string | null;
  rentalPropertyId?: string | null;
  portfolioId?: string | null;
  taxBenefitSection?: string | null;
  status?: (typeof LOAN_STATUSES)[number];
  closedDate?: string | null;
  lenderMatchKey?: string | null;
  /** spec s6.1. Default UNKNOWN. */
  rateType?: LoanRateType;
  /** Only for FLOATING loans. */
  rateBenchmark?: LoanRateBenchmark | null;
  /** 'YYYY-MM-DD'. Only for FLOATING loans. */
  nextRateResetDate?: string | null;
}

export type UpdateLoanInput = Partial<CreateLoanInput>;

export interface AddPaymentInput {
  paymentType: (typeof PAYMENT_TYPES)[number];
  paidOn: string;
  amount: string;
  principalPart?: string | null;
  interestPart?: string | null;
  forMonth?: string | null;
  canonicalEventId?: string | null;
  notes?: string | null;
}

// ── Amortization types ───────────────────────────────────────────────────────

export interface AmortizationRow {
  month: number;
  date: string;          // YYYY-MM-DD (EMI due date)
  emiAmount: string;
  principalPart: string;
  interestPart: string;
  openingBalance: string;
  closingBalance: string;
  isPaid: boolean;
  paidOn: string | null;
  paymentType: string;   // 'EMI' | 'PREPAYMENT' etc. for display
}

export interface TaxBenefitSummary {
  section: string;
  principalDeduction: string | null;   // 80C principal cap
  interestDeduction: string | null;    // 24b / 80E interest cap
  estimatedTaxSaving: string;          // this FY, at `assumption`'s slab, cess included
  /** What the estimate assumes (regime, slab, cess); shown next to the figure. */
  assumption: string;
  /** Why the deduction is nil or limited (e.g. 80E past its 8 years); null when not. */
  note: string | null;
}

export interface LoanSummary {
  outstandingBalance: string;
  totalPrincipalPaid: string;
  totalInterestPaid: string;
  nextEmiDate: string | null;
  nextEmiAmount: string;
  /** Scheduled EMIs marked paid, across the whole loan (not capped like list payments). */
  paidEmiCount: number;
  /** EMIs in the current plan; shorter than tenure after a tenure-reducing prepayment. */
  scheduledEmiCount: number;
  remainingEmiCount: number;
  remainingTenureMonths: number;
  totalInterestPayable: string;
  effectiveEndDate: string | null;
  prepaymentSavings: string | null;
  taxBenefit: TaxBenefitSummary | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

/**
 * Format a Date as YYYY-MM-DD (UTC, so no timezone drift on @db.Date fields).
 */
function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Add N calendar months to a date, preserving the day-of-month
 * (clamping to end-of-month when needed, e.g. Jan 31 + 1 month → Feb 28).
 */
function addMonths(date: Date, n: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, date.getUTCDate()));
  // If day overflowed (e.g. March 31 + 1 → April 31 → May 1), rewind to last day of target month
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n + 1, 0));
  if (d.getUTCDate() < date.getUTCDate()) return target;
  return d;
}

export interface RateFieldsData {
  rateType?: string;
  rateBenchmark?: string | null;
  nextRateResetDate?: Date | null;
}

/**
 * spec s6.1 + plan ruling 12: a benchmark and a reset date describe FLOATING loans only. Giving either for a
 * loan that is (or is becoming) FIXED/UNKNOWN is refused; switching a loan away from FLOATING clears both.
 * `existing` is null on create.
 */
export function resolveRateFields(
  input: Pick<UpdateLoanInput, 'rateType' | 'rateBenchmark' | 'nextRateResetDate'>,
  existing: { rateType: string } | null,
): RateFieldsData {
  // The body schema only checks the shape; 2026-02-30 must be refused, not rolled to 2 March.
  if (typeof input.nextRateResetDate === 'string' && !isRealDate(input.nextRateResetDate)) {
    throw new ValidationError('Not a real date', { field: 'nextRateResetDate' });
  }
  const type = input.rateType ?? existing?.rateType ?? 'UNKNOWN';
  const out: RateFieldsData = {};
  if (input.rateType !== undefined) out.rateType = input.rateType;
  if (type !== 'FLOATING') {
    const field =
      (input.rateBenchmark ?? null) !== null ? 'rateBenchmark' : (input.nextRateResetDate ?? null) !== null ? 'nextRateResetDate' : null;
    if (field !== null) {
      throw new ValidationError('A benchmark and a reset date apply to floating-rate loans only', { field });
    }
    if (existing === null || input.rateType !== undefined) {
      out.rateBenchmark = null;
      out.nextRateResetDate = null;
    }
    return out;
  }
  if (input.rateBenchmark !== undefined) out.rateBenchmark = input.rateBenchmark;
  if (input.nextRateResetDate !== undefined) out.nextRateResetDate = input.nextRateResetDate ? toDate(input.nextRateResetDate) : null;
  return out;
}

/**
 * Compute monthly interest rate from annual rate (percentage).
 * E.g. 8.5% annual → 0.085/12 monthly.
 */
export function computeMonthlyRate(annualRatePct: Decimal): Decimal {
  return annualRatePct.dividedBy(100).dividedBy(12);
}

/**
 * Standard reducing-balance EMI formula:
 *   EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 * where r = monthly rate, n = tenure months, P = principal.
 */
export function computeEmi(
  principal: Decimal,
  annualRatePct: Decimal,
  tenureMonths: number,
): Decimal {
  const r = computeMonthlyRate(annualRatePct);
  if (r.isZero()) {
    // Zero-interest loan
    return principal.dividedBy(tenureMonths).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  }
  const onePlusR = r.plus(1);
  const onePlusRn = onePlusR.toPower(tenureMonths);
  return principal
    .times(r)
    .times(onePlusRn)
    .dividedBy(onePlusRn.minus(1))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

export type StoredLoan = {
  id: string;
  principalAmount: Prisma.Decimal;
  interestRate: Prisma.Decimal;
  tenureMonths: number;
  emiAmount: Prisma.Decimal;
  emiDueDay: number;
  firstEmiDate: Date;
  prepaymentOption: string;
  taxBenefitSection?: string | null;
  payments: StoredPayment[];
};

type StoredPayment = {
  id: string;
  paymentType: string;
  paidOn: Date;
  amount: Prisma.Decimal;
  principalPart: Prisma.Decimal | null;
  interestPart: Prisma.Decimal | null;
  forMonth: string | null;
};

/**
 * Build the full amortization schedule for a loan, incorporating stored
 * payments (EMIs and prepayments).
 *
 * Algorithm:
 *  1. Start at month 1, opening balance = principalAmount.
 *  2. Apply any prepayments that fall before this EMI date (reduce balance first).
 *  3. Compute interest for the month = openingBalance × monthlyRate.
 *  4. Principal part = EMI − interest (or closing balance if it's the last installment).
 *  5. Closing balance = opening − principal.
 *  6. If prepaymentOption = REDUCE_TENURE: keep same EMI, recalculate remaining months.
 *     If prepaymentOption = REDUCE_EMI: recompute EMI, keep original tenure.
 *  7. Stop when closing balance ≈ 0 or original tenure exhausted.
 *
 * Returns up to 600 rows (50 years — more than any real loan).
 */
export function buildAmortizationSchedule(
  loan: StoredLoan,
): AmortizationRow[] {
  const ZERO = new Decimal(0);
  const EPSILON = new Decimal('0.005'); // ≈ ₹0 balance threshold

  const annualRate = new Decimal(loan.interestRate.toString());
  const originalEmi = new Decimal(loan.emiAmount.toString());
  const principal = new Decimal(loan.principalAmount.toString());
  const monthlyRate = computeMonthlyRate(annualRate);

  // Separate EMI payments by forMonth, prepayments by date
  const emiPaidMonths = new Map<string, StoredPayment>();
  const prepayments: StoredPayment[] = [];

  for (const p of loan.payments) {
    if (p.paymentType === 'EMI') {
      const key = p.forMonth ?? dateToIso(p.paidOn).slice(0, 7);
      emiPaidMonths.set(key, p);
    } else if (p.paymentType === 'PREPAYMENT' || p.paymentType === 'FORECLOSURE') {
      // A foreclosure is a prepayment of the whole balance; one that clears it ends the schedule.
      prepayments.push(p);
    }
    // PROCESSING_FEE does not touch the balance
  }

  // Sort prepayments ascending by date
  prepayments.sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime());
  let prepaymentIdx = 0;

  const rows: AmortizationRow[] = [];
  let balance = principal;
  let currentEmi = originalEmi;
  let currentTenure = loan.tenureMonths;
  let emiDate = new Date(loan.firstEmiDate);

  const maxRows = Math.min(600, loan.tenureMonths * 3); // safety cap

  for (let month = 1; month <= maxRows; month++) {
    if (balance.lessThanOrEqualTo(EPSILON)) break;

    const emiMonthKey = dateToIso(emiDate).slice(0, 7); // YYYY-MM

    // Apply all prepayments that fell before or on this EMI date
    while (
      prepaymentIdx < prepayments.length &&
      prepayments[prepaymentIdx]!.paidOn <= emiDate
    ) {
      const pre = prepayments[prepaymentIdx]!;
      const preAmt = new Decimal(pre.amount.toString());
      balance = Decimal.max(ZERO, balance.minus(preAmt));
      prepaymentIdx++;

      if (balance.lessThanOrEqualTo(EPSILON)) break;

      const remainingMonths = currentTenure - month + 1;
      if (remainingMonths <= 0) break;

      if (loan.prepaymentOption === 'REDUCE_TENURE') {
        // Recompute remaining months at same EMI
        if (!monthlyRate.isZero()) {
          const onePlusR = monthlyRate.plus(1);
          // n = -log(1 - r*P/EMI) / log(1+r)
          const rP = monthlyRate.times(balance);
          if (rP.lessThan(currentEmi)) {
            const logArg = new Decimal(1).minus(rP.dividedBy(currentEmi));
            if (logArg.greaterThan(0)) {
              const newMonths = Math.ceil(
                -Math.log(logArg.toNumber()) / Math.log(onePlusR.toNumber()),
              );
              currentTenure = month - 1 + newMonths;
            } else {
              // Balance so small one EMI covers it
              currentTenure = month;
            }
          } else {
            currentTenure = month;
          }
        } else {
          currentTenure = month - 1 + Math.ceil(balance.dividedBy(currentEmi).toNumber());
        }
      } else {
        // REDUCE_EMI: keep original remaining tenure, recompute EMI
        const remaining = currentTenure - month + 1;
        currentEmi = computeEmi(balance, annualRate, remaining);
      }
    }

    if (balance.lessThanOrEqualTo(EPSILON)) break;

    const openingBalance = balance;

    // Interest for this month
    const interestPart = balance.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

    // Principal part (cap at remaining balance to avoid overshoot on last EMI)
    let principalPart = currentEmi.minus(interestPart).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    if (principalPart.greaterThan(balance)) {
      principalPart = balance.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    }

    // Actual EMI for this row (may be less on last installment)
    const actualEmi = principalPart.plus(interestPart);

    const closingBalance = openingBalance.minus(principalPart).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    balance = Decimal.max(ZERO, closingBalance);

    // Check if this month's EMI was paid
    const paidEntry = emiPaidMonths.get(emiMonthKey);
    const isPaid = paidEntry !== undefined;

    rows.push({
      month,
      date: dateToIso(emiDate),
      emiAmount: serializeMoney(actualEmi),
      principalPart: serializeMoney(principalPart),
      interestPart: serializeMoney(interestPart),
      openingBalance: serializeMoney(openingBalance),
      closingBalance: serializeMoney(balance),
      isPaid,
      paidOn: isPaid ? dateToIso(paidEntry!.paidOn) : null,
      paymentType: 'EMI',
    });

    if (balance.lessThanOrEqualTo(EPSILON)) break;

    // Advance to next EMI date
    emiDate = addMonths(new Date(loan.firstEmiDate), month);
  }

  return rows;
}

export interface LoanPosition {
  /** Opening balance of the first unpaid EMI; principal if the schedule cannot be built. */
  outstanding: Decimal;
  firstUnpaid: AmortizationRow | null;
  scheduleFailed: boolean;
}

/**
 * The one definition of a loan's outstanding balance on a given day, used by
 * the Loans page summary and (through `loanPosition`) the dashboard, sidebar
 * and will estate, which used to disagree with it.
 *
 * Past EMIs left unmarked are assumed paid: loans are often added mid-tenure
 * and their earlier EMIs never recorded. So the balance is the opening balance
 * of the first unpaid EMI dated on or after `today`; once no EMI is left, it is
 * the schedule's final closing balance less any prepayment made after it.
 */
function scheduleOutstanding(
  loan: StoredLoan,
  schedule: AmortizationRow[],
  today: Date,
): { outstanding: Decimal; upcoming: AmortizationRow[] } {
  if (schedule.length === 0) {
    return { outstanding: new Decimal(loan.principalAmount.toString()), upcoming: [] };
  }
  const todayStr = dateToIso(today);
  const upcoming = schedule.filter((r) => !r.isPaid && r.date >= todayStr);
  if (upcoming.length > 0) {
    return { outstanding: new Decimal(upcoming[0]!.openingBalance), upcoming };
  }
  const last = schedule[schedule.length - 1]!;
  return {
    outstanding: Decimal.max(0, new Decimal(last.closingBalance).minus(principalPaidAfter(loan, last.date))),
    upcoming,
  };
}

/** Where a loan stands today. Shared by the dashboard, sidebar and the will estate list. */
export function loanPosition(loan: StoredLoan, asOf: Date = new Date()): LoanPosition {
  let schedule: AmortizationRow[];
  try {
    schedule = buildAmortizationSchedule(loan);
  } catch (err) {
    logger.warn(
      { loanId: loan.id, errName: err instanceof Error ? err.name : 'unknown' },
      '[loans] schedule failed; principal used as outstanding',
    );
    return { outstanding: new Decimal(loan.principalAmount.toString()), firstUnpaid: null, scheduleFailed: true };
  }
  const today = new Date(asOf.getTime());
  today.setUTCHours(0, 0, 0, 0);
  return {
    outstanding: scheduleOutstanding(loan, schedule, today).outstanding,
    // The earliest unmarked EMI, past ones included: the dashboard's
    // upcoming/overdue EMI list reads it. It no longer drives the balance.
    firstUnpaid: schedule.find((r) => !r.isPaid) ?? null,
    scheduleFailed: false,
  };
}

/**
 * Principal and interest in one payment. The split is optional when a payment
 * is recorded, so a payment saved without one takes it from the schedule: an
 * EMI pays that month's interest first and the rest goes to principal; a
 * prepayment or foreclosure is all principal.
 */
export function splitLoanPayment(
  payment: Pick<StoredPayment, 'paymentType' | 'paidOn' | 'amount' | 'principalPart' | 'interestPart' | 'forMonth'>,
  schedule: AmortizationRow[],
): { principal: Decimal; interest: Decimal } {
  const ZERO = new Decimal(0);
  if (payment.principalPart || payment.interestPart) {
    return {
      principal: payment.principalPart ? new Decimal(payment.principalPart.toString()) : ZERO,
      interest: payment.interestPart ? new Decimal(payment.interestPart.toString()) : ZERO,
    };
  }
  const amount = new Decimal(payment.amount.toString());
  if (payment.paymentType !== 'EMI') return { principal: amount, interest: ZERO };
  const month = payment.forMonth ?? dateToIso(payment.paidOn).slice(0, 7);
  const row = schedule.find((r) => r.date.slice(0, 7) === month);
  const interest = row ? Decimal.min(new Decimal(row.interestPart), amount) : ZERO;
  return { principal: amount.minus(interest), interest };
}

/**
 * Compute a high-level summary of the current loan state. `asOf` (default now) is the day the position is
 * taken on; the loan-check job passes its own clock.
 */
export function computeLoanSummary(loan: StoredLoan, asOf: Date = new Date()): LoanSummary {
  const ZERO = new Decimal(0);

  const schedule = buildAmortizationSchedule(loan);
  const today = new Date(asOf.getTime());
  today.setUTCHours(0, 0, 0, 0);

  // Total principal and interest paid from stored payments
  const emiPayments = loan.payments.filter((p) => p.paymentType === 'EMI' || p.paymentType === 'PREPAYMENT' || p.paymentType === 'FORECLOSURE');
  let totalPrincipalPaid = ZERO;
  let totalInterestPaid = ZERO;

  for (const p of emiPayments) {
    const split = splitLoanPayment(p, schedule);
    totalPrincipalPaid = totalPrincipalPaid.plus(split.principal);
    totalInterestPaid = totalInterestPaid.plus(split.interest);
  }

  // Outstanding balance: last closing balance in schedule before today (or principal if no schedule)
  let outstandingBalance = new Decimal(loan.principalAmount.toString());
  let nextEmiDate: string | null = null;
  let nextEmiAmount = new Decimal(loan.emiAmount.toString());
  let remainingEmiCount = 0;
  let totalInterestPayable = ZERO;
  let effectiveEndDate: string | null = null;

  if (schedule.length > 0) {
    const position = scheduleOutstanding(loan, schedule, today);
    const unpaidRows = position.upcoming;
    outstandingBalance = position.outstanding;
    if (unpaidRows.length > 0) {
      const firstUnpaid = unpaidRows[0]!;
      nextEmiDate = firstUnpaid.date;
      nextEmiAmount = new Decimal(firstUnpaid.emiAmount);
      remainingEmiCount = unpaidRows.length;
      totalInterestPayable = unpaidRows.reduce(
        (s, r) => s.plus(new Decimal(r.interestPart)),
        ZERO,
      );
      effectiveEndDate = unpaidRows[unpaidRows.length - 1]!.date;
    }
  }

  const remainingTenureMonths = remainingEmiCount;

  // Prepayment savings: interest in original full schedule vs. actual remaining
  const originalSchedule = buildAmortizationScheduleFromScratch(loan);
  const originalTotalInterest = originalSchedule.reduce(
    (s, r) => s.plus(new Decimal(r.interestPart)),
    ZERO,
  );
  const prepaymentSavingsDecimal = originalTotalInterest.minus(
    totalInterestPaid.plus(totalInterestPayable),
  );
  const prepaymentSavings = prepaymentSavingsDecimal.greaterThan(0)
    ? serializeMoney(prepaymentSavingsDecimal)
    : null;

  // Tax benefit
  const taxBenefit = computeTaxBenefit(loan, schedule, today);

  return {
    outstandingBalance: serializeMoney(outstandingBalance),
    totalPrincipalPaid: serializeMoney(totalPrincipalPaid),
    totalInterestPaid: serializeMoney(totalInterestPaid),
    nextEmiDate,
    nextEmiAmount: serializeMoney(nextEmiAmount),
    paidEmiCount: schedule.filter((r) => r.isPaid).length,
    // Rounding can leave a last few-rupee row past the tenure; it is not an EMI.
    scheduledEmiCount: Math.min(schedule.length, loan.tenureMonths),
    remainingEmiCount,
    remainingTenureMonths,
    totalInterestPayable: serializeMoney(totalInterestPayable),
    effectiveEndDate,
    prepaymentSavings,
    taxBenefit,
  };
}

/**
 * Prepayments and foreclosures made after the schedule's last row. The schedule
 * applies these before the next EMI, so once a foreclosure clears the balance
 * there is no next row to show them on.
 */
function principalPaidAfter(loan: StoredLoan, rowDate: string): Decimal {
  return loan.payments
    .filter((p) => (p.paymentType === 'PREPAYMENT' || p.paymentType === 'FORECLOSURE') && dateToIso(p.paidOn) > rowDate)
    .reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
}

/**
 * Build schedule without any payments (original plan) — used for prepayment savings calc.
 */
function buildAmortizationScheduleFromScratch(loan: StoredLoan): AmortizationRow[] {
  const loanWithoutPayments: StoredLoan = { ...loan, payments: [] };
  return buildAmortizationSchedule(loanWithoutPayments);
}

/**
 * No tax regime or slab is stored for the user, so the loan panel assumes the
 * old regime at the 30% slab and says so. Under the new regime none of these
 * deductions apply to a self-occupied home or an education loan.
 */
const TAX_ASSUMED_SLAB_PCT = '30';
const TAX_ASSUMPTION = 'Assumes the old tax regime at the 30% slab + 4% cess; nil under the new regime';
const EDUCATION_80E_YEARS = 8;

/**
 * This financial year's tax benefit for HOME (80C + 24(b), self-occupied) and
 * EDUCATION (80E) loans, from the same shared calculator the EMI Calculator
 * uses (`loanTaxBenefit`) so the two never show different figures: 4% cess on
 * the slab rate, 80C counting prepayments, 24(b) capped at Rs 2 lakh, and 80E
 * only for the first 8 years from the first repayment.
 */
function computeTaxBenefit(
  loan: StoredLoan,
  schedule: AmortizationRow[],
  today: Date,
): TaxBenefitSummary | null {
  const section = loan.taxBenefitSection;
  if (!section) return null;
  const isHome = HOME_LOAN_TAX_SECTIONS.has(section);
  if (!isHome && section !== '80E') return null;

  // The shared package's Decimal, built from strings, so no decimal.js
  // instance crosses the package boundary.
  const S = (v: string) => new SharedDecimal(v);
  const ZERO = S('0');
  const rows: ScheduleRow[] = schedule.map((r) => ({
    month: r.month, date: r.date, opening: S(r.openingBalance), emi: S(r.emiAmount),
    interest: S(r.interestPart), principal: S(r.principalPart), prepayment: ZERO,
    closing: S(r.closingBalance), ratePct: S(loan.interestRate.toString()),
  }));
  // Prepayments and foreclosures repay principal too, and 80C counts them.
  for (const p of loan.payments) {
    if (p.paymentType !== 'PREPAYMENT' && p.paymentType !== 'FORECLOSURE') continue;
    rows.push({
      month: 0, date: dateToIso(p.paidOn), opening: ZERO, emi: ZERO, interest: ZERO, principal: ZERO,
      prepayment: S(p.amount.toString()), closing: ZERO, ratePct: ZERO,
    });
  }
  // The calculator numbers financial years in the order it meets them and
  // counts 80E's 8 years from the first, so the rows must be in date order.
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const result = loanTaxBenefit(rows, {
    regime: 'OLD',
    loanKind: isHome ? 'HOME_SELF' : 'EDUCATION',
    slabPct: S(TAX_ASSUMED_SLAB_PCT),
    remaining80C: S('150000'),
  });
  const thisFy = indianFy(dateToIso(today));
  const fyIndex = result.years.findIndex((y) => y.fy === thisFy);
  const year = fyIndex >= 0 ? result.years[fyIndex]! : null;

  return {
    section: isHome ? '80C + 24(b)' : '80E',
    principalDeduction: isHome ? serializeMoney((year?.principalDeduction ?? ZERO).toString()) : null,
    interestDeduction: serializeMoney((year?.interestDeduction ?? ZERO).toString()),
    estimatedTaxSaving: serializeMoney((year?.taxSaved ?? ZERO).toString()),
    assumption: TAX_ASSUMPTION,
    note: !isHome && fyIndex >= EDUCATION_80E_YEARS
      ? 'Section 80E allows the interest deduction only for 8 years from the first repayment; that period has ended.'
      : null,
  };
}

// ── Loan type used with prisma include ───────────────────────────────────────

type LoanWithPayments = Awaited<ReturnType<typeof prisma.loan.findFirst>> & {
  payments: Array<{
    id: string;
    loanId: string;
    paymentType: string;
    paidOn: Date;
    amount: Prisma.Decimal;
    principalPart: Prisma.Decimal | null;
    interestPart: Prisma.Decimal | null;
    forMonth: string | null;
    canonicalEventId: string | null;
    notes: string | null;
    createdAt: Date;
  }>;
};


/**
 * Loan account numbers are returned masked.
 *
 * They used to ship in full on every list and detail response while the UI
 * only ever rendered the last four digits — so the complete number sat in the
 * network response, the React Query cache and devtools for a value nobody was
 * displaying. Bank accounts, credit cards and insurance policies in this same
 * codebase already mask and expose a separate audited reveal endpoint; loans
 * did not.
 */
/**
 * The edit dialog pre-fills the masked value it was given and sends it back
 * unchanged. Treating that as a new number overwrote the real one with
 * "••••6789", so a masked value means "unchanged".
 */
export function isMaskedAccountNumber(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes('•');
}

function maskAccountNumber(last4: string | null): string | null {
  return last4 ? `••••${last4}` : null;
}

/**
 * The response shape for a loan: the account number masked from its last
 * four, the ciphertext and last-4 columns never serialized.
 */
export function withMaskedAccount<
  T extends { accountNumber: string | null; accountNumberEnc: string | null; accountNumberLast4: string | null },
>(loan: T): Omit<T, 'accountNumberEnc' | 'accountNumberLast4'> {
  const { accountNumberEnc: _enc, accountNumberLast4, ...rest } = loan;
  const tail = accountNumberLast4 ?? (loan.accountNumber ? last4(loan.accountNumber) : null);
  return { ...rest, accountNumber: maskAccountNumber(tail) };
}

/**
 * Full loan account number, for the explicit reveal action only. Mirrors
 * bankAccounts.service: ownership-checked, and the caller audits.
 */
export async function revealLoanAccountNumber(userId: string, loanId: string): Promise<string | null> {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    select: { accountNumber: true, accountNumberEnc: true },
  });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);
  return readLoanAccountNumber(loan);
}

// ── Loan CRUD ────────────────────────────────────────────────────────────────

export async function listLoans(userId: string) {
  const loans = await prisma.loan.findMany({
    where: { userId },
    include: {
      payments: { orderBy: { paidOn: 'desc' }, take: 5 },
      vehicle: { select: { id: true, ...PLATE_SELECT, make: true, model: true } },
      rentalProperty: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return loans.map((l) => ({ ...withMaskedAccount(l), vehicle: l.vehicle ? revealVehicle(l.vehicle) : null }));
}

export async function getLoan(userId: string, loanId: string) {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: {
      payments: { orderBy: { paidOn: 'asc' } },
      vehicle: { select: { id: true, ...PLATE_SELECT, make: true, model: true } },
      rentalProperty: { select: { id: true, name: true } },
    },
  });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);
  return { ...withMaskedAccount(loan), vehicle: loan.vehicle ? revealVehicle(loan.vehicle) : null };
}

export async function createLoan(userId: string, input: CreateLoanInput) {
  const loan = await prisma.loan.create({
    data: {
      userId,
      lenderName: input.lenderName,
      ...(await loanAccountNumberColumns(input.accountNumber)),
      loanType: input.loanType,
      borrowerName: input.borrowerName,
      principalAmount: new Prisma.Decimal(input.principalAmount),
      interestRate: new Prisma.Decimal(input.interestRate),
      tenureMonths: input.tenureMonths,
      emiAmount: new Prisma.Decimal(input.emiAmount),
      emiDueDay: emiDueDayFrom(input.firstEmiDate),
      disbursementDate: toDate(input.disbursementDate),
      firstEmiDate: toDate(input.firstEmiDate),
      prepaymentOption: input.prepaymentOption ?? 'REDUCE_TENURE',
      vehicleId: input.vehicleId ?? null,
      rentalPropertyId: input.rentalPropertyId ?? null,
      portfolioId: input.portfolioId ?? null,
      taxBenefitSection: input.taxBenefitSection ?? null,
      status: input.status ?? 'ACTIVE',
      closedDate: input.closedDate ? toDate(input.closedDate) : null,
      lenderMatchKey: input.lenderMatchKey ?? null,
      ...resolveRateFields(input, null),
    },
  });
  return withMaskedAccount(loan);
}

export async function updateLoan(
  userId: string,
  loanId: string,
  input: UpdateLoanInput,
) {
  const existing = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!existing) throw new NotFoundError(`Loan ${loanId} not found`);

  const loan = await prisma.loan.update({
    where: { id: loanId },
    data: {
      ...(input.lenderName !== undefined && { lenderName: input.lenderName }),
      ...(input.accountNumber !== undefined &&
        !isMaskedAccountNumber(input.accountNumber) &&
        (await loanAccountNumberColumns(input.accountNumber))),
      ...(input.loanType !== undefined && { loanType: input.loanType }),
      ...(input.borrowerName !== undefined && { borrowerName: input.borrowerName }),
      ...(input.principalAmount !== undefined && {
        principalAmount: new Prisma.Decimal(input.principalAmount),
      }),
      ...(input.interestRate !== undefined && {
        interestRate: new Prisma.Decimal(input.interestRate),
      }),
      ...(input.tenureMonths !== undefined && { tenureMonths: input.tenureMonths }),
      ...(input.emiAmount !== undefined && { emiAmount: new Prisma.Decimal(input.emiAmount) }),
      ...(input.disbursementDate !== undefined && {
        disbursementDate: toDate(input.disbursementDate),
      }),
      ...(input.firstEmiDate !== undefined && {
        firstEmiDate: toDate(input.firstEmiDate),
        emiDueDay: emiDueDayFrom(input.firstEmiDate),
      }),
      ...(input.prepaymentOption !== undefined && { prepaymentOption: input.prepaymentOption }),
      ...(input.vehicleId !== undefined && { vehicleId: input.vehicleId }),
      ...(input.rentalPropertyId !== undefined && { rentalPropertyId: input.rentalPropertyId }),
      ...(input.portfolioId !== undefined && { portfolioId: input.portfolioId }),
      ...(input.taxBenefitSection !== undefined && { taxBenefitSection: input.taxBenefitSection }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.closedDate !== undefined && {
        closedDate: input.closedDate ? toDate(input.closedDate) : null,
      }),
      ...(input.lenderMatchKey !== undefined && { lenderMatchKey: input.lenderMatchKey }),
      ...resolveRateFields(input, existing),
    },
  });
  return withMaskedAccount(loan);
}

export async function deleteLoan(userId: string, loanId: string) {
  const existing = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!existing) throw new NotFoundError(`Loan ${loanId} not found`);
  await prisma.loan.delete({ where: { id: loanId } });
}

// ── Payment management ───────────────────────────────────────────────────────

export async function addPayment(
  userId: string,
  loanId: string,
  input: AddPaymentInput,
) {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
  });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);

  // Store the split even when the form left it blank, so every reader of
  // principalPart / interestPart (dashboard, accounting, tax) sees real parts.
  let principalPart = input.principalPart ?? null;
  let interestPart = input.interestPart ?? null;
  if (!principalPart && !interestPart && input.paymentType !== 'PROCESSING_FEE') {
    const split = splitLoanPayment(
      {
        paymentType: input.paymentType,
        paidOn: toDate(input.paidOn),
        amount: new Prisma.Decimal(input.amount),
        principalPart: null,
        interestPart: null,
        forMonth: input.forMonth ?? null,
      },
      buildAmortizationSchedule(loan as unknown as StoredLoan),
    );
    principalPart = split.principal.toFixed(2);
    interestPart = split.interest.toFixed(2);
  }

  const payment = await prisma.loanPayment.create({
    data: {
      loanId,
      paymentType: input.paymentType,
      paidOn: toDate(input.paidOn),
      amount: new Prisma.Decimal(input.amount),
      principalPart: principalPart ? new Prisma.Decimal(principalPart) : null,
      interestPart: interestPart ? new Prisma.Decimal(interestPart) : null,
      forMonth: input.forMonth ?? null,
      canonicalEventId: input.canonicalEventId ?? null,
      notes: input.notes ?? null,
    },
  });

  // Recording a foreclosure on an active loan closes it on that date.
  if (input.paymentType === 'FORECLOSURE' && loan.status === 'ACTIVE') {
    await prisma.loan.update({
      where: { id: loanId },
      data: { status: 'FORECLOSED', closedDate: toDate(input.paidOn) },
    });
  }
  return payment;
}

export async function deletePayment(userId: string, paymentId: string) {
  const payment = await prisma.loanPayment.findFirst({
    where: { id: paymentId },
    include: { loan: { select: { userId: true, status: true, closedDate: true } } },
  });
  if (!payment || payment.loan.userId !== userId) {
    throw new NotFoundError(`LoanPayment ${paymentId} not found`);
  }
  await prisma.loanPayment.delete({ where: { id: paymentId } });

  // Removing the foreclosure that closed the loan reopens it.
  const closedByThis =
    payment.paymentType === 'FORECLOSURE' &&
    payment.loan.status === 'FORECLOSED' &&
    payment.loan.closedDate?.getTime() === payment.paidOn.getTime();
  if (closedByThis) {
    await prisma.loan.update({ where: { id: payment.loanId }, data: { status: 'ACTIVE', closedDate: null } });
  }
}

// ── Computed views ───────────────────────────────────────────────────────────

export async function getLoanSummary(userId: string, loanId: string): Promise<LoanSummary> {
  const loan = (await getLoan(userId, loanId)) as unknown as LoanWithPayments;
  return computeLoanSummary(loan as unknown as StoredLoan);
}

export async function getAmortization(
  userId: string,
  loanId: string,
): Promise<AmortizationRow[]> {
  const loan = (await getLoan(userId, loanId)) as unknown as LoanWithPayments;
  return buildAmortizationSchedule(loan as unknown as StoredLoan);
}

// ── Alert scanner ────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which EMI, if any, deserves an alert today. A missed EMI comes first: the
 * latest one that fell due after the loan was added to the app and is at most
 * OVERDUE_WINDOW_DAYS late. Otherwise the next unpaid EMI, when today is one
 * of the reminder thresholds before it.
 */
export function pickEmiAlert(
  schedule: AmortizationRow[],
  today: Date,
  addedOn: Date,
): { row: AmortizationRow; daysLeft: number; isOverdue: boolean } | null {
  const day = new Date(today.getTime());
  day.setUTCHours(0, 0, 0, 0);
  const todayStr = dateToIso(day);
  const addedStr = dateToIso(addedOn);
  const daysUntil = (row: AmortizationRow) =>
    Math.round((new Date(`${row.date}T00:00:00Z`).getTime() - day.getTime()) / DAY_MS);

  const missed = schedule
    .filter((r) => !r.isPaid && r.date < todayStr && r.date >= addedStr && -daysUntil(r) <= OVERDUE_WINDOW_DAYS)
    .pop();
  if (missed) return { row: missed, daysLeft: daysUntil(missed), isOverdue: true };

  const next = schedule.find((r) => !r.isPaid && r.date >= todayStr);
  if (!next) return null;
  const daysLeft = daysUntil(next);
  if (!(ALERT_THRESHOLDS as readonly number[]).includes(daysLeft)) return null;
  return { row: next, daysLeft, isOverdue: false };
}

/** The EMI due day is the day of the month of the first EMI; the schedule falls on it. */
export function emiDueDayFrom(firstEmiDate: string): number {
  return Number.parseInt(firstEmiDate.slice(8, 10), 10);
}

/**
 * For every ACTIVE loan, compute the next EMI date and create Alert rows
 * for approaching EMIs. Follows the same pattern as generateRenewalAlerts()
 * in insurance.service.ts.
 */
export async function generateLoanEmiAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const loans = await prisma.loan.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: 'ACTIVE',
    },
    include: {
      payments: { orderBy: { paidOn: 'asc' } },
    },
  });

  let created = 0;

  for (const loan of loans) {
    let schedule: AmortizationRow[];
    try {
      schedule = buildAmortizationSchedule(loan as unknown as StoredLoan);
    } catch (err) {
      logger.warn(
        { loanId: loan.id, err: err instanceof Error ? err.message : String(err) },
        '[loans] failed to build schedule for alert scan — skipping',
      );
      continue;
    }

    const pick = pickEmiAlert(schedule, today, loan.createdAt);
    if (!pick) continue;
    const { row: nextUnpaid, daysLeft, isOverdue } = pick;
    const daysLabel = Math.abs(daysLeft);

    const metaKey = `loan_emi:${loan.id}:${nextUnpaid.date}:${isOverdue ? 'overdue' : `${daysLeft}d`}`;

    const existing = await prisma.alert.findFirst({
      where: {
        userId: loan.userId,
        type: 'LOAN_EMI_DUE',
        metadata: { path: ['key'], equals: metaKey },
      },
    });
    if (existing) continue;

    const title = isOverdue
      ? `${loan.lenderName} EMI overdue by ${daysLabel} day${daysLabel !== 1 ? 's' : ''}`
      : daysLeft === 0
        ? `${loan.lenderName} EMI due today`
        : `${loan.lenderName} EMI due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;

    const emiDisplay = new Decimal(nextUnpaid.emiAmount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const description = `EMI of ₹${emiDisplay} ${isOverdue ? 'was due on' : 'due on'} ${nextUnpaid.date}`;

    await prisma.alert.create({
      data: {
        userId: loan.userId,
        type: 'LOAN_EMI_DUE',
        title,
        description,
        triggerDate: new Date(),
        metadata: {
          key: metaKey,
          loanId: loan.id,
          lenderName: loan.lenderName,
          emiDate: nextUnpaid.date,
          emiAmount: nextUnpaid.emiAmount,
          daysLeft,
          isOverdue,
        },
      },
    });
    created++;
  }

  return created;
}
