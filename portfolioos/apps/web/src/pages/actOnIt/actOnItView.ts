import { Decimal, formatINR } from '@everypaisa/shared';
import type { AdviceOutcome, AdviceRiskBand, AdviceState } from '@everypaisa/shared';

/** Pure helpers for the Act on it page. Money arrives as strings; Decimal for any maths. */

/** Where ₹amount ends after a year on each path, and the gap (straight lines on the chart). */
export function twoPathEnds(amountInr: string, doNothingRatePct: number, actRatePct: number) {
  const a = new Decimal(amountInr);
  const dn = a.times(1 + doNothingRatePct / 100);
  const act = a.times(1 + actRatePct / 100);
  return { doNothing: dn.toFixed(2), act: act.toFixed(2), gap: act.minus(dn).toFixed(2) };
}

/** A history bar's length: this result's share (percent) of the largest absolute result. */
export function barShare(value: string | null, all: (string | null)[]): number {
  if (value === null) return 0;
  const max = all.filter((v): v is string => v !== null).reduce((m, v) => Decimal.max(m, new Decimal(v).abs()), new Decimal(0));
  if (max.isZero()) return 0;
  return Math.min(100, new Decimal(value).abs().dividedBy(max).times(100).toNumber());
}

const STATE: Record<AdviceState, string> = {
  OPEN: 'Waiting for you',
  SNOOZED: 'Later',
  ACCEPTED: 'You accepted, not seen yet',
  CONFIRMED: 'Confirmed in your data',
  CONFIRMED_BY_USER: 'Done, by your word',
  SKIPPED: 'Skipped',
  WITHDRAWN: 'No longer applies',
  BEFORE_TRACKING: 'Before tracking began',
};
export const stateLabel = (s: AdviceState) => STATE[s];

export function outcomeLabel(o: AdviceOutcome, value: string | null): string {
  switch (o) {
    case 'GAINED':
      return `+${formatINR(value!, { fractionDigits: 0 })}`;
    case 'MISSED':
      return `Missed ${formatINR(new Decimal(value!).abs().toFixed(2), { fractionDigits: 0 })}`;
    case 'WAITING':
      return 'Waiting';
    case 'PENDING':
      return 'Result due later';
    case 'NOT_MEASURED':
      return 'Not measured';
    case 'BEFORE_TRACKING':
      return 'Not tracked';
    default:
      return '';
  }
}

/** Filled steps (of 5) on the risk meter. */
export const riskSteps = (r: AdviceRiskBand) => (r === 'LOW' ? 1 : r === 'MEDIUM' ? 3 : 5);

/** "₹1.8 lakh" for amounts of a lakh or more, else "₹62,400". */
export function shortInr(v: string): string {
  const d = new Decimal(v);
  if (d.abs().greaterThanOrEqualTo(100_000)) {
    const lakh = d.dividedBy(100_000).toDecimalPlaces(2).toString();
    return `₹${lakh} lakh`;
  }
  return formatINR(d.toFixed(2), { fractionDigits: 0 });
}

export const CATEGORY_LABEL: Record<string, string> = {
  IDLE_CASH_PARKING: 'Idle savings',
  CASH_DEPLOYMENT: 'Spare cash',
  REGULAR_TO_DIRECT: 'Regular to direct',
  LTCG_BOOKING: 'Tax-free gains',
  TAX_HARVEST: 'Tax-loss harvest',
  STOPPED_SIP: 'SIP in a dip',
  FD_MATURITY: 'FD maturing',
  LOAN_REFINANCE: 'Loan rate',
  ADVANCE_TAX: 'Advance tax',
  EMERGENCY_FUND: 'Safety net',
  HEALTH_COVER: 'Health cover',
  FUND_UNDERPERFORMING: 'Weak fund',
  REBALANCE: 'Rebalance',
  CONCENTRATION_TRIM: 'Too much in one',
  GOAL_SHORTFALL_SIP: 'Goal on track',
  RISK_PROFILE_REVIEW: 'Risk profile',
};
