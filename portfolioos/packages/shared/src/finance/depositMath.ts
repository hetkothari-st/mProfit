import { Decimal } from 'decimal.js';

/**
 * Bank FD / RD growth — the one formula the server's accrual
 * (holdingsProjection.computeFdAccruedValue), the deposit cards and the
 * deposit detail page all use, so the "At maturity" a user sees on the card,
 * on the detail page and in the portfolio value can never disagree.
 *
 *   value = P × (1 + r/n)^(n × years),  years = days / 365.25
 *
 * n is the deposit's compounding frequency. Indian banks compound term
 * deposits and RDs quarterly, so quarterly is the default and also what a
 * cumulative ("interest at maturity") FD gets. An RD is the sum of that
 * formula over each monthly installment, from its due date to maturity.
 */

const PERIODS_PER_YEAR: Record<string, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  ANNUAL: 1,
  // Cumulative FD: interest is paid out at maturity but compounds quarterly.
  AT_MATURITY: 4,
};

export const DEPOSIT_DEFAULT_PERIODS_PER_YEAR = 4;

/** Compounding periods per year for a stored `interestFrequency`. */
export function depositPeriodsPerYear(frequency: string | null | undefined): number {
  return (frequency && PERIODS_PER_YEAR[frequency]) || DEPOSIT_DEFAULT_PERIODS_PER_YEAR;
}

/** Human label for the compounding, e.g. "quarterly". */
export function depositCompoundingLabel(frequency: string | null | undefined): string {
  switch (depositPeriodsPerYear(frequency)) {
    case 12: return 'monthly';
    case 2: return 'half-yearly';
    case 1: return 'annually';
    default: return 'quarterly';
  }
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function toTime(d: Date | string): number {
  return typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() : d.getTime();
}

/** Years between two dates on the 365.25-day convention, to 6 dp. */
export function depositYearsBetween(start: Date | string, end: Date | string): Decimal {
  return new Decimal((toTime(end) - toTime(start)) / MS_PER_YEAR).toDP(6);
}

/**
 * Value of `principal` deposited on `start`, valued on `valuation`.
 * `annualRate` is a fraction (0.07 for 7%). On or before the start date the
 * principal is returned unchanged.
 */
export function compoundDeposit(opts: {
  principal: Decimal.Value;
  annualRate: Decimal.Value;
  start: Date | string;
  valuation: Date | string;
  periodsPerYear: number;
}): Decimal {
  const principal = new Decimal(opts.principal);
  const years = depositYearsBetween(opts.start, opts.valuation);
  if (years.lte(0)) return principal;
  const periodRate = new Decimal(opts.annualRate).div(opts.periodsPerYear);
  return principal.times(new Decimal(1).plus(periodRate).pow(years.times(opts.periodsPerYear)));
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Maturity value of a fixed deposit. Null when rate or dates are missing. */
export function fdMaturityValue(opts: {
  principal: Decimal.Value | null | undefined;
  ratePct: Decimal.Value | null | undefined;
  openDate: string | null | undefined;
  maturityDate: string | null | undefined;
  frequency: string | null | undefined;
}): Decimal | null {
  const { principal, ratePct, openDate, maturityDate } = opts;
  if (principal == null || principal === '' || ratePct == null || ratePct === '' || !openDate || !maturityDate) {
    return null;
  }
  if (maturityDate.slice(0, 10) <= openDate.slice(0, 10)) return null;
  return compoundDeposit({
    principal,
    annualRate: new Decimal(ratePct).div(100),
    start: openDate,
    valuation: maturityDate,
    periodsPerYear: depositPeriodsPerYear(opts.frequency),
  });
}

/**
 * Maturity value of a recurring deposit: `tenureMonths` equal installments,
 * the k-th paid k months after `openDate`, each compounding to maturity.
 */
export function rdMaturityValue(opts: {
  installment: Decimal.Value | null | undefined;
  ratePct: Decimal.Value | null | undefined;
  openDate: string | null | undefined;
  maturityDate: string | null | undefined;
  tenureMonths: number | null | undefined;
  frequency: string | null | undefined;
}): Decimal | null {
  const { installment, ratePct, openDate, maturityDate, tenureMonths } = opts;
  if (
    installment == null || installment === '' || ratePct == null || ratePct === '' ||
    !openDate || !maturityDate || !tenureMonths || tenureMonths <= 0
  ) {
    return null;
  }
  const annualRate = new Decimal(ratePct).div(100);
  const periodsPerYear = depositPeriodsPerYear(opts.frequency);
  let total = new Decimal(0);
  for (let k = 0; k < tenureMonths; k++) {
    total = total.plus(
      compoundDeposit({
        principal: installment,
        annualRate,
        start: addMonthsIso(openDate, k),
        valuation: maturityDate,
        periodsPerYear,
      }),
    );
  }
  return total;
}
