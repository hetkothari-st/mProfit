import {
  Decimal, EmiError, cleanNumber, compareLoanOffers, formatINR, loanFromWire, maxLoanFor, summariseLoan, taxFromWire,
  tenureForEmi, validateLoanWire, validateTaxWire,
  type EmiMode, type FieldError, type LoanInputWire, type LoanSummary, type OfferComparison,
  type TaxInputWire, type TaxLoanKind, type TaxRegime,
} from '@everypaisa/shared';

export type CalcMode = 'EMI' | 'MAX_LOAN' | 'TENURE';
export interface PrepaymentRow { id: string; month: string; amount: string; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }
export interface RateChangeRow { id: string; fromMonth: string; ratePct: string; mode: EmiMode }
export interface CalcState {
  mode: CalcMode;
  principal: string;
  ratePct: string;
  tenure: string;
  tenureUnit: 'Y' | 'M';
  emi: string;
  firstEmiDate: string;
  prepayments: PrepaymentRow[];
  rateChanges: RateChangeRow[];
  feesOn: boolean;
  feeKind: 'PCT' | 'AMOUNT';
  feeValue: string;
  gstPct: string;
  otherCharges: string;
  taxOn: boolean;
  regime: TaxRegime;
  loanKind: TaxLoanKind;
  slabPct: string;
  remaining80C: string;
}
/** `formatINR` takes number | string; money stays Decimal until this display boundary. */
export const money = (d: Decimal): string => formatINR(d.toFixed(2));

export interface OfferState { label: string; principal: string; ratePct: string; tenure: string; tenureUnit: 'Y' | 'M'; feeKind: 'PCT' | 'AMOUNT'; feeValue: string; otherCharges: string }
export interface CompareState { offers: OfferState[] }

const pad = (n: number) => String(n).padStart(2, '0');

/** First EMI defaults to the 5th of next month, from the LOCAL calendar (not UTC). */
export function defaultCalcState(today: Date = new Date()): CalcState {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 5);
  return {
    mode: 'EMI', principal: '25,00,000', ratePct: '8.5', tenure: '20', tenureUnit: 'Y', emi: '25,000',
    firstEmiDate: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-05`,
    prepayments: [], rateChanges: [],
    feesOn: false, feeKind: 'PCT', feeValue: '0.5', gstPct: '18', otherCharges: '0',
    taxOn: false, regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '30', remaining80C: '1,50,000',
  };
}

export function defaultCompareState(): CompareState {
  const offer = (label: string, ratePct: string, feeValue: string): OfferState => ({
    label, principal: '25,00,000', ratePct, tenure: '20', tenureUnit: 'Y', feeKind: 'PCT', feeValue, otherCharges: '0',
  });
  return { offers: [offer('Offer A', '8.5', '0.5'), offer('Offer B', '8.35', '1')] };
}

/** "20" years -> 240; returns NaN for junk so the shared validator reports it. */
function months(value: string, unit: 'Y' | 'M'): number {
  const c = cleanNumber(value);
  if (!/^\d+$/.test(c)) return Number.NaN;
  return unit === 'Y' ? Number(c) * 12 : Number(c);
}
const intOrNaN = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
const positive = (s: string) => /^\d+(\.\d+)?$/.test(cleanNumber(s)) && new Decimal(cleanNumber(s)).gt(0);

export type CalcOutcome =
  | { ok: true; principal: Decimal; tenureMonths: number; summary: LoanSummary; wire: LoanInputWire; taxWire?: TaxInputWire }
  | { ok: false; errors: FieldError[] };

export function computeCalc(s: CalcState): CalcOutcome {
  let principal = s.principal;
  let tenureMonths = months(s.tenure, s.tenureUnit);
  let emiOverride: string | undefined;

  if (s.mode !== 'EMI' && !positive(s.emi)) return { ok: false, errors: [{ field: 'emi', message: 'Enter an EMI above 0' }] };
  if (s.mode === 'MAX_LOAN') {
    const rateOk = /^\d+(\.\d+)?$/.test(cleanNumber(s.ratePct));
    if (rateOk && Number.isInteger(tenureMonths) && tenureMonths >= 1) {
      principal = maxLoanFor(new Decimal(cleanNumber(s.emi)), new Decimal(cleanNumber(s.ratePct)), tenureMonths).toString();
    }
  }
  if (s.mode === 'TENURE') {
    emiOverride = cleanNumber(s.emi);
    if (positive(s.principal) && /^\d+(\.\d+)?$/.test(cleanNumber(s.ratePct))) {
      try {
        tenureMonths = tenureForEmi(new Decimal(cleanNumber(s.principal)), new Decimal(emiOverride), new Decimal(cleanNumber(s.ratePct)));
      } catch (err) {
        if (err instanceof EmiError) return { ok: false, errors: [{ field: 'emi', message: err.message }] };
        throw err;
      }
    }
  }

  const wire: LoanInputWire = {
    principal,
    annualRatePct: s.ratePct,
    tenureMonths,
    firstEmiDate: s.firstEmiDate,
    emiOverride,
    prepayments: s.prepayments.map((p) => ({ month: intOrNaN(p.month), amount: p.amount, recurrence: p.recurrence, mode: p.mode })),
    rateChanges: s.rateChanges.map((c) => ({ fromMonth: intOrNaN(c.fromMonth), annualRatePct: c.ratePct, mode: c.mode })),
    fees: s.feesOn ? { processingFeeKind: s.feeKind, processingFeeValue: s.feeValue, gstPct: s.gstPct, otherCharges: s.otherCharges } : undefined,
  };
  const taxWire: TaxInputWire | undefined = s.taxOn
    ? { regime: s.regime, loanKind: s.loanKind, slabPct: s.slabPct, remaining80C: s.remaining80C }
    : undefined;

  const errors = [...validateLoanWire(wire), ...(taxWire ? validateTaxWire(taxWire) : [])];
  if (errors.length > 0) return { ok: false, errors };
  try {
    const input = loanFromWire(wire);
    const summary = summariseLoan(input, taxWire ? taxFromWire(taxWire) : undefined);
    return { ok: true, principal: input.principal, tenureMonths, summary, wire, taxWire };
  } catch (err) {
    if (err instanceof EmiError) return { ok: false, errors: [{ field: err.field ?? 'principal', message: err.message }] };
    throw err;
  }
}

export type CompareOutcome = { ok: true; result: OfferComparison } | { ok: false; errors: FieldError[] };

export function computeCompare(c: CompareState, firstEmiDate: string, tax?: TaxInputWire): CompareOutcome {
  const errors: FieldError[] = [];
  const wires = c.offers.map((o, i): LoanInputWire => {
    const w: LoanInputWire = {
      principal: o.principal, annualRatePct: o.ratePct, tenureMonths: months(o.tenure, o.tenureUnit), firstEmiDate,
      fees: { processingFeeKind: o.feeKind, processingFeeValue: o.feeValue, gstPct: '18', otherCharges: o.otherCharges },
    };
    for (const e of validateLoanWire(w)) errors.push({ field: `offers.${i}.${e.field}`, message: e.message });
    return w;
  });
  const taxInput = tax && validateTaxWire(tax).length === 0 ? taxFromWire(tax) : undefined;
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, result: compareLoanOffers(wires.map((w, i) => ({ label: c.offers[i]!.label || `Offer ${i + 1}`, input: loanFromWire(w), tax: taxInput }))) };
}
