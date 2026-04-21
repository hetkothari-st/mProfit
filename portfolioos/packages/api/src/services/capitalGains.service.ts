import { Decimal } from 'decimal.js';
import type {
  AssetClass,
  CapitalGainType,
  Prisma,
  Transaction,
  TransactionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// ─── Indian tax constants ───────────────────────────────────────────

// Cost Inflation Index (CII) — CBDT Notifications
// Key = starting year of FY (e.g. 2001 means FY 2001-02 with base CII 100)
const CII: Record<number, number> = {
  2001: 100,
  2002: 105,
  2003: 109,
  2004: 113,
  2005: 117,
  2006: 122,
  2007: 129,
  2008: 137,
  2009: 148,
  2010: 167,
  2011: 184,
  2012: 200,
  2013: 220,
  2014: 240,
  2015: 254,
  2016: 264,
  2017: 272,
  2018: 280,
  2019: 289,
  2020: 301,
  2021: 317,
  2022: 331,
  2023: 348,
  2024: 363,
};

const GRANDFATHERING_CUTOFF = new Date('2018-01-31T00:00:00Z');
const DEBT_MF_INDEXATION_CUTOFF = new Date('2023-04-01T00:00:00Z');

// ─── Helpers ────────────────────────────────────────────────────────

export function financialYearOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  const end = start + 1;
  return `${start}-${String(end).slice(2)}`;
}

function fyStartYear(d: Date): number {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 4 ? y : y - 1;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function isEquityLike(ac: AssetClass): boolean {
  return ac === 'EQUITY' || ac === 'ETF' || ac === 'FUTURES' || ac === 'OPTIONS';
}

function isEquityMF(ac: AssetClass): boolean {
  // We don't persist equity-vs-debt at the MF level without category data.
  // Treat MF as equity-style by default; downstream users can reclassify via
  // category metadata once available.
  return ac === 'MUTUAL_FUND';
}

function longTermThresholdMonths(ac: AssetClass): number {
  if (isEquityLike(ac) || isEquityMF(ac)) return 12;
  // Bonds, gold, real estate, PMS, AIF, REIT, others
  return 36;
}

function qualifiesForIndexation(ac: AssetClass, buyDate: Date): boolean {
  // Equity/equity MFs: no indexation
  if (isEquityLike(ac) || ac === 'ETF') return false;
  if (ac === 'MUTUAL_FUND') {
    // Debt MFs bought before 1-Apr-2023 still qualify; post that, no indexation.
    return buyDate < DEBT_MF_INDEXATION_CUTOFF;
  }
  // Bonds, gold, real estate, etc.
  return (
    ac === 'BOND' ||
    ac === 'CORPORATE_BOND' ||
    ac === 'GOVT_BOND' ||
    ac === 'GOLD_BOND' ||
    ac === 'GOLD_ETF' ||
    ac === 'PHYSICAL_GOLD' ||
    ac === 'PHYSICAL_SILVER' ||
    ac === 'REAL_ESTATE'
  );
}

function indexedCost(cost: Decimal, buyDate: Date, sellDate: Date): Decimal | null {
  const buyFy = fyStartYear(buyDate);
  const sellFy = fyStartYear(sellDate);
  const buyCii = CII[buyFy];
  const sellCii = CII[sellFy];
  if (!buyCii || !sellCii) return null;
  return cost.times(sellCii).dividedBy(buyCii);
}

function classify(
  ac: AssetClass,
  buyDate: Date,
  sellDate: Date,
  txType: TransactionType,
): CapitalGainType {
  // Intraday only applies to equity BUY+SELL same day
  if (isEquityLike(ac) && sameDay(buyDate, sellDate) && txType === 'SELL') {
    return 'INTRADAY';
  }
  const holdingDays = daysBetween(buyDate, sellDate);
  const thresholdDays = longTermThresholdMonths(ac) * 30; // approximate
  return holdingDays >= thresholdDays ? 'LONG_TERM' : 'SHORT_TERM';
}

// ─── FIFO engine ────────────────────────────────────────────────────

const BUY_TYPES = new Set<TransactionType>([
  'BUY',
  'SIP',
  'SWITCH_IN',
  'BONUS',
  'MERGER_IN',
  'DEMERGER_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'OPENING_BALANCE',
]);

const SELL_TYPES = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'REDEMPTION',
  'MATURITY',
]);

interface Lot {
  buyTxId: string;
  buyDate: Date;
  qty: Decimal;
  costPerUnit: Decimal; // net of charges
}

interface AssetKey {
  portfolioId: string;
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
}

function keyString(k: AssetKey): string {
  return `${k.portfolioId}|${k.assetClass}|${k.stockId ?? ''}|${k.fundId ?? ''}|${k.isin ?? ''}`;
}

export interface CapitalGainRow {
  portfolioId: string;
  sellTransactionId: string;
  buyTransactionId: string;
  assetClass: AssetClass;
  assetName: string;
  isin: string | null;
  buyDate: Date;
  sellDate: Date;
  quantity: Decimal;
  buyPrice: Decimal;
  sellPrice: Decimal;
  buyAmount: Decimal;
  sellAmount: Decimal;
  indexedCostOfAcquisition: Decimal | null;
  capitalGainType: CapitalGainType;
  gainLoss: Decimal;
  taxableGain: Decimal;
  financialYear: string;
}

export interface CapitalGainsResult {
  rows: CapitalGainRow[];
  summaryByFy: Record<
    string,
    { intraday: Decimal; stcg: Decimal; ltcg: Decimal; taxable: Decimal }
  >;
}

function groupByAsset(txs: Transaction[]): Map<string, { key: AssetKey; txs: Transaction[] }> {
  const m = new Map<string, { key: AssetKey; txs: Transaction[] }>();
  for (const tx of txs) {
    const key: AssetKey = {
      portfolioId: tx.portfolioId,
      assetClass: tx.assetClass,
      stockId: tx.stockId,
      fundId: tx.fundId,
      isin: tx.isin,
    };
    const id = keyString(key);
    let bucket = m.get(id);
    if (!bucket) {
      bucket = { key, txs: [] };
      m.set(id, bucket);
    }
    bucket.txs.push(tx);
  }
  return m;
}

export function computeFIFOGains(txs: Transaction[]): CapitalGainRow[] {
  const groups = groupByAsset(txs);
  const rows: CapitalGainRow[] = [];

  for (const { key, txs: list } of groups.values()) {
    // Only BUY/SELL-type transactions matter for capital gains
    const relevant = list.filter(
      (t) => BUY_TYPES.has(t.transactionType) || SELL_TYPES.has(t.transactionType),
    );
    relevant.sort((a, b) => {
      const d = a.tradeDate.getTime() - b.tradeDate.getTime();
      if (d !== 0) return d;
      // Same-day tie-break: BUY before SELL for intraday correctness
      const aBuy = BUY_TYPES.has(a.transactionType) ? 0 : 1;
      const bBuy = BUY_TYPES.has(b.transactionType) ? 0 : 1;
      return aBuy - bBuy;
    });

    const lots: Lot[] = [];

    for (const tx of relevant) {
      const qty = new Decimal(tx.quantity.toString());
      const net = new Decimal(tx.netAmount.toString());

      if (BUY_TYPES.has(tx.transactionType)) {
        if (qty.isZero() || qty.isNegative()) continue;
        // Bonus/demerger/rights in without cost → 0 cost basis
        const zeroCost =
          tx.transactionType === 'BONUS' ||
          tx.transactionType === 'DEMERGER_IN' ||
          tx.transactionType === 'MERGER_IN';
        const costPerUnit = zeroCost ? new Decimal(0) : net.dividedBy(qty);
        lots.push({
          buyTxId: tx.id,
          buyDate: tx.tradeDate,
          qty,
          costPerUnit,
        });
      } else if (SELL_TYPES.has(tx.transactionType)) {
        if (qty.isZero() || qty.isNegative()) continue;
        const sellPricePerUnit = qty.isZero() ? new Decimal(0) : net.dividedBy(qty);

        let remaining = qty;
        while (remaining.greaterThan(0) && lots.length > 0) {
          const lot = lots[0]!;
          const take = Decimal.min(lot.qty, remaining);
          const costBasis = lot.costPerUnit.times(take);
          const proceeds = sellPricePerUnit.times(take);
          const gainLoss = proceeds.minus(costBasis);

          const gainType = classify(key.assetClass, lot.buyDate, tx.tradeDate, tx.transactionType);

          let indexed: Decimal | null = null;
          let taxableGain = gainLoss;
          if (gainType === 'LONG_TERM' && qualifiesForIndexation(key.assetClass, lot.buyDate)) {
            indexed = indexedCost(costBasis, lot.buyDate, tx.tradeDate);
            if (indexed) taxableGain = proceeds.minus(indexed);
          }

          // Section 112A grandfathering: for pre-31-Jan-2018 equity, cost basis
          // should be max(actualCost, FMV on 31-Jan-2018). We don't have FMV
          // data, so flag via indexedCostOfAcquisition=null and use actual cost.
          // TODO: wire FMV lookup when historical BSE/NSE close prices for
          // 31-Jan-2018 become available in MarketData.
          if (
            gainType === 'LONG_TERM' &&
            (isEquityLike(key.assetClass) || key.assetClass === 'MUTUAL_FUND') &&
            lot.buyDate <= GRANDFATHERING_CUTOFF
          ) {
            // Keep taxableGain as gainLoss; downstream UI can prompt for FMV.
          }

          rows.push({
            portfolioId: key.portfolioId,
            sellTransactionId: tx.id,
            buyTransactionId: lot.buyTxId,
            assetClass: key.assetClass,
            assetName: tx.assetName ?? '',
            isin: key.isin,
            buyDate: lot.buyDate,
            sellDate: tx.tradeDate,
            quantity: take,
            buyPrice: lot.costPerUnit,
            sellPrice: sellPricePerUnit,
            buyAmount: costBasis,
            sellAmount: proceeds,
            indexedCostOfAcquisition: indexed,
            capitalGainType: gainType,
            gainLoss,
            taxableGain,
            financialYear: financialYearOf(tx.tradeDate),
          });

          lot.qty = lot.qty.minus(take);
          remaining = remaining.minus(take);
          if (lot.qty.lessThanOrEqualTo(0)) lots.shift();
        }
        // remaining > 0 here means we sold more than we held → skip overflow
      }
    }
  }

  return rows;
}

function summarize(rows: CapitalGainRow[]): CapitalGainsResult['summaryByFy'] {
  const s: CapitalGainsResult['summaryByFy'] = {};
  for (const r of rows) {
    if (!s[r.financialYear]) {
      s[r.financialYear] = {
        intraday: new Decimal(0),
        stcg: new Decimal(0),
        ltcg: new Decimal(0),
        taxable: new Decimal(0),
      };
    }
    const b = s[r.financialYear]!;
    if (r.capitalGainType === 'INTRADAY') b.intraday = b.intraday.plus(r.gainLoss);
    if (r.capitalGainType === 'SHORT_TERM') b.stcg = b.stcg.plus(r.gainLoss);
    if (r.capitalGainType === 'LONG_TERM') b.ltcg = b.ltcg.plus(r.gainLoss);
    b.taxable = b.taxable.plus(r.taxableGain);
  }
  return s;
}

export async function computePortfolioCapitalGains(portfolioId: string): Promise<CapitalGainsResult> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId },
    orderBy: { tradeDate: 'asc' },
  });
  const rows = computeFIFOGains(txs);
  return { rows, summaryByFy: summarize(rows) };
}

export async function computeUserCapitalGains(userId: string): Promise<CapitalGainsResult> {
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId } },
    orderBy: { tradeDate: 'asc' },
  });
  const rows = computeFIFOGains(txs);
  return { rows, summaryByFy: summarize(rows) };
}

export async function persistCapitalGainsForPortfolio(portfolioId: string): Promise<number> {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  // Replace existing rows for this portfolio
  await prisma.capitalGain.deleteMany({ where: { portfolioId } });
  if (rows.length === 0) return 0;
  const data: Prisma.CapitalGainCreateManyInput[] = rows.map((r) => ({
    portfolioId: r.portfolioId,
    sellTransactionId: r.sellTransactionId,
    buyTransactionId: r.buyTransactionId,
    assetClass: r.assetClass,
    assetName: r.assetName,
    isin: r.isin,
    buyDate: r.buyDate,
    sellDate: r.sellDate,
    quantity: r.quantity.toString(),
    buyPrice: r.buyPrice.toString(),
    sellPrice: r.sellPrice.toString(),
    buyAmount: r.buyAmount.toString(),
    sellAmount: r.sellAmount.toString(),
    indexedCostOfAcquisition: r.indexedCostOfAcquisition?.toString() ?? null,
    capitalGainType: r.capitalGainType,
    gainLoss: r.gainLoss.toString(),
    taxableGain: r.taxableGain.toString(),
    financialYear: r.financialYear,
  }));
  await prisma.capitalGain.createMany({ data });
  return data.length;
}
