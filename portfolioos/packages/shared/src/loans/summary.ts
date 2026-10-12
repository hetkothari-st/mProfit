import { Decimal } from '../decimal.js';
import { buildEmiSchedule } from './emi.js';
import { indianFy } from './emiDates.js';
import { loanApr, loanFees, type FeeSummary } from './apr.js';
import { loanTaxBenefit, type TaxInput, type TaxSummary } from './emiTax.js';
import type { LoanInput, ScheduleResult, ScheduleRow } from './emi.types.js';

export interface LoanSummary extends ScheduleResult {
  fees: FeeSummary;
  aprPct: Decimal;
  /** totalPaid + fees */
  totalCost: Decimal;
  tax?: TaxSummary;
  postTaxCost?: Decimal;
}

export function summariseLoan(input: LoanInput, tax?: TaxInput): LoanSummary {
  const result = buildEmiSchedule(input);
  const fees = loanFees(input.principal, input.fees);
  const aprPct = loanApr(input.principal.minus(fees.total), result.schedule);
  const totalCost = result.totalPaid.plus(fees.total);
  const summary: LoanSummary = { ...result, fees, aprPct, totalCost };
  if (tax) {
    summary.tax = loanTaxBenefit(result.schedule, tax);
    summary.postTaxCost = totalCost.minus(summary.tax.totalTaxSaved);
  }
  return summary;
}

export interface FyGroup {
  fy: string;
  rows: ScheduleRow[];
  emi: Decimal;
  interest: Decimal;
  principal: Decimal;
  prepayment: Decimal;
  /** Balance at the end of the FY (last row closing). */
  closing: Decimal;
}

export function groupScheduleByFy(rows: ScheduleRow[]): FyGroup[] {
  const groups: FyGroup[] = [];
  for (const r of rows) {
    const fy = indianFy(r.date);
    let g = groups.at(-1);
    if (!g || g.fy !== fy) {
      g = { fy, rows: [], emi: new Decimal(0), interest: new Decimal(0), principal: new Decimal(0), prepayment: new Decimal(0), closing: r.closing };
      groups.push(g);
    }
    g.rows.push(r);
    g.emi = g.emi.plus(r.emi);
    g.interest = g.interest.plus(r.interest);
    g.principal = g.principal.plus(r.principal);
    g.prepayment = g.prepayment.plus(r.prepayment);
    g.closing = r.closing;
  }
  return groups;
}

export interface OfferInput { label: string; input: LoanInput; tax?: TaxInput }
export interface OfferComparison {
  offers: (LoanSummary & { label: string })[];
  /** Index of the lowest total cost (EMIs + prepayments + fees). */
  cheapestTotal: number;
  /** Index of the lowest post-tax cost; null unless every offer has tax input. */
  cheapestPostTax: number | null;
}

const argMin = (values: Decimal[]) => values.reduce((best, v, i) => (v.lt(values[best]!) ? i : best), 0);

export function compareLoanOffers(offers: OfferInput[]): OfferComparison {
  const summaries = offers.map((o) => ({ ...summariseLoan(o.input, o.tax), label: o.label }));
  const allTaxed = summaries.every((s) => s.postTaxCost !== undefined);
  return {
    offers: summaries,
    cheapestTotal: argMin(summaries.map((s) => s.totalCost)),
    cheapestPostTax: allTaxed ? argMin(summaries.map((s) => s.postTaxCost!)) : null,
  };
}
