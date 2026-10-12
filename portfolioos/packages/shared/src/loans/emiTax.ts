import { Decimal } from '../decimal.js';
import { indianFy } from './emiDates.js';
import type { ScheduleRow } from './emi.types.js';

export type TaxRegime = 'OLD' | 'NEW';
export type TaxLoanKind = 'HOME_SELF' | 'HOME_LET_OUT' | 'EDUCATION' | 'NONE';
export interface TaxInput { regime: TaxRegime; loanKind: TaxLoanKind; slabPct: Decimal; remaining80C: Decimal }
export interface TaxYear {
  fy: string;
  interest: Decimal;
  principal: Decimal;
  interestDeduction: Decimal;
  principalDeduction: Decimal;
  carriedForward: Decimal;
  taxSaved: Decimal;
}
export interface TaxSummary { years: TaxYear[]; totalTaxSaved: Decimal; note?: string }

const ZERO = new Decimal(0);
const CAP_24B = new Decimal(200000);
const CESS = new Decimal('1.04');
const EDUCATION_YEARS = 8;

export function loanTaxBenefit(schedule: ScheduleRow[], tax: TaxInput): TaxSummary {
  const byFy = new Map<string, { interest: Decimal; principal: Decimal }>();
  for (const r of schedule) {
    const fy = indianFy(r.date);
    const acc = byFy.get(fy) ?? { interest: ZERO, principal: ZERO };
    // Section 80C counts every principal repayment, prepayments included.
    byFy.set(fy, { interest: acc.interest.plus(r.interest), principal: acc.principal.plus(r.principal).plus(r.prepayment) });
  }
  const rate = tax.slabPct.div(100).times(CESS);
  const noBenefit = tax.regime === 'NEW' || tax.loanKind === 'NONE';

  const years: TaxYear[] = [...byFy.entries()].map(([fy, s], index) => {
    let interestDeduction = ZERO;
    let principalDeduction = ZERO;
    let carriedForward = ZERO;
    if (!noBenefit) {
      if (tax.loanKind === 'HOME_SELF') {
        interestDeduction = Decimal.min(s.interest, CAP_24B);
        principalDeduction = Decimal.min(s.principal, tax.remaining80C);
      } else if (tax.loanKind === 'HOME_LET_OUT') {
        interestDeduction = Decimal.min(s.interest, CAP_24B);
        carriedForward = s.interest.minus(interestDeduction);
        principalDeduction = Decimal.min(s.principal, tax.remaining80C);
      } else if (tax.loanKind === 'EDUCATION' && index < EDUCATION_YEARS) {
        interestDeduction = s.interest;
      }
    }
    const taxSaved = interestDeduction.plus(principalDeduction).times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { fy, interest: s.interest, principal: s.principal, interestDeduction, principalDeduction, carriedForward, taxSaved };
  });

  const totalTaxSaved = years.reduce((a, y) => a.plus(y.taxSaved), ZERO);
  const note = tax.regime === 'NEW'
    ? 'No deduction under the new tax regime for this loan (self-occupied home loan interest and 80C/80E are not allowed).'
    : undefined;
  return { years, totalTaxSaved, note };
}
