/**
 * Specialised tax / MIS reports — grandfathering, demat-wise holdings,
 * mark-to-market. Each is shaped to match the exact layout of the
 * legacy desktop reports the user shared (mProfit screenshots), so the
 * Reports page can render them as drop-in replacements.
 *
 * Pure read aggregation — no mutations. All scope at user level so we
 * can roll multiple portfolios into a single statement.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import {
  computeUserCapitalGains,
  type CapitalGainRow,
} from './capitalGains.service.js';

// ─── 1. Grandfathering LTCG report ─────────────────────────────────
//
// Pre-31-Jan-2018 equity / equity-MF buys, sold under LTCG rules.
// As per §112A grandfathering: cost basis = max(actual cost, FMV on
// 31-Jan-2018). Tax-saving is the delta the report makes visible.
//
// We don't yet store a global FMV table for 31-Jan-2018, so the report
// surfaces actual cost vs sale price and leaves a column for FMV that
// can be populated once the user uploads the lookup table. The
// computed gain still falls back to actual cost (matches legacy app
// behaviour when FMV is missing).

const GF_CUTOFF = new Date('2018-01-31T23:59:59.999Z');

/**
 * Fetch FMV (close price) on / near 31-Jan-2018 for a set of ISINs.
 * Window is ±2 days to handle non-trading days. Returns whatever is
 * actually in StockPrice; missing ISINs are simply absent from the map.
 *
 * Exported so other services (e.g. Schedule 112A) can apply the same
 * grandfathering substitution without re-implementing the query.
 */
export async function fetchFmvOn31Jan2018(isins: string[]): Promise<Map<string, Decimal>> {
  const fmv = new Map<string, Decimal>();
  const real = Array.from(new Set(isins.filter((i): i is string => !!i)));
  if (real.length === 0) return fmv;
  const stocks = await prisma.stockMaster.findMany({
    where: { isin: { in: real } },
    select: { id: true, isin: true },
  });
  const stockIds = stocks.map((s) => s.id);
  const isinByStock = new Map(stocks.map((s) => [s.id, s.isin]));
  const prices = await prisma.stockPrice.findMany({
    where: {
      stockId: { in: stockIds },
      date: { gte: new Date('2018-01-28'), lte: new Date('2018-02-02') },
    },
    orderBy: { date: 'desc' },
  });
  for (const p of prices) {
    const isin = isinByStock.get(p.stockId);
    if (isin && !fmv.has(isin)) {
      fmv.set(isin, new Decimal(p.close.toString()));
    }
  }
  return fmv;
}

/**
 * Apply Sec 112A grandfathering to a single capital-gain row.
 * Returns the FMV-adjusted gain ( = sellAmount - max(actualCost, FMV*qty) )
 * when FMV is known and the lot pre-dates 31-Jan-2018; otherwise returns
 * the raw gain unchanged.
 */
export function adjustGainForGrandfathering(
  buyDate: Date,
  quantity: Decimal,
  buyAmount: Decimal,
  sellAmount: Decimal,
  rawGain: Decimal,
  fmvPerUnit: Decimal | null,
): Decimal {
  if (buyDate.getTime() > GF_CUTOFF.getTime()) return rawGain;
  if (!fmvPerUnit) return rawGain;
  const fmvCost = fmvPerUnit.times(quantity);
  if (fmvCost.lessThanOrEqualTo(buyAmount)) return rawGain;
  return sellAmount.minus(fmvCost);
}

export interface GrandfatheringRow {
  scriptName: string;
  isin: string | null;
  // Opening / Purchase
  buyDate: string;
  buyQty: string;
  buyRate: string;
  buyAmount: string;
  // FMV column — null until user uploads lookup data
  fmvOn31Jan2018: string | null;
  // Sale
  sellDate: string;
  sellQty: string;
  sellRate: string;
  sellAmount: string;
  // Gains
  gainLoss: string;
  gain: string; // positive part only (empty if loss)
  loss: string; // negative part only (empty if gain)
}

export interface GrandfatheringReport {
  scope: { kind: 'user'; userId: string; financialYear: string | null };
  rows: GrandfatheringRow[];
  totals: {
    buyQty: string;
    buyAmount: string;
    sellQty: string;
    sellAmount: string;
    gain: string;
    loss: string;
    net: string;
  };
}

function isGrandfatherEligible(row: CapitalGainRow): boolean {
  if (row.capitalGainType !== 'LONG_TERM') return false;
  if (!row.isEquityOriented) return false;
  return row.buyDate.getTime() <= GF_CUTOFF.getTime();
}

export async function grandfatheringReport(
  userId: string,
  fy?: string,
): Promise<GrandfatheringReport> {
  const { rows } = await computeUserCapitalGains(userId);
  const filtered = rows.filter(
    (r) => isGrandfatherEligible(r) && (!fy || r.financialYear === fy),
  );

  const isins = filtered.map((r) => r.isin).filter((i): i is string => !!i);
  const fmvByIsin = await fetchFmvOn31Jan2018(isins);

  // Apply Sec 112A grandfathering: cost basis = max(actualCost, FMV × qty)
  // whenever FMV-on-31-Jan-2018 is available. Recompute gain/loss with the
  // substituted cost; without the substitution, displayed gain would be
  // higher than the legally taxable one.
  const out: GrandfatheringRow[] = filtered.map((r) => {
    const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
    const actualCost = r.buyAmount;
    const fmvCost = fmv ? fmv.times(r.quantity) : null;
    const effectiveCost = fmvCost && fmvCost.greaterThan(actualCost) ? fmvCost : actualCost;
    const adjustedGain = r.sellAmount.minus(effectiveCost);
    const isGain = adjustedGain.greaterThanOrEqualTo(0);
    return {
      scriptName: r.assetName,
      isin: r.isin,
      buyDate: r.buyDate.toISOString().slice(0, 10),
      buyQty: r.quantity.toString(),
      buyRate: r.buyPrice.toString(),
      buyAmount: r.buyAmount.toString(),
      fmvOn31Jan2018: fmv ? fmv.toFixed(4) : null,
      sellDate: r.sellDate.toISOString().slice(0, 10),
      sellQty: r.quantity.toString(),
      sellRate: r.sellPrice.toString(),
      sellAmount: r.sellAmount.toString(),
      gainLoss: adjustedGain.toString(),
      gain: isGain ? adjustedGain.toString() : '0',
      loss: !isGain ? adjustedGain.negated().toString() : '0',
    };
  });

  const totals = out.reduce(
    (acc, r) => ({
      buyQty: acc.buyQty.plus(new Decimal(r.buyQty)),
      buyAmount: acc.buyAmount.plus(new Decimal(r.buyAmount)),
      sellQty: acc.sellQty.plus(new Decimal(r.sellQty)),
      sellAmount: acc.sellAmount.plus(new Decimal(r.sellAmount)),
      gain: acc.gain.plus(new Decimal(r.gain)),
      loss: acc.loss.plus(new Decimal(r.loss)),
    }),
    {
      buyQty: new Decimal(0),
      buyAmount: new Decimal(0),
      sellQty: new Decimal(0),
      sellAmount: new Decimal(0),
      gain: new Decimal(0),
      loss: new Decimal(0),
    },
  );
  const net = totals.gain.minus(totals.loss);

  return {
    scope: { kind: 'user', userId, financialYear: fy ?? null },
    rows: out,
    totals: {
      buyQty: totals.buyQty.toString(),
      buyAmount: totals.buyAmount.toFixed(2),
      sellQty: totals.sellQty.toString(),
      sellAmount: totals.sellAmount.toFixed(2),
      gain: totals.gain.toFixed(2),
      loss: totals.loss.toFixed(2),
      net: net.toFixed(2),
    },
  };
}

// ─── 2. Demat account-wise holdings ────────────────────────────────
//
// Replays the user's Transaction history grouped by `broker` (the
// demat account name) → assetKey, summing buys and subtracting sells.
// The screenshot also shows opening balance + dated in/out flows; we
// emit both: a flat per-broker / per-scheme balance row + the raw
// movement rows for expanded view.

export interface DematHoldingRow {
  brokerName: string;
  scriptName: string;
  isin: string | null;
  balanceQty: string;
}

export interface DematMovementRow {
  brokerName: string;
  scriptName: string;
  isin: string | null;
  date: string;
  kind: 'OPENING' | 'IN' | 'OUT';
  reason: string;
  inQty: string;
  outQty: string;
  balanceQty: string;
}

export interface DematHoldingReport {
  scope: { kind: 'user'; userId: string };
  rows: DematHoldingRow[];
  movements: DematMovementRow[];
  grandTotal: string;
}

export const BUY_TXN_TYPES = new Set<string>([
  'BUY',
  'SIP',
  'SWITCH_IN',
  'BONUS',
  'MERGER_IN',
  'DEMERGER_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'OPENING_BALANCE',
  'DEPOSIT',
]);
export const SELL_TXN_TYPES = new Set<string>([
  'SELL',
  'SWITCH_OUT',
  'REDEMPTION',
  'MATURITY',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'WITHDRAWAL',
]);

function txnKindLabel(t: string): string {
  switch (t) {
    case 'BUY':
      return 'Bought';
    case 'SELL':
      return 'Sold';
    case 'SIP':
      return 'SIP';
    case 'BONUS':
      return 'Bonus';
    case 'RIGHTS_ISSUE':
      return 'Rights';
    case 'DIVIDEND_REINVEST':
      return 'Div. reinvest';
    case 'OPENING_BALANCE':
      return 'Opening Balance.......';
    case 'DEPOSIT':
      return 'Deposit';
    case 'SWITCH_IN':
      return 'Switch in';
    case 'SWITCH_OUT':
      return 'Switch out';
    case 'REDEMPTION':
      return 'Redeemed';
    case 'MATURITY':
      return 'Matured';
    case 'MERGER_IN':
      return 'Merger in';
    case 'MERGER_OUT':
      return 'Merger out';
    case 'DEMERGER_IN':
      return 'Demerger in';
    case 'DEMERGER_OUT':
      return 'Demerger out';
    case 'WITHDRAWAL':
      return 'Withdrawal';
    default:
      return t;
  }
}

export async function dematHoldingReport(userId: string): Promise<DematHoldingReport> {
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId } },
    orderBy: [{ tradeDate: 'asc' }],
  });

  // Group running balance by (broker, assetKey).
  type Acc = {
    brokerName: string;
    scriptName: string;
    isin: string | null;
    balance: Decimal;
    movements: DematMovementRow[];
  };
  const byKey = new Map<string, Acc>();

  for (const t of txs) {
    const broker = t.broker ?? 'Self / Unallocated';
    const key = `${broker}::${t.assetKey ?? t.assetName ?? t.isin ?? 'unknown'}`;
    const cur = byKey.get(key) ?? {
      brokerName: broker,
      scriptName: t.assetName ?? 'UNKNOWN',
      isin: t.isin,
      balance: new Decimal(0),
      movements: [],
    };
    const qty = new Decimal(t.quantity.toString());
    if (BUY_TXN_TYPES.has(t.transactionType)) {
      cur.balance = cur.balance.plus(qty);
      cur.movements.push({
        brokerName: broker,
        scriptName: cur.scriptName,
        isin: cur.isin,
        date: t.tradeDate.toISOString().slice(0, 10),
        kind: t.transactionType === 'OPENING_BALANCE' ? 'OPENING' : 'IN',
        reason: txnKindLabel(t.transactionType),
        inQty: qty.toString(),
        outQty: '0',
        balanceQty: cur.balance.toString(),
      });
    } else if (SELL_TXN_TYPES.has(t.transactionType)) {
      cur.balance = cur.balance.minus(qty);
      cur.movements.push({
        brokerName: broker,
        scriptName: cur.scriptName,
        isin: cur.isin,
        date: t.tradeDate.toISOString().slice(0, 10),
        kind: 'OUT',
        reason: txnKindLabel(t.transactionType),
        inQty: '0',
        outQty: qty.toString(),
        balanceQty: cur.balance.toString(),
      });
    } else if (t.transactionType === 'SPLIT') {
      cur.balance = cur.balance.plus(qty);
      cur.movements.push({
        brokerName: broker,
        scriptName: cur.scriptName,
        isin: cur.isin,
        date: t.tradeDate.toISOString().slice(0, 10),
        kind: 'IN',
        reason: 'Split',
        inQty: qty.toString(),
        outQty: '0',
        balanceQty: cur.balance.toString(),
      });
    }
    byKey.set(key, cur);
  }

  // Sort: broker alpha, then script alpha. Drop fully-closed positions
  // from the rollup (legacy report shows them only as movement history).
  const sortedAcc = Array.from(byKey.values()).sort((a, b) => {
    if (a.brokerName !== b.brokerName) return a.brokerName.localeCompare(b.brokerName);
    return a.scriptName.localeCompare(b.scriptName);
  });

  const rows: DematHoldingRow[] = sortedAcc
    .filter((a) => !a.balance.isZero())
    .map((a) => ({
      brokerName: a.brokerName,
      scriptName: a.scriptName,
      isin: a.isin,
      balanceQty: a.balance.toString(),
    }));

  const movements: DematMovementRow[] = sortedAcc.flatMap((a) => a.movements);

  const grandTotal = sortedAcc.reduce((s, a) => s.plus(a.balance), new Decimal(0));

  return {
    scope: { kind: 'user', userId },
    rows,
    movements,
    grandTotal: grandTotal.toString(),
  };
}

// ─── 3. M2M (mark-to-market) report — equity + F&O ─────────────────
//
// Replays every BUY transaction still open, marks it against latest
// available price, computes:
//   * unrealised gain / loss
//   * days held, monthly ROI, annual ROI
//   * CAGR — (current / cost)^(365/days) − 1
//
// FIFO matching against sells: when the user has sold some of a
// holding, the residual purchase lots (in FIFO order) are what we
// mark to market. Lots fully closed are excluded.

export interface M2MRow {
  segment: 'EQUITY' | 'FNO';
  scriptName: string;
  isin: string | null;
  closingDate: string; // open buy date
  qty: string;
  purRate: string;
  purValue: string;
  bhavRate: string | null;
  valuation: string | null;
  unrealisedPnL: string | null;
  noOfDays: number;
  actualRoiPct: number | null;
  monthlyRoiPct: number | null;
  annualRoiPct: number | null;
  cagrPct: number | null;
}

export interface M2MReport {
  scope: { kind: 'user'; userId: string };
  asOfDate: string;
  equityRows: M2MRow[];
  fnoRows: M2MRow[];
  equityTotals: M2MSummary;
  fnoTotals: M2MSummary;
  grandTotal: M2MSummary;
}

interface M2MSummary {
  purValue: string;
  valuation: string;
  unrealisedPnL: string;
}

// FIFO residual lots — same algorithm as capital-gains service but we
// keep the open part instead of the matched part.
export function residualLots(txs: {
  tradeDate: Date;
  quantity: Decimal;
  price: Decimal;
  assetKey: string;
  assetName: string | null;
  isin: string | null;
  transactionType: string;
}[]): Array<{
  scriptName: string;
  isin: string | null;
  assetKey: string;
  date: Date;
  qty: Decimal;
  rate: Decimal;
}> {
  // Sort + group by assetKey, then FIFO-match sells.
  const byKey = new Map<string, typeof txs>();
  for (const t of txs) {
    const arr = byKey.get(t.assetKey) ?? [];
    arr.push(t);
    byKey.set(t.assetKey, arr);
  }
  const out: ReturnType<typeof residualLots> = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());
    const lots: Array<{ date: Date; qty: Decimal; rate: Decimal; name: string; isin: string | null }> = [];
    for (const t of sorted) {
      if (BUY_TXN_TYPES.has(t.transactionType)) {
        lots.push({
          date: t.tradeDate,
          qty: t.quantity,
          rate: t.price,
          name: t.assetName ?? key,
          isin: t.isin,
        });
      } else if (SELL_TXN_TYPES.has(t.transactionType)) {
        let toRemove = t.quantity;
        while (toRemove.greaterThan(0) && lots.length > 0) {
          const lot = lots[0]!;
          if (lot.qty.lessThanOrEqualTo(toRemove)) {
            toRemove = toRemove.minus(lot.qty);
            lots.shift();
          } else {
            lot.qty = lot.qty.minus(toRemove);
            toRemove = new Decimal(0);
          }
        }
      }
    }
    for (const lot of lots) {
      if (lot.qty.isZero() || lot.qty.isNegative()) continue;
      out.push({
        scriptName: lot.name,
        isin: lot.isin,
        assetKey: key,
        date: lot.date,
        qty: lot.qty,
        rate: lot.rate,
      });
    }
  }
  return out;
}

async function priceForAssetKey(assetKey: string, asOf: Date): Promise<Decimal | null> {
  // Try stock first
  if (assetKey.startsWith('stock:')) {
    const stockId = assetKey.slice(6);
    const row = await prisma.stockPrice.findFirst({
      where: { stockId, date: { lte: asOf } },
      orderBy: { date: 'desc' },
    });
    return row ? new Decimal(row.close.toString()) : null;
  }
  if (assetKey.startsWith('fund:')) {
    const fundId = assetKey.slice(5);
    const row = await prisma.mFNav.findFirst({
      where: { fundId, date: { lte: asOf } },
      orderBy: { date: 'desc' },
    });
    return row ? new Decimal(row.nav.toString()) : null;
  }
  if (assetKey.startsWith('isin:')) {
    const isin = assetKey.slice(5);
    const stock = await prisma.stockMaster.findFirst({ where: { isin }, select: { id: true } });
    if (stock) {
      const row = await prisma.stockPrice.findFirst({
        where: { stockId: stock.id, date: { lte: asOf } },
        orderBy: { date: 'desc' },
      });
      return row ? new Decimal(row.close.toString()) : null;
    }
  }
  return null;
}

const EQUITY_ASSET_CLASSES = new Set(['EQUITY', 'ETF']);
const FNO_ASSET_CLASSES = new Set(['FUTURES', 'OPTIONS']);

function classifySegment(assetClass: string): 'EQUITY' | 'FNO' | null {
  if (EQUITY_ASSET_CLASSES.has(assetClass)) return 'EQUITY';
  if (FNO_ASSET_CLASSES.has(assetClass)) return 'FNO';
  return null;
}

export async function m2mReport(userId: string, asOf?: Date): Promise<M2MReport> {
  const cutoff = asOf ?? new Date();
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId }, tradeDate: { lte: cutoff } },
    orderBy: { tradeDate: 'asc' },
  });

  // Bucket by segment.
  const equityTxs: typeof txs = [];
  const fnoTxs: typeof txs = [];
  for (const t of txs) {
    const seg = classifySegment(t.assetClass);
    if (seg === 'EQUITY') equityTxs.push(t);
    else if (seg === 'FNO') fnoTxs.push(t);
  }

  async function build(seg: 'EQUITY' | 'FNO', src: typeof txs): Promise<M2MRow[]> {
    // Effective price = netAmount / quantity. This rolls brokerage,
    // STT, stamp duty etc. into the cost basis so the M2M valuation
    // measures real-money unrealised P&L, not gross-rate P&L.
    const lots = residualLots(
      src.map((t) => {
        const q = new Decimal(t.quantity.toString());
        const net = new Decimal(t.netAmount.toString());
        const effectivePrice = q.isZero() ? new Decimal(t.price.toString()) : net.dividedBy(q);
        return {
          tradeDate: t.tradeDate,
          quantity: q,
          price: effectivePrice,
          assetKey: t.assetKey ?? `name:${t.assetName ?? ''}`,
          assetName: t.assetName,
          isin: t.isin,
          transactionType: t.transactionType,
        };
      }),
    );
    const rows: M2MRow[] = [];
    for (const lot of lots) {
      const purValue = lot.qty.times(lot.rate);
      const bhav = await priceForAssetKey(lot.assetKey, cutoff);
      const valuation = bhav ? lot.qty.times(bhav) : null;
      const pnl = valuation ? valuation.minus(purValue) : null;
      const days = Math.max(1, Math.floor((cutoff.getTime() - lot.date.getTime()) / 86_400_000));
      const actualRoi =
        pnl && !purValue.isZero() ? pnl.dividedBy(purValue).times(100).toNumber() : null;
      const monthlyRoi = actualRoi != null ? (actualRoi * 30) / days : null;
      const annualRoi = actualRoi != null ? (actualRoi * 365) / days : null;
      let cagr: number | null = null;
      if (valuation && !purValue.isZero() && valuation.greaterThan(0)) {
        try {
          const ratio = valuation.dividedBy(purValue).toNumber();
          if (ratio > 0) cagr = (Math.pow(ratio, 365 / days) - 1) * 100;
        } catch {
          cagr = null;
        }
      }
      rows.push({
        segment: seg,
        scriptName: lot.scriptName,
        isin: lot.isin,
        closingDate: lot.date.toISOString().slice(0, 10),
        qty: lot.qty.toString(),
        purRate: lot.rate.toFixed(4),
        purValue: purValue.toFixed(2),
        bhavRate: bhav ? bhav.toFixed(4) : null,
        valuation: valuation ? valuation.toFixed(2) : null,
        unrealisedPnL: pnl ? pnl.toFixed(2) : null,
        noOfDays: days,
        actualRoiPct: actualRoi != null ? Number(actualRoi.toFixed(4)) : null,
        monthlyRoiPct: monthlyRoi != null ? Number(monthlyRoi.toFixed(4)) : null,
        annualRoiPct: annualRoi != null ? Number(annualRoi.toFixed(4)) : null,
        cagrPct: cagr != null ? Number(cagr.toFixed(4)) : null,
      });
    }
    return rows.sort((a, b) => a.scriptName.localeCompare(b.scriptName));
  }

  const equityRows = await build('EQUITY', equityTxs);
  const fnoRows = await build('FNO', fnoTxs);

  function summarize(rows: M2MRow[]): M2MSummary {
    const sumPur = rows.reduce((s, r) => s.plus(r.purValue), new Decimal(0));
    const sumVal = rows.reduce((s, r) => s.plus(r.valuation ?? '0'), new Decimal(0));
    const sumPnl = rows.reduce((s, r) => s.plus(r.unrealisedPnL ?? '0'), new Decimal(0));
    return {
      purValue: sumPur.toFixed(2),
      valuation: sumVal.toFixed(2),
      unrealisedPnL: sumPnl.toFixed(2),
    };
  }

  const equityTotals = summarize(equityRows);
  const fnoTotals = summarize(fnoRows);
  const grandTotal: M2MSummary = {
    purValue: new Decimal(equityTotals.purValue).plus(fnoTotals.purValue).toFixed(2),
    valuation: new Decimal(equityTotals.valuation).plus(fnoTotals.valuation).toFixed(2),
    unrealisedPnL: new Decimal(equityTotals.unrealisedPnL).plus(fnoTotals.unrealisedPnL).toFixed(2),
  };

  return {
    scope: { kind: 'user', userId },
    asOfDate: cutoff.toISOString().slice(0, 10),
    equityRows,
    fnoRows,
    equityTotals,
    fnoTotals,
    grandTotal,
  };
}
