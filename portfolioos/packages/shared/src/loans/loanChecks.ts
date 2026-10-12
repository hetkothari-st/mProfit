/**
 * Existing-loan checks (EMI calculator plan 3, spec s6): the rate-type vocabulary, the mapping from a loan's
 * type to the market rates of Plan 2, the refinance comparison and the benchmark pass-through estimate.
 * Pure: the web card and the API's daily alert job both use it, so they always agree. Money and rates are
 * Decimal here and strings on the wire.
 */
import { Decimal } from '../decimal.js';
import { formatINR } from '../format/number.js';
import { buildEmiSchedule, emiFor, tenureForEmi } from './emi.js';
import { addMonthsIso } from './emiDates.js';
import { EmiError, type ScheduleRow } from './emi.types.js';
import type { RateLoanType } from './loanRates.js';

export const LOAN_RATE_TYPES = ['FIXED', 'FLOATING', 'UNKNOWN'] as const;
export type LoanRateType = (typeof LOAN_RATE_TYPES)[number];
export const LOAN_RATE_TYPE_LABELS: Record<LoanRateType, string> = {
  FIXED: 'Fixed',
  FLOATING: 'Floating',
  UNKNOWN: 'Not sure',
};

export const LOAN_RATE_BENCHMARKS = ['REPO', 'MCLR', 'OTHER'] as const;
export type LoanRateBenchmark = (typeof LOAN_RATE_BENCHMARKS)[number];
export const LOAN_RATE_BENCHMARK_LABELS: Record<LoanRateBenchmark, string> = {
  REPO: 'Repo rate (EBLR)',
  MCLR: 'MCLR',
  OTHER: 'Other / not sure',
};

export type BenchmarkKind = 'REPO' | 'MCLR';
/** Plan ruling 6: floating retail loans are linked to the lender's 1-year MCLR. */
export const MCLR_BENCHMARK_TENOR = '1Y';
/** Plan ruling 8: repo-linked loans reset at least quarterly (RBI EBLR rule); MCLR loans yearly. */
export const BENCHMARK_RESET_STEP_MONTHS = { REPO: 3, MCLR: 12 } as const;

/** spec s6.1. A Map, so prototype keys like "toString" never match. */
const LOAN_TYPE_TO_RATE_TYPE: ReadonlyMap<string, RateLoanType> = new Map<string, RateLoanType>([
  ['HOME', 'HOME'],
  ['CAR', 'CAR'],
  ['PERSONAL', 'PERSONAL'],
  ['EDUCATION', 'EDUCATION'],
  ['GOLD', 'GOLD'],
  ['LAS', 'LAS'],
  ['BUSINESS', 'BUSINESS'],
]);

/** The market loan type for a `Loan.loanType`; null (OTHER or unknown) means "No market data". */
export function rateLoanTypeForLoan(loanType: string): RateLoanType | null {
  return LOAN_TYPE_TO_RATE_TYPE.get(loanType) ?? null;
}

/** spec s6.3: a refinance alert needs the loan to be at least this far above the market's lowest rate. */
export const REFINANCE_MIN_GAP_PP = new Decimal('0.50');
/** spec s6.2: processing 0.5 % of outstanding + Rs 10,000 other charges (editable on the card, not stored). */
export const DEFAULT_SWITCHING_COSTS = { processingPct: '0.5', otherCharges: '10000' } as const;

export function switchingCost(outstanding: Decimal, processingPct: Decimal, otherCharges: Decimal): Decimal {
  return outstanding.times(processingPct).div(100).plus(otherCharges).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface MarketComparisonInput {
  outstanding: Decimal;
  remainingMonths: number;
  currentRatePct: Decimal;
  marketRatePct: Decimal;
  switchingCost: Decimal;
}

export interface MarketComparison {
  currentEmi: Decimal;
  newEmi: Decimal;
  currentInterest: Decimal;
  newInterest: Decimal;
  grossSaving: Decimal;
  switchingCost: Decimal;
  netSaving: Decimal;
  /** First month whose cumulative EMI saving covers the switching costs; null when switching does not pay. */
  breakEvenMonth: number | null;
}

/** Only totals and per-row EMIs are used, so the calendar position of the plan is irrelevant. */
const PLACEHOLDER_FIRST_EMI = '2000-01-01';

/**
 * spec s6.2: the outstanding balance re-amortised over the same remaining months at the current rate and at
 * the market rate (plan ruling 5). Null when there is nothing left to compare.
 */
export function compareWithMarket(input: MarketComparisonInput): MarketComparison | null {
  const { outstanding, remainingMonths } = input;
  if (!Number.isInteger(remainingMonths) || remainingMonths < 1 || !outstanding.greaterThan(0)) return null;
  const plan = (annualRatePct: Decimal) =>
    buildEmiSchedule({ principal: outstanding, annualRatePct, tenureMonths: remainingMonths, firstEmiDate: PLACEHOLDER_FIRST_EMI });
  const now = plan(input.currentRatePct);
  const next = plan(input.marketRatePct);
  const grossSaving = now.totalInterest.minus(next.totalInterest);
  const netSaving = grossSaving.minus(input.switchingCost);
  return {
    currentEmi: now.emi,
    newEmi: next.emi,
    currentInterest: now.totalInterest,
    newInterest: next.totalInterest,
    grossSaving,
    switchingCost: input.switchingCost,
    netSaving,
    breakEvenMonth: netSaving.greaterThan(0) ? breakEven(now.schedule, next.schedule, input.switchingCost) : null,
  };
}

function breakEven(current: ScheduleRow[], next: ScheduleRow[], cost: Decimal): number | null {
  let saved = new Decimal(0);
  const months = Math.max(current.length, next.length);
  for (let i = 0; i < months; i++) {
    saved = saved.plus(current[i]?.emi ?? 0).minus(next[i]?.emi ?? 0);
    if (saved.greaterThan(0) && saved.greaterThanOrEqualTo(cost)) return i + 1;
  }
  return null;
}

export interface PassThroughEstimate {
  newRatePct: Decimal;
  currentEmi: Decimal;
  /** EMI over the same remaining months at the new rate. */
  newEmi: Decimal;
  /** Months added (+) or saved (-) when the EMI is kept; null when the kept EMI would not cover interest. */
  tenureDeltaMonths: number | null;
}

/** spec s6.3: what a benchmark change does to this loan if the lender passes all of it on. */
export function passThroughEstimate(input: {
  outstanding: Decimal;
  remainingMonths: number;
  currentRatePct: Decimal;
  deltaPct: Decimal;
}): PassThroughEstimate | null {
  const { outstanding, remainingMonths } = input;
  if (!Number.isInteger(remainingMonths) || remainingMonths < 1 || !outstanding.greaterThan(0)) return null;
  const newRatePct = Decimal.max(0, input.currentRatePct.plus(input.deltaPct));
  const currentEmi = emiFor(outstanding, input.currentRatePct, remainingMonths);
  const newEmi = emiFor(outstanding, newRatePct, remainingMonths);
  let tenureDeltaMonths: number | null;
  try {
    tenureDeltaMonths = tenureForEmi(outstanding, currentEmi, newRatePct) - remainingMonths;
  } catch (err) {
    if (!(err instanceof EmiError) || err.code !== 'EMI_TOO_LOW') throw err;
    tenureDeltaMonths = null;
  }
  return { newRatePct, currentEmi, newEmi, tenureDeltaMonths };
}

/**
 * Plan ruling 8: the stored reset date rolled forward (3 months REPO, 12 months MCLR) until it is on or after
 * `from` ('YYYY-MM-DD'). Steps are taken from the original date so a 31st stays a 31st where it can.
 */
export function nextResetOnOrAfter(stored: string | null, from: string, kind: BenchmarkKind): string | null {
  if (stored === null) return null;
  const step = BENCHMARK_RESET_STEP_MONTHS[kind];
  let date = stored;
  for (let k = 1; date < from && k <= 400; k++) date = addMonthsIso(stored, k * step);
  return date;
}

/**
 * Rounded rupees for alert text: "₹2.1 lakh", "₹1.3 crore", below a lakh "₹45,000". The unit is chosen from
 * the rounded value, so 99,999.6 is "₹1 lakh" (not "₹1,00,000") and 99.96 lakh is "₹1 crore" (not "₹100 lakh");
 * an amount that rounds to zero is "₹0", never "-₹0".
 */
export function approxInr(amount: Decimal): string {
  const rupees = amount.abs().toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const sign = amount.isNegative() && !rupees.isZero() ? '-' : '';
  if (rupees.lessThan(100_000)) return `${sign}${formatINR(rupees.toFixed(0), { fractionDigits: 0 })}`;
  const inUnit = (size: number) => rupees.div(size).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  const lakhs = inUnit(100_000);
  const [value, word] = lakhs.lessThan(100) ? [lakhs, 'lakh'] : [inUnit(10_000_000), 'crore'];
  return `${sign}₹${value.toFixed(1).replace(/\.0$/, '')} ${word}`;
}

// ─── Wire shapes (GET /api/loans/:id/market-check, /api/notifications/preferences) ───

/** The best (lowest, not stale) effective market rate for the loan's type. */
export interface MarketRateWire {
  sourceId: string;
  lender: string;
  minRatePct: string;
  /** ISO instant the rate was last confirmed. */
  asOf: string;
  sourceUrl: string;
}

export interface BenchmarkSummaryWire {
  kind: BenchmarkKind;
  /** Canonical lender for MCLR; null for REPO. */
  lender: string | null;
  tenor: string | null;
  ratePct: string;
  effectiveDate: string;
  /** Null until the series has two different rates. deltaPct is signed: "-0.25" is a cut. */
  lastChange: { deltaPct: string; date: string } | null;
}

export interface LoanMarketCheckWire {
  loanId: string;
  status: string;
  loanType: string;
  /** Null = no market data for this loan type (OTHER). */
  rateLoanType: RateLoanType | null;
  /** Canonical lender matched from the loan's lender name; null = not one of the tracked lenders. */
  lender: string | null;
  rateType: LoanRateType;
  rateBenchmark: LoanRateBenchmark | null;
  nextRateResetDate: string | null;
  currentRatePct: string;
  /** From the loan's own schedule. */
  outstanding: string;
  remainingMonths: number;
  nextEmiDate: string | null;
  market: MarketRateWire | null;
  /** FLOATING loans with a REPO or MCLR benchmark (MCLR with an unmatched lender shows REPO). */
  benchmark: BenchmarkSummaryWire | null;
}

export interface LoanAlertPrefsWire {
  loanRateAlerts: boolean;
}
