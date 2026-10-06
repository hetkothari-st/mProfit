import { Decimal } from 'decimal.js';

/**
 * Advance-tax instalment schedule for an individual (sec 208–211, 234C).
 *
 * Pure arithmetic: the caller supplies the tax due on income booked by each
 * instalment date, this turns it into what should have been paid by when, and
 * what the shortfall costs.
 *
 * Two rules shape it:
 *
 * 1. The instalments are cumulative — 15% by 15 June, 45% by 15 September,
 *    75% by 15 December and the whole amount by 15 March.
 * 2. Capital gains get a reprieve (the proviso to sec 234C): a gain cannot be
 *    foreseen, so it is only payable from the instalment that FALLS DUE AFTER
 *    the gain arises. That is why the caller passes tax *as at each date*
 *    rather than one year-end total — a March sale does not make June late.
 *
 * Interest under 234C is 1% per month: three months on each of the first three
 * shortfalls, one month on the last. It is an estimate, not a demand — the
 * department computes on the full return, which this app has never seen.
 */

export const INSTALMENTS = [
  { label: '15 June', month: 5, day: 15, cumulativePct: 15 },
  { label: '15 September', month: 8, day: 15, cumulativePct: 45 },
  { label: '15 December', month: 11, day: 15, cumulativePct: 75 },
  { label: '15 March', month: 2, day: 15, cumulativePct: 100 },
] as const;

/** Months of 1% interest charged on a shortfall at each instalment. */
const INTEREST_MONTHS = [3, 3, 3, 1];

/**
 * Advance tax is not payable at all below this liability (sec 208), so a small
 * capital gain does not turn into a compliance chore.
 */
export const ADVANCE_TAX_THRESHOLD = 10000;

export type InstalmentStatus = 'upcoming' | 'due' | 'met';

export interface Instalment {
  label: string;
  dueDate: string;
  cumulativePct: number;
  /** Cumulative tax that should have been paid by this date. */
  cumulativeDue: string;
  /** Shortfall at this date given what has been paid so far. */
  shortfall: string;
  /** Estimated 234C interest on that shortfall. */
  interest: string;
  status: InstalmentStatus;
}

export interface AdvanceTaxSchedule {
  instalments: Instalment[];
  /** Tax on everything booked so far this year. */
  totalTax: string;
  /** Payable now, after what has been paid. */
  payableNow: string;
  /** Estimated 234C interest across every missed instalment. */
  estimatedInterest: string;
  /** True when the liability is under the sec 208 threshold. */
  belowThreshold: boolean;
}

export interface AdvanceTaxInput {
  /** FY start year: 2026 means FY 2026-27. */
  fyStartYear: number;
  /**
   * Tax on income booked by each instalment date, in instalment order. The
   * capital-gains proviso lives here: a gain booked in December contributes
   * nothing to the June figure.
   */
  taxAsAt: [Decimal, Decimal, Decimal, Decimal];
  /** Advance tax already paid (TDS, self-assessment). Usually zero — we can't see it. */
  paid?: Decimal;
  asOf: Date;
}

function dueDateOf(fyStartYear: number, index: number): Date {
  const inst = INSTALMENTS[index]!;
  // Only the March instalment falls in the next calendar year.
  const year = inst.month === 2 ? fyStartYear + 1 : fyStartYear;
  return new Date(Date.UTC(year, inst.month, inst.day));
}

export function advanceTaxSchedule(input: AdvanceTaxInput): AdvanceTaxSchedule {
  const paid = input.paid ?? new Decimal(0);
  const totalTax = input.taxAsAt[input.taxAsAt.length - 1]!;
  const belowThreshold = totalTax.lessThan(ADVANCE_TAX_THRESHOLD);

  const instalments: Instalment[] = [];
  let estimatedInterest = new Decimal(0);

  for (let i = 0; i < INSTALMENTS.length; i++) {
    const meta = INSTALMENTS[i]!;
    const due = dueDateOf(input.fyStartYear, i);
    const passed = input.asOf.getTime() > due.getTime();

    // Only income visible by this date counts towards this instalment.
    const cumulativeDue = belowThreshold
      ? new Decimal(0)
      : input.taxAsAt[i]!.times(meta.cumulativePct).dividedBy(100);
    const shortfall = Decimal.max(cumulativeDue.minus(paid), 0);

    // Interest only accrues once the date has gone by with the amount unpaid.
    const interest =
      passed && shortfall.greaterThan(0)
        ? shortfall.times(INTEREST_MONTHS[i]!).dividedBy(100)
        : new Decimal(0);
    estimatedInterest = estimatedInterest.plus(interest);

    instalments.push({
      label: meta.label,
      dueDate: due.toISOString().slice(0, 10),
      cumulativePct: meta.cumulativePct,
      cumulativeDue: cumulativeDue.toFixed(2),
      shortfall: shortfall.toFixed(2),
      interest: interest.toFixed(2),
      status: shortfall.lessThanOrEqualTo(0) ? 'met' : passed ? 'due' : 'upcoming',
    });
  }

  const payableNow = belowThreshold ? new Decimal(0) : Decimal.max(totalTax.minus(paid), 0);

  return {
    instalments,
    totalTax: totalTax.toFixed(2),
    payableNow: payableNow.toFixed(2),
    estimatedInterest: estimatedInterest.toFixed(2),
    belowThreshold,
  };
}
