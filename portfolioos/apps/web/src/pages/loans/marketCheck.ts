import {
  DEFAULT_SWITCHING_COSTS, Decimal, EMI_LIMITS, cleanNumber, compareWithMarket, formatDateOnly, switchingCost,
  type BenchmarkSummaryWire, type LoanMarketCheckWire, type MarketComparison, type MarketRateWire,
} from '@everypaisa/shared';
import { NUMBER_TEXT, defaultCalcState, defaultCompareState, groupedWhole, type CalcState } from '@/pages/emi/emiState';
import { encodeEmiUrl } from '@/pages/emi/emiUrl';
import { loanKindForRate } from '@/pages/emi/liveRates';

/** Editable on the card, never stored (spec s6.2). Text as typed. */
export interface SwitchingInput {
  processingPct: string;
  otherCharges: string;
}

export const DEFAULT_SWITCHING_INPUT: SwitchingInput = {
  processingPct: DEFAULT_SWITCHING_COSTS.processingPct,
  otherCharges: groupedWhole(DEFAULT_SWITCHING_COSTS.otherCharges),
};

type CostField = 'processingPct' | 'otherCharges';

export function parseCosts(
  c: SwitchingInput,
): { ok: true; processingPct: Decimal; otherCharges: Decimal } | { ok: false; field: CostField; message: string } {
  const pct = cleanNumber(c.processingPct);
  if (!NUMBER_TEXT.test(pct) || new Decimal(pct).greaterThan(EMI_LIMITS.maxFeePct)) {
    return { ok: false, field: 'processingPct', message: 'Enter a processing fee between 0 and 10%' };
  }
  const other = cleanNumber(c.otherCharges);
  if (!NUMBER_TEXT.test(other) || new Decimal(other).greaterThan(EMI_LIMITS.maxPrincipal)) {
    return { ok: false, field: 'otherCharges', message: 'Enter other charges in rupees' };
  }
  return { ok: true, processingPct: new Decimal(pct), otherCharges: new Decimal(other) };
}

export type CardModel =
  | { kind: 'NO_MARKET_DATA' }
  | { kind: 'NO_RATES' }
  | { kind: 'CLOSED' }
  | { kind: 'AT_OR_BELOW'; current: Decimal; market: MarketRateWire }
  | { kind: 'INVALID_COSTS'; current: Decimal; market: MarketRateWire; field: CostField; message: string }
  | { kind: 'READY'; current: Decimal; market: MarketRateWire; result: MarketComparison };

export function cardModel(check: LoanMarketCheckWire, costs: SwitchingInput): CardModel {
  if (check.rateLoanType === null) return { kind: 'NO_MARKET_DATA' };
  if (check.market === null) return { kind: 'NO_RATES' };
  const outstanding = new Decimal(check.outstanding);
  if (check.remainingMonths < 1 || !outstanding.greaterThan(0)) return { kind: 'CLOSED' };
  const current = new Decimal(check.currentRatePct);
  const marketRate = new Decimal(check.market.minRatePct);
  if (!marketRate.lessThan(current)) return { kind: 'AT_OR_BELOW', current, market: check.market };
  const parsed = parseCosts(costs);
  if (!parsed.ok) return { kind: 'INVALID_COSTS', current, market: check.market, field: parsed.field, message: parsed.message };
  const result = compareWithMarket({
    outstanding,
    remainingMonths: check.remainingMonths,
    currentRatePct: current,
    marketRatePct: marketRate,
    switchingCost: switchingCost(outstanding, parsed.processingPct, parsed.otherCharges),
  });
  return result === null ? { kind: 'CLOSED' } : { kind: 'READY', current, market: check.market, result };
}

/**
 * "Open in calculator" (spec s6.2): the Plan 1 share URL with the outstanding balance at the market rate over
 * the remaining months, the switching costs as a processing fee (GST 0 - plan ruling 5) plus other charges.
 * Null when the calculator could not take it (no market rate, 0 or > 480 months, invalid costs).
 */
export function calculatorHref(check: LoanMarketCheckWire, costs: SwitchingInput, today: Date = new Date()): string | null {
  if (check.market === null || check.rateLoanType === null) return null;
  if (check.remainingMonths < 1 || check.remainingMonths > EMI_LIMITS.maxTenureMonths) return null;
  const outstanding = new Decimal(check.outstanding);
  if (!outstanding.greaterThan(0)) return null;
  const parsed = parseCosts(costs);
  if (!parsed.ok) return null;
  const base = defaultCalcState(today);
  const calc: CalcState = {
    ...base,
    mode: 'EMI',
    principal: groupedWhole(outstanding.toFixed(0)),
    ratePct: check.market.minRatePct,
    tenure: String(check.remainingMonths),
    tenureUnit: 'M',
    firstEmiDate: check.nextEmiDate ?? base.firstEmiDate,
    feesOn: true,
    feeKind: 'PCT',
    feeValue: parsed.processingPct.toString(),
    gstPct: '0',
    otherCharges: parsed.otherCharges.toString(),
    loanKind: loanKindForRate(check.rateLoanType, base.loanKind),
  };
  return `/emi?${encodeEmiUrl('calculate', calc, defaultCompareState())}`;
}

/** "RBI repo rate 5.25% - cut by 0.25% on 08/10/2026"; a zero or missing change reads "(as of ...)". */
export function benchmarkLine(b: BenchmarkSummaryWire): string {
  const name = b.kind === 'REPO' ? 'RBI repo rate' : `${b.lender ?? 'Lender'} 1-year MCLR`;
  const delta = b.lastChange === null ? null : new Decimal(b.lastChange.deltaPct);
  if (b.lastChange === null || delta === null || delta.isZero()) return `${name} ${b.ratePct}% (as of ${formatDateOnly(b.effectiveDate)})`;
  return `${name} ${b.ratePct}% - ${delta.isNegative() ? 'cut' : 'raised'} by ${delta.abs().toFixed(2)}% on ${formatDateOnly(b.lastChange.date)}`;
}
