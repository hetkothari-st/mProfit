import type { Decimal } from '../decimal.js';

export type EmiMode = 'REDUCE_EMI' | 'REDUCE_TENURE';

export interface Prepayment {
  /** Applied right after this month's EMI. */
  month: number;
  amount: Decimal;
  recurrence: 'ONCE' | 'YEARLY';
  mode: EmiMode;
}

export interface RateChange {
  /** The new rate applies to this month's interest onwards. */
  fromMonth: number;
  annualRatePct: Decimal;
  /** REDUCE_TENURE = keep the EMI and let the tenure move (banks' default). */
  mode: EmiMode;
}

export interface Fees {
  processingFeeKind: 'PCT' | 'AMOUNT';
  processingFeeValue: Decimal;
  gstPct: Decimal;
  otherCharges: Decimal;
}

export interface LoanInput {
  principal: Decimal;
  annualRatePct: Decimal;
  tenureMonths: number;
  /** 'YYYY-MM-DD' */
  firstEmiDate: string;
  /** Fixed starting EMI; tenure is then derived from it. */
  emiOverride?: Decimal;
  prepayments?: Prepayment[];
  rateChanges?: RateChange[];
  fees?: Fees;
}

export interface ScheduleRow {
  month: number;
  date: string;
  opening: Decimal;
  /** Amount actually paid as EMI this month (last row may be smaller). */
  emi: Decimal;
  interest: Decimal;
  principal: Decimal;
  prepayment: Decimal;
  closing: Decimal;
  ratePct: Decimal;
}

export type EmiWarning =
  | 'PREPAYMENT_CAPPED'
  | 'NEGATIVE_AMORTISATION_AVOIDED'
  | 'PREPAYMENT_AFTER_CLOSE'
  | 'RATE_CHANGE_AFTER_CLOSE'
  /** A keep-EMI change would run past month 480, so the EMI was raised to finish by then. */
  | 'TENURE_CAPPED';

export interface ScheduleResult {
  /** Starting EMI. */
  emi: Decimal;
  months: number;
  schedule: ScheduleRow[];
  totalInterest: Decimal;
  totalPrincipal: Decimal;
  totalPrepaid: Decimal;
  /** Every rupee paid: EMIs + prepayments. */
  totalPaid: Decimal;
  warnings: EmiWarning[];
}

export class EmiError extends Error {
  constructor(
    public readonly code: 'EMI_TOO_LOW' | 'INVALID_INPUT',
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'EmiError';
  }
}
