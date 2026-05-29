import { Decimal } from 'decimal.js';

/**
 * Pure math for the what-if sale simulator (3c). Read-only, informational —
 * computes the outcome of a hypothetical sale, never recommends one. Uses the
 * weighted-average cost basis (matches HoldingProjection); FIFO lot matching
 * is the tax-report's job, not the quick simulator's.
 */

const EQUITY_TYPE: ReadonlySet<string> = new Set(['EQUITY', 'ETF', 'MUTUAL_FUND']);

/** Long-term holding thresholds (months) by class — mirrors tax.service. */
function ltMonths(assetClass: string): number {
  if (EQUITY_TYPE.has(assetClass)) return 12;
  if (assetClass === 'FOREIGN_EQUITY') return 24;
  return 36;
}

export function isLongTerm(assetClass: string, holdingPeriodDays: number): boolean {
  return holdingPeriodDays >= ltMonths(assetClass) * 30;
}

export interface SaleSimInput {
  assetClass: string;
  avgCost: Decimal;
  sellQty: Decimal;
  sellPrice: Decimal;
  holdingPeriodDays: number;
  rates: { stcgEquityPct: number; ltcgEquityPct: number; ltcgOtherPct: number };
}

export interface SaleSim {
  proceeds: string;
  costBasis: string;
  realisedPnL: string;
  term: 'SHORT' | 'LONG';
  equityType: boolean;
  isLoss: boolean;
  estTax: string;        // estimated tax on this sale's gain (₹). 0 for losses.
  taxRatePct: number | null;
  // True when the figure is approximate: LTCG ₹1.25L exemption applies at the
  // aggregate FY level (not per-sale), and non-equity short-term is slab-rated.
  taxIndicative: boolean;
}

export function simulateSale(input: SaleSimInput): SaleSim {
  const proceeds = input.sellPrice.times(input.sellQty);
  const costBasis = input.avgCost.times(input.sellQty);
  const realisedPnL = proceeds.minus(costBasis);
  const long = isLongTerm(input.assetClass, input.holdingPeriodDays);
  const term = long ? 'LONG' : 'SHORT';
  const equityType = EQUITY_TYPE.has(input.assetClass);
  const isLoss = realisedPnL.isNegative();

  let estTax = new Decimal(0);
  let taxRatePct: number | null = null;
  let taxIndicative = false;

  if (!isLoss && realisedPnL.greaterThan(0)) {
    if (equityType) {
      taxRatePct = long ? input.rates.ltcgEquityPct : input.rates.stcgEquityPct;
      estTax = realisedPnL.times(taxRatePct).dividedBy(100);
      // LTCG carries a ₹1.25L aggregate exemption we can't apply to one sale.
      taxIndicative = long;
    } else if (long) {
      taxRatePct = input.rates.ltcgOtherPct;
      estTax = realisedPnL.times(taxRatePct).dividedBy(100);
      taxIndicative = true;
    } else {
      // Non-equity short-term is taxed at the investor's slab — unknown here.
      taxRatePct = null;
      estTax = new Decimal(0);
      taxIndicative = true;
    }
  }

  return {
    proceeds: proceeds.toFixed(2),
    costBasis: costBasis.toFixed(2),
    realisedPnL: realisedPnL.toFixed(2),
    term,
    equityType,
    isLoss,
    estTax: estTax.toFixed(2),
    taxRatePct,
    taxIndicative,
  };
}
