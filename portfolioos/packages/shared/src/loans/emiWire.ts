import { Decimal } from '../decimal.js';
import { EmiError, type EmiMode, type LoanInput } from './emi.types.js';
import { tenureForEmi } from './emi.js';
import { loanFees } from './apr.js';
import type { TaxInput, TaxLoanKind, TaxRegime } from './emiTax.js';

export interface PrepaymentWire { month: number; amount: string; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }
export interface RateChangeWire { fromMonth: number; annualRatePct: string; mode: EmiMode }
export interface FeesWire { processingFeeKind: 'PCT' | 'AMOUNT'; processingFeeValue: string; gstPct: string; otherCharges: string }
export interface LoanInputWire {
  principal: string;
  annualRatePct: string;
  tenureMonths: number;
  firstEmiDate: string;
  emiOverride?: string;
  prepayments?: PrepaymentWire[];
  rateChanges?: RateChangeWire[];
  fees?: FeesWire;
}
export interface TaxInputWire { regime: TaxRegime; loanKind: TaxLoanKind; slabPct: string; remaining80C: string }
export interface FieldError { field: string; message: string }

export const EMI_LIMITS = {
  maxPrincipal: new Decimal(1_000_000_000),
  maxRatePct: new Decimal(50),
  maxTenureMonths: 480,
  maxGstPct: new Decimal(28),
  maxFeePct: new Decimal(10),
  maxSlabPct: new Decimal(30),
  max80C: new Decimal(150000),
} as const;

/** Plain non-negative decimal; '.5' and '5.' are accepted (decimal.js parses both). */
const NUMBER = /^(\d+\.?\d*|\.\d+)$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "Rs 10,00,000.50" style input to "1000000.50". */
export function cleanNumber(s: string): string {
  return s.replace(/[,\s₹]/g, '');
}

function num(s: string | undefined): Decimal | null {
  if (s === undefined) return null;
  const c = cleanNumber(s);
  return NUMBER.test(c) ? new Decimal(c) : null;
}

function validDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const isMonth = (n: number) => Number.isInteger(n) && n >= 1 && n <= EMI_LIMITS.maxTenureMonths;

export function validateLoanWire(w: LoanInputWire): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });

  const p = num(w.principal);
  if (!p || p.lte(0)) add('principal', 'Enter a loan amount above 0');
  else if (p.gt(EMI_LIMITS.maxPrincipal)) add('principal', 'Loan amount can be at most Rs. 100 crore');

  const r = num(w.annualRatePct);
  if (!r || r.gt(EMI_LIMITS.maxRatePct)) add('annualRatePct', 'Rate must be between 0% and 50%');

  if (!isMonth(w.tenureMonths)) add('tenureMonths', 'Tenure must be 1-480 months');
  if (!validDate(w.firstEmiDate)) add('firstEmiDate', 'Pick a valid first EMI date');

  if (w.emiOverride !== undefined) {
    const e = num(w.emiOverride);
    if (!e || e.lte(0)) add('emiOverride', 'Enter an EMI above 0');
    else if (p && p.gt(0) && p.lte(EMI_LIMITS.maxPrincipal) && r && r.lte(EMI_LIMITS.maxRatePct)) {
      // The schedule's own length comes from this EMI, so the tenure limit applies to it too.
      try {
        if (tenureForEmi(p, e, r) > EMI_LIMITS.maxTenureMonths) add('emi', 'This EMI takes longer than 40 years to repay');
      } catch (err) {
        if (!(err instanceof EmiError)) throw err;
        add('emi', err.message);
      }
    }
  }

  (w.prepayments ?? []).forEach((pp, i) => {
    if (!isMonth(pp.month)) add(`prepayments.${i}.month`, 'Month must be 1-480');
    const a = num(pp.amount);
    if (!a || a.lte(0)) add(`prepayments.${i}.amount`, 'Enter an amount above 0');
  });

  const rateChangeMonths = new Set<number>();
  (w.rateChanges ?? []).forEach((rc, i) => {
    if (!isMonth(rc.fromMonth)) add(`rateChanges.${i}.fromMonth`, 'Month must be 1-480');
    else if (rateChangeMonths.has(rc.fromMonth)) add(`rateChanges.${i}.fromMonth`, 'Only one rate change per month');
    else rateChangeMonths.add(rc.fromMonth);
    const nr = num(rc.annualRatePct);
    if (!nr || nr.gt(EMI_LIMITS.maxRatePct)) add(`rateChanges.${i}.annualRatePct`, 'Rate must be between 0% and 50%');
  });

  if (w.fees) {
    const fv = num(w.fees.processingFeeValue);
    if (!fv) add('fees.processingFeeValue', 'Enter a fee (0 if none)');
    else if (w.fees.processingFeeKind === 'PCT' && fv.gt(EMI_LIMITS.maxFeePct)) add('fees.processingFeeValue', 'Fee can be at most 10%');
    const g = num(w.fees.gstPct);
    if (!g || g.gt(EMI_LIMITS.maxGstPct)) add('fees.gstPct', 'GST must be 0-28%');
    const oc = num(w.fees.otherCharges);
    if (!oc) add('fees.otherCharges', 'Enter other charges (0 if none)');
    if (p && p.gt(0) && fv && g && oc && !errors.some((x) => x.field.startsWith('fees.'))) {
      const total = loanFees(p, { processingFeeKind: w.fees.processingFeeKind, processingFeeValue: fv, gstPct: g, otherCharges: oc }).total;
      if (total.gte(p)) add('fees.processingFeeValue', "Fees can't be more than the loan");
    }
  }
  return errors;
}

export function validateTaxWire(t: TaxInputWire): FieldError[] {
  const errors: FieldError[] = [];
  const s = num(t.slabPct);
  if (!s || s.gt(EMI_LIMITS.maxSlabPct)) errors.push({ field: 'tax.slabPct', message: 'Tax slab must be 0-30%' });
  const c = num(t.remaining80C);
  if (!c || c.gt(EMI_LIMITS.max80C)) errors.push({ field: 'tax.remaining80C', message: '80C room must be Rs. 0 - 1,50,000' });
  return errors;
}

const dec = (s: string) => new Decimal(cleanNumber(s));

/** Call only after `validateLoanWire` returned no errors. */
export function loanFromWire(w: LoanInputWire): LoanInput {
  return {
    principal: dec(w.principal),
    annualRatePct: dec(w.annualRatePct),
    tenureMonths: w.tenureMonths,
    firstEmiDate: w.firstEmiDate,
    emiOverride: w.emiOverride !== undefined ? dec(w.emiOverride) : undefined,
    prepayments: w.prepayments?.map((p) => ({ month: p.month, amount: dec(p.amount), recurrence: p.recurrence, mode: p.mode })),
    rateChanges: w.rateChanges?.map((c) => ({ fromMonth: c.fromMonth, annualRatePct: dec(c.annualRatePct), mode: c.mode })),
    fees: w.fees && {
      processingFeeKind: w.fees.processingFeeKind,
      processingFeeValue: dec(w.fees.processingFeeValue),
      gstPct: dec(w.fees.gstPct),
      otherCharges: dec(w.fees.otherCharges),
    },
  };
}

/** Call only after `validateTaxWire` returned no errors. */
export function taxFromWire(t: TaxInputWire): TaxInput {
  return { regime: t.regime, loanKind: t.loanKind, slabPct: dec(t.slabPct), remaining80C: dec(t.remaining80C) };
}
