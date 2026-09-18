import { Decimal } from 'decimal.js';

/**
 * Pure math for the what-if sale simulator (3c). Read-only, informational —
 * computes the outcome of a hypothetical sale, never recommends one.
 *
 * FIFO, on the real lots. A sale consumes the oldest units first, exactly the
 * way `capitalGains.service` books a real sale, so the gain quoted here is the
 * gain that will actually book. Weighted-average cost (what HoldingProjection
 * carries) is NOT good enough: for anything bought over time — every SIP — the
 * oldest units are usually the cheapest, so average cost understates the gain
 * and therefore the tax.
 *
 * Partly selling a position built over years also straddles the long-term
 * threshold: some matched lots are long-term and some are short, taxed at
 * different rates. The simulator splits the result by lot and taxes each side
 * on its own terms rather than stamping one term on the whole sale.
 *
 * Non-equity short-term gains are taxed at the investor's slab rate. That used
 * to be reported as ₹0 tax, which reads as "this sale is free" on the very
 * sales that are taxed hardest. The rate now comes from the caller — the
 * user's recorded slab, or the same stand-in the rest of the tax stack uses —
 * and `slabTaxableGain` marks the portion it applies to so the UI can say
 * which assumption produced the number.
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

/** One remaining FIFO lot, already classified long/short at the sale date. */
export interface SaleLot {
  buyDate: Date;
  quantity: Decimal;
  costPerUnit: Decimal;
  longTerm: boolean;
}

export interface SaleSimInput {
  assetClass: string;
  /**
   * Sec 111A/112A asset (listed equity, equity-oriented fund). Decided by the
   * caller via `lotTaxStatus` so debt-oriented mutual funds aren't treated as
   * equity on asset class alone.
   */
  equityOriented: boolean;
  /** Remaining lots in FIFO order, oldest first. */
  lots: SaleLot[];
  sellQty: Decimal;
  sellPrice: Decimal;
  rates: {
    stcgEquityPct: number;
    ltcgEquityPct: number;
    ltcgOtherPct: number;
    /** Marginal rate for slab-taxed gains (non-equity short-term). */
    slabPct: number;
    /** True when `slabPct` is the stand-in rate, not one the user recorded. */
    slabIsEstimate: boolean;
  };
}

/** One term's share of the sale: the lots of that term that the sale consumed. */
export interface SaleBucket {
  quantity: string;
  costBasis: string;
  proceeds: string;
  realisedPnL: string;
  /** Null when no units of this term were matched. */
  taxRatePct: number | null;
  estTax: string;
}

export interface SaleSim {
  proceeds: string;
  costBasis: string;
  realisedPnL: string;
  /** MIXED when the matched lots straddle the long-term threshold. */
  term: 'SHORT' | 'LONG' | 'MIXED';
  equityType: boolean;
  isLoss: boolean;
  /** Estimated tax on the whole sale, both terms included. */
  estTax: string;
  /** Single rate when the whole sale sits in one bucket; null when mixed. */
  taxRatePct: number | null;
  /**
   * The share of the gain taxed at the slab rate rather than a capital-gains
   * rate. Included in `estTax`; surfaced so the UI can name the assumption.
   */
  slabTaxableGain: string;
  /** The slab rate applied, and whether it was assumed rather than recorded. */
  slabRatePct: number | null;
  slabRateIsEstimate: boolean;
  // True when the figure is approximate: LTCG carries a ₹1.25L aggregate
  // exemption that applies at FY level (not per-sale), and a slab rate may be
  // the stand-in rather than the user's own.
  taxIndicative: boolean;
  longTerm: SaleBucket;
  shortTerm: SaleBucket;
  /** How many FIFO lots the sale consumed, and the oldest one it touched. */
  lotsMatched: number;
  oldestMatchedBuyDate: string | null;
  /** True when lots were short of `sellQty` (holdings-only import, stale projection). */
  lotsIncomplete: boolean;
}

interface Acc {
  qty: Decimal;
  cost: Decimal;
  proceeds: Decimal;
}

const zeroAcc = (): Acc => ({ qty: new Decimal(0), cost: new Decimal(0), proceeds: new Decimal(0) });

function bucket(acc: Acc, ratePct: number | null): SaleBucket {
  const pnl = acc.proceeds.minus(acc.cost);
  // Tax only a gain, and only at a rate we actually know.
  const tax = ratePct != null && pnl.greaterThan(0) ? pnl.times(ratePct).dividedBy(100) : new Decimal(0);
  return {
    quantity: acc.qty.toString(),
    costBasis: acc.cost.toFixed(2),
    proceeds: acc.proceeds.toFixed(2),
    realisedPnL: pnl.toFixed(2),
    taxRatePct: ratePct,
    estTax: tax.toFixed(2),
  };
}

export function simulateSale(input: SaleSimInput): SaleSim {
  const equityType = input.equityOriented;

  // Consume lots oldest-first, splitting the final lot if the sale ends inside it.
  let remaining = input.sellQty;
  const long = zeroAcc();
  const short = zeroAcc();
  let lotsMatched = 0;
  let oldestMatched: Date | null = null;

  for (const lot of input.lots) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const take = Decimal.min(remaining, lot.quantity);
    if (take.lessThanOrEqualTo(0)) continue;
    const acc = lot.longTerm ? long : short;
    acc.qty = acc.qty.plus(take);
    acc.cost = acc.cost.plus(take.times(lot.costPerUnit));
    acc.proceeds = acc.proceeds.plus(take.times(input.sellPrice));
    remaining = remaining.minus(take);
    lotsMatched += 1;
    if (oldestMatched == null || lot.buyDate < oldestMatched) oldestMatched = lot.buyDate;
  }

  // Fewer lots than units sold: the caller's quantity guard should prevent it,
  // but a holdings-only import has no lot history. Flagged rather than hidden.
  const lotsIncomplete = remaining.greaterThan(0);

  // Rate per bucket. Non-equity short-term is taxed at the investor's slab.
  const longRatePct = equityType ? input.rates.ltcgEquityPct : input.rates.ltcgOtherPct;
  const shortRatePct = equityType ? input.rates.stcgEquityPct : input.rates.slabPct;
  const shortIsSlab = !equityType;

  const longTerm = bucket(long, longRatePct);
  const shortTerm = bucket(short, shortRatePct);

  const proceeds = long.proceeds.plus(short.proceeds);
  const costBasis = long.cost.plus(short.cost);
  const realisedPnL = proceeds.minus(costBasis);
  const estTax = new Decimal(longTerm.estTax).plus(shortTerm.estTax);

  // The part taxed on an assumed marginal rate rather than a statutory
  // capital-gains rate, so the UI can name the assumption.
  const shortPnl = new Decimal(shortTerm.realisedPnL);
  const slabTaxableGain = shortIsSlab && shortPnl.greaterThan(0) ? shortPnl : new Decimal(0);

  const hasLong = long.qty.greaterThan(0);
  const hasShort = short.qty.greaterThan(0);
  const term: SaleSim['term'] = hasLong && hasShort ? 'MIXED' : hasLong ? 'LONG' : 'SHORT';

  // One rate only makes sense when the whole sale sits in one known bucket.
  const taxRatePct = term === 'LONG' ? longRatePct : term === 'SHORT' ? shortRatePct : null;

  // Approximate whenever the LTCG exemption could bite or a slab rate is assumed.
  const taxIndicative =
    slabTaxableGain.greaterThan(0) || (new Decimal(longTerm.realisedPnL).greaterThan(0) && hasLong);

  return {
    proceeds: proceeds.toFixed(2),
    costBasis: costBasis.toFixed(2),
    realisedPnL: realisedPnL.toFixed(2),
    term,
    equityType,
    isLoss: realisedPnL.isNegative(),
    estTax: estTax.toFixed(2),
    taxRatePct,
    slabTaxableGain: slabTaxableGain.toFixed(2),
    slabRatePct: shortIsSlab && hasShort ? input.rates.slabPct : null,
    slabRateIsEstimate: shortIsSlab && hasShort ? input.rates.slabIsEstimate : false,
    taxIndicative,
    longTerm,
    shortTerm,
    lotsMatched,
    oldestMatchedBuyDate: oldestMatched ? oldestMatched.toISOString().slice(0, 10) : null,
    lotsIncomplete,
  };
}
