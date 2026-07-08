import { Decimal } from 'decimal.js';
import type {
  AssetClass,
  CapitalGainType,
  MFCategory,
  Prisma,
  Transaction,
  TransactionType,
} from '@prisma/client';
import { CII_BY_FY } from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';
import { getFmvForUser } from './fmvOverride.service.js';

// ─── Indian tax constants ───────────────────────────────────────────

// Cost Inflation Index (CII) — CBDT Notifications, keyed by the *starting*
// year of the FY (e.g. 2001 means FY 2001-02 with base CII 100).
//
// This used to be a second, hand-maintained copy of the CII table that lived
// only here and silently drifted out of sync with the "YYYY-YY"-keyed
// `CII_BY_FY` table in `@portfolioos/shared` (used by `propertyCapitalGain.ts`
// for `OwnedProperty` sales) — this copy stopped at FY2024-25 while the
// shared one already carries a documented FY2025-26 estimate. Derive from the
// shared table instead so there is exactly one place to update when CBDT
// publishes a new value, for both ingestion paths that can produce
// indexation-eligible rows:
//   1. `OwnedProperty` sales → `propertyCapitalGain.ts` (its own 20%/12.5%
//      choice model, using `CII_BY_FY` directly).
//   2. Manually-entered `Transaction` rows with `assetClass: REAL_ESTATE`
//      (or BOND/GOLD_BOND/GOLD_ETF/PHYSICAL_GOLD/PHYSICAL_SILVER/debt
//      MUTUAL_FUND) → this FIFO engine. `AssetClass` accepts REAL_ESTATE on
//      `Transaction` (see `transaction.controller.ts`), so a user can record
//      a property sale as a plain transaction instead of via `OwnedProperty`
//      — that row does NOT flow through `propertyCapitalGain.ts` at all, only
//      through here. The two paths must therefore share one CII source, or
//      the same property could get two different indexed costs depending on
//      which the user picked.
//
// FY2025-26 is CBDT's most recent notified value at the time of writing; if a
// future FY has no entry, indexation is unavailable, not silently skipped —
// see `indexedCost()` below, which returns `status: 'cii_unavailable'` rather
// than a bare `null` so callers can flag the row instead of quietly reporting
// a non-indexed (higher) taxable gain as if it were final.
const CII: Record<number, number> = Object.fromEntries(
  Object.entries(CII_BY_FY).map(([fy, value]) => [Number.parseInt(fy.slice(0, 4), 10), value]),
);

// Exported: fmvOverride.service.ts uses the same cutoff to decide which
// CapitalGain rows are eligible for grandfathering (circular import — safe,
// only referenced inside function bodies, never at module-eval time).
export const GRANDFATHERING_CUTOFF = new Date('2018-01-31T00:00:00Z');
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
  return ac === 'EQUITY' || ac === 'ETF';
}

/**
 * F&O bypasses the capital-gains FIFO engine — its tax treatment is
 * §43(5) business income (intraday equity = speculative; F&O = non-
 * speculative), computed by `foPnl.service`. Returning true here means
 * "skip this row entirely from CG computation".
 */
function isFnoSkipped(ac: AssetClass): boolean {
  return ac === 'FUTURES' || ac === 'OPTIONS';
}

/**
 * Forex pair trades (USDINR, EURUSD, …) are speculative business income under
 * §43(5)/§28 — not capital gains. They bypass the FIFO engine entirely; P&L
 * is computed separately by `forex.service.ts` and surfaced as business
 * income in tax reports.
 */
function isForexPair(ac: AssetClass): boolean {
  return ac === 'FOREX_PAIR';
}

/**
 * Foreign equity (US/international listed shares) is a non-equity capital
 * asset for Indian tax purposes:
 *   - LTCG threshold: 24 months (Finance Act 2023).
 *   - Post-Apr-2023 buys: 12.5% flat LTCG, no indexation (Finance Act 2024).
 *   - Pre-Apr-2023 buys held >36 months historically qualified for
 *     indexation. We treat post-2023 as the new normal; pre-2023 indexation
 *     can be re-enabled by flipping `qualifiesForIndexation` for FOREIGN_EQUITY.
 *   - STCG: slab rate (handled at report level, not here).
 *   - Currency conversion uses fxRateAtTrade frozen at each leg per Rule 115.
 */
function isForeignEquity(ac: AssetClass): boolean {
  return ac === 'FOREIGN_EQUITY';
}

/**
 * Whether a MUTUAL_FUND row is equity-oriented for tax purposes. This is the
 * single source of truth other services must use instead of assuming
 * `assetClass === 'MUTUAL_FUND'` means equity — see TASK-01 for the bug this
 * replaces (every MF was silently treated as equity-style regardless of its
 * real AMFI category).
 *
 * Do NOT default missing/unknown category to `true` (equity). An unclassified
 * fund must fall back to debt-conservative treatment (36-month LT threshold,
 * date-based indexation eligibility, no 112A grandfathering) and get flagged
 * via `CapitalGainRow.needsReview` — silently guessing equity treatment is
 * the exact bug being fixed here.
 *
 * HYBRID funds need their own equity-allocation-% rule (not yet implemented);
 * until that exists, HYBRID is treated as non-equity-oriented (conservative).
 */
function isEquityOrientedMF(fundId: string | null, fundCategoryMap?: Map<string, MFCategory>): boolean {
  if (!fundId || !fundCategoryMap) return false;
  const cat = fundCategoryMap.get(fundId);
  return cat === 'EQUITY' || cat === 'ELSS';
}

function longTermThresholdMonths(
  ac: AssetClass,
  fundId: string | null,
  fundCategoryMap?: Map<string, MFCategory>,
): number {
  if (isEquityLike(ac)) return 12;
  if (ac === 'MUTUAL_FUND') return isEquityOrientedMF(fundId, fundCategoryMap) ? 12 : 36;
  if (isForeignEquity(ac)) return 24; // Finance Act 2023
  // Bonds, gold, real estate, PMS, AIF, REIT, others
  return 36;
}

// Exported only for the CII-coverage guard test (test/invariants) — not used
// by any other runtime caller outside this file.
export function qualifiesForIndexation(
  ac: AssetClass,
  buyDate: Date,
  fundId: string | null = null,
  fundCategoryMap?: Map<string, MFCategory>,
): boolean {
  // Equity/equity MFs: no indexation
  if (isEquityLike(ac) || ac === 'ETF') return false;
  if (ac === 'MUTUAL_FUND') {
    if (isEquityOrientedMF(fundId, fundCategoryMap)) return false;
    // Debt MFs bought before 1-Apr-2023 still qualify; post that, no indexation.
    return buyDate < DEBT_MF_INDEXATION_CUTOFF;
  }
  // Foreign equity post Finance Act 2024 — flat 12.5%, no indexation.
  if (isForeignEquity(ac)) return false;
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

export type IndexationStatus = 'applied' | 'cii_unavailable';

export interface IndexationResult {
  indexedCost: Decimal | null;
  status: IndexationStatus;
}

/**
 * Computes the indexed cost of acquisition for a lot, or reports why it
 * couldn't be computed. Never silently returns `null` on its own — the
 * caller must inspect `status` and, on `'cii_unavailable'`, flag the row for
 * manual review rather than quietly falling back to a non-indexed (higher,
 * possibly wrong) taxable gain. See `qualifiesForIndexation()` call site in
 * `computeFIFOGains` below.
 */
function indexedCost(cost: Decimal, buyDate: Date, sellDate: Date): IndexationResult {
  const buyFy = fyStartYear(buyDate);
  const sellFy = fyStartYear(sellDate);
  const buyCii = CII[buyFy];
  const sellCii = CII[sellFy];
  if (!buyCii || !sellCii) {
    return { indexedCost: null, status: 'cii_unavailable' };
  }
  return { indexedCost: cost.times(sellCii).dividedBy(buyCii), status: 'applied' };
}

function classify(
  ac: AssetClass,
  buyDate: Date,
  sellDate: Date,
  txType: TransactionType,
  fundId: string | null,
  fundCategoryMap?: Map<string, MFCategory>,
): CapitalGainType {
  // Intraday only applies to equity BUY+SELL same day
  if (isEquityLike(ac) && sameDay(buyDate, sellDate) && txType === 'SELL') {
    return 'INTRADAY';
  }
  const holdingDays = daysBetween(buyDate, sellDate);
  const thresholdDays = longTermThresholdMonths(ac, fundId, fundCategoryMap) * 30; // approximate
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
  // Whether this row's underlying instrument is treated as equity-oriented
  // for tax-section bucketing (Sec 111A/112A vs Sec 112). Single source of
  // truth for downstream consumers — do not re-derive from `assetClass`
  // alone, since MUTUAL_FUND rows split into equity- and debt-oriented.
  isEquityOriented: boolean;
  // True when this row needs a human look before the numbers can be trusted
  // as final — either (a) a MUTUAL_FUND row's fund category is unknown (no
  // fundId, or fundId not found in fundCategoryMap), so tax treatment fell
  // back to debt-conservative instead of guessing equity, or (b) the asset
  // class qualifies for indexation but the CII table has no entry for the
  // buy/sell FY, so `taxableGain` is the non-indexed (possibly overstated)
  // figure. `reviewReason` explains which (or both) applied.
  needsReview: boolean;
  reviewReason: string | null;
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

export function computeFIFOGains(
  txs: Transaction[],
  fmvMap?: Map<string, Decimal>, // isin -> fmvPerUnit on 31-Jan-2018
  fundCategoryMap?: Map<string, MFCategory>, // fundId -> MutualFundMaster.category
): CapitalGainRow[] {
  // F&O and forex pairs are §43(5)/§28 business income, not capital gains —
  // strip those rows upstream of the FIFO engine so they can never silently
  // get bucketed as STCG/LTCG.
  const cgEligible = txs.filter(
    (t) => !isFnoSkipped(t.assetClass) && !isForexPair(t.assetClass),
  );
  const groups = groupByAsset(cgEligible);
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

          const gainType = classify(
            key.assetClass,
            lot.buyDate,
            tx.tradeDate,
            tx.transactionType,
            key.fundId,
            fundCategoryMap,
          );
          const equityOriented =
            isEquityLike(key.assetClass) ||
            (key.assetClass === 'MUTUAL_FUND' && isEquityOrientedMF(key.fundId, fundCategoryMap));
          const mfCategoryUnresolved =
            key.assetClass === 'MUTUAL_FUND' && !fundCategoryMap?.get(key.fundId ?? '');

          let indexed: Decimal | null = null;
          let taxableGain = gainLoss;
          let needsReview = mfCategoryUnresolved;
          let reviewReason: string | null = mfCategoryUnresolved
            ? 'Mutual fund category could not be resolved — taxed as debt-conservative (36-month LTCG threshold, no 112A grandfathering); verify the fund category.'
            : null;
          if (
            gainType === 'LONG_TERM' &&
            qualifiesForIndexation(key.assetClass, lot.buyDate, key.fundId, fundCategoryMap)
          ) {
            const result = indexedCost(costBasis, lot.buyDate, tx.tradeDate);
            if (result.status === 'applied') {
              indexed = result.indexedCost;
              taxableGain = proceeds.minus(indexed!);
            } else {
              // Asset class qualifies for indexation but the CII table has no
              // entry for the buy or sell FY — do NOT silently report the
              // non-indexed (higher, possibly wrong) taxable gain as final.
              const sellFy = financialYearOf(tx.tradeDate);
              needsReview = true;
              const ciiReason = `CII not available for FY ${sellFy} — indexation could not be computed; taxable gain shown is non-indexed and may overstate tax.`;
              reviewReason = reviewReason ? `${reviewReason} ${ciiReason}` : ciiReason;
            }
          }

          // Section 112A grandfathering (Sec 55(2)(ac)): cost of acquisition
          // for pre-31-Jan-2018 equity = higher of (actual cost, lower of
          // (FMV on 31-Jan-2018, full value of consideration)). The "lower of
          // FMV/proceeds" cap is mandatory — without it, a lot bought cheap
          // with an FMV above the eventual sale price would understate the
          // taxable gain (or fabricate a loss) beyond what the section allows.
          // Requires a caller-supplied fmvMap (computeUserCapitalGains/
          // computePortfolioCapitalGains preload it from fmvOverride.service.ts);
          // rows for ISINs missing from the map are left uncorrected
          // (gainLoss/taxableGain at actual cost) — the Schedule 112A tab
          // flags those for the user to fill in.
          if (
            gainType === 'LONG_TERM' &&
            equityOriented &&
            lot.buyDate <= GRANDFATHERING_CUTOFF &&
            fmvMap &&
            key.isin &&
            fmvMap.has(key.isin)
          ) {
            const fmvPerUnit = fmvMap.get(key.isin)!;
            const fmvBasis = fmvPerUnit.times(take);
            const lowerOfFmvAndProceeds = Decimal.min(fmvBasis, proceeds);
            const adjustedBasis = Decimal.max(costBasis, lowerOfFmvAndProceeds);
            // taxableGain under Sec 55(2)(ac): use adjusted cost
            taxableGain = proceeds.minus(adjustedBasis);
            // Store adjustedBasis in indexedCostOfAcquisition column
            // (re-using this nullable column — it's the "adjusted acquisition cost")
            indexed = adjustedBasis;
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
            isEquityOriented: equityOriented,
            needsReview,
            reviewReason,
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

async function loadFmvMap(userId: string): Promise<Map<string, Decimal>> {
  const byIsin = await getFmvForUser(userId);
  return new Map([...byIsin.entries()].map(([isin, r]) => [isin, r.fmvPerUnit]));
}

/**
 * Loads the real AMFI/scheme-master category for every distinct fund
 * referenced by the given transactions, so the FIFO engine never has to
 * assume MUTUAL_FUND === equity (TASK-01).
 */
export async function loadFundCategoryMap(txs: Transaction[]): Promise<Map<string, MFCategory>> {
  const fundIds = [
    ...new Set(
      txs.filter((t) => t.assetClass === 'MUTUAL_FUND' && t.fundId).map((t) => t.fundId as string),
    ),
  ];
  if (fundIds.length === 0) return new Map();
  const funds = await prisma.mutualFundMaster.findMany({
    where: { id: { in: fundIds } },
    select: { id: true, category: true },
  });
  return new Map(funds.map((f) => [f.id, f.category]));
}

export async function computePortfolioCapitalGains(portfolioId: string): Promise<CapitalGainsResult> {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true },
  });
  const [txs, fmvMap] = await Promise.all([
    prisma.transaction.findMany({
      where: { portfolioId },
      orderBy: { tradeDate: 'asc' },
    }),
    portfolio ? loadFmvMap(portfolio.userId) : Promise.resolve(new Map<string, Decimal>()),
  ]);
  const fundCategoryMap = await loadFundCategoryMap(txs);
  const rows = computeFIFOGains(txs, fmvMap, fundCategoryMap);
  return { rows, summaryByFy: summarize(rows) };
}

export async function computeUserCapitalGains(userId: string): Promise<CapitalGainsResult> {
  const [txs, fmvMap] = await Promise.all([
    prisma.transaction.findMany({
      where: { portfolio: { userId } },
      orderBy: { tradeDate: 'asc' },
    }),
    loadFmvMap(userId),
  ]);
  const fundCategoryMap = await loadFundCategoryMap(txs);
  const rows = computeFIFOGains(txs, fmvMap, fundCategoryMap);
  return { rows, summaryByFy: summarize(rows) };
}

function toCGCreateInput(r: CapitalGainRow): Prisma.CapitalGainCreateManyInput {
  return {
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
    needsReview: r.needsReview,
    reviewReason: r.reviewReason,
  };
}

export async function persistCapitalGainsForPortfolio(portfolioId: string): Promise<number> {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  // Replace existing rows for this portfolio
  await prisma.capitalGain.deleteMany({ where: { portfolioId } });
  if (rows.length === 0) return 0;
  const data = rows.map(toCGCreateInput);
  await prisma.capitalGain.createMany({ data });
  return data.length;
}

/**
 * Scoped re-persist: only rebuilds CapitalGain rows for one (portfolio,
 * assetKey). Used by transaction edit/delete so we don't re-FIFO the whole
 * portfolio every time a narration changes. §5.1 task 10 / BUG-004.
 *
 * `buyTransactionId` is a bare String on CapitalGain (no FK), so deleting a
 * BUY does NOT cascade-delete the CG rows that reference it — we explicitly
 * wipe by touching-tx-id here. `sellTransactionId` has onDelete:Cascade, but
 * deleteMany is idempotent, so covering both sides is safe and keeps the
 * logic symmetric.
 */
export async function persistCapitalGainsForAsset(
  portfolioId: string,
  assetKey: string,
): Promise<number> {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true },
  });
  const [txs, fmvMap] = await Promise.all([
    prisma.transaction.findMany({
      where: { portfolioId, assetKey },
      orderBy: { tradeDate: 'asc' },
    }),
    portfolio ? loadFmvMap(portfolio.userId) : Promise.resolve(new Map<string, Decimal>()),
  ]);
  const fundCategoryMap = await loadFundCategoryMap(txs);
  const txIds = txs.map((t) => t.id);

  // Clear any prior CG rows that touch this asset's transactions (either as
  // buy or sell leg). Scope to portfolioId as a belt-and-suspenders filter so
  // we never wander into another user's data.
  if (txIds.length > 0) {
    await prisma.capitalGain.deleteMany({
      where: {
        portfolioId,
        OR: [
          { buyTransactionId: { in: txIds } },
          { sellTransactionId: { in: txIds } },
        ],
      },
    });
  }

  const rows = computeFIFOGains(txs, fmvMap, fundCategoryMap);
  if (rows.length === 0) return 0;
  await prisma.capitalGain.createMany({ data: rows.map(toCGCreateInput) });
  return rows.length;
}
