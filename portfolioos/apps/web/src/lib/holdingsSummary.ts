import { Decimal, toDecimal } from '@everypaisa/shared';

interface SummarisableHolding {
  totalCost: string;
  currentValue: string | null;
}

export interface HoldingsSummary {
  /** Priced holdings at market, unpriced holdings at cost — same rule the dashboard uses. */
  value: Decimal;
  cost: Decimal;
  /** Unrealised P&L over priced holdings only; null when nothing is priced. */
  pnl: Decimal | null;
  pnlPct: number | null;
  unpricedCount: number;
}

/**
 * A holding with no price yet is not a total loss. Counting it as ₹0 made every
 * freshly-added stock or fund show −100%, so unpriced rows are carried at cost
 * and kept out of the P&L entirely.
 */
export function summariseHoldings(rows: readonly SummarisableHolding[]): HoldingsSummary {
  let value = new Decimal(0);
  let cost = new Decimal(0);
  let pricedValue = new Decimal(0);
  let pricedCost = new Decimal(0);
  let unpricedCount = 0;

  for (const h of rows) {
    const c = toDecimal(h.totalCost);
    cost = cost.plus(c);
    if (h.currentValue == null) {
      value = value.plus(c);
      unpricedCount += 1;
    } else {
      const v = toDecimal(h.currentValue);
      value = value.plus(v);
      pricedValue = pricedValue.plus(v);
      pricedCost = pricedCost.plus(c);
    }
  }

  const anyPriced = rows.length > unpricedCount;
  const pnl = anyPriced ? pricedValue.minus(pricedCost) : null;
  const pnlPct =
    pnl && pricedCost.greaterThan(0) ? pnl.dividedBy(pricedCost).times(100).toNumber() : null;

  return { value, cost, pnl, pnlPct, unpricedCount };
}

export function unpricedHint(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? '1 holding at cost — no price yet' : `${count} holdings at cost — no price yet`;
}
