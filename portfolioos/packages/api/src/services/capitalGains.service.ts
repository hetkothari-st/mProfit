import { Decimal } from 'decimal.js';
import type {
  AssetClass,
  CapitalGainType,
  MFCategory,
  Prisma,
  Transaction,
  TransactionType,
} from '@prisma/client';
import { CII_BY_FY } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { getFmvForUser } from './fmvOverride.service.js';
import { computeAssetKey } from './assetKey.js';

// ─── Indian tax constants ───────────────────────────────────────────

// Cost Inflation Index (CII) — CBDT Notifications, keyed by the *starting*
// year of the FY (e.g. 2001 means FY 2001-02 with base CII 100). Derived from
// the shared "YYYY-YY"-keyed table so property sales (propertyCapitalGain.ts)
// and Transaction rows index against the same values. A missing FY is
// reported as `cii_unavailable` and flagged, never silently skipped.
const CII: Record<number, number> = Object.fromEntries(
  Object.entries(CII_BY_FY).map(([fy, value]) => [Number.parseInt(fy.slice(0, 4), 10), value]),
);

// Exported: fmvOverride.service.ts uses the same cutoff to decide which
// CapitalGain rows are eligible for grandfathering (circular import — safe,
// only referenced inside function bodies, never at module-eval time).
export const GRANDFATHERING_CUTOFF = new Date('2018-01-31T00:00:00Z');
/** Sec 112A applies to transfers from this date; before it, 10(38) exempted equity LTCG. */
const SEC_112A_START = new Date('2018-04-01T00:00:00Z');
/** Sec 50AA: non-equity MF units acquired on/after this date are "specified mutual funds". */
const SPECIFIED_MF_CUTOFF = new Date('2023-04-01T00:00:00Z');
/**
 * Finance (No. 2) Act 2024: for transfers on/after this date, holding periods
 * are 12 months (listed securities, equity-fund units, business-trust units)
 * or 24 months (everything else), and indexation is withdrawn.
 */
export const FINANCE_ACT_2024_CUTOFF = new Date('2024-07-23T00:00:00Z');
/** From FY 2025-26, sec 50AA covers only funds with more than 65% in debt, so gold ETFs drop out. */
const SPECIFIED_MF_NARROWED = new Date('2025-04-01T00:00:00Z');

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

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Same calendar day `months` later, clamped to month end (31 Jan + 1 month → 28/29 Feb). */
export function addMonthsUTC(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

/**
 * Sec 2(42A): an asset is short-term if held for "not more than" N months, so
 * it is long-term only when sold strictly after the same day N months later.
 */
export function heldMoreThanMonths(buyDate: Date, sellDate: Date, months: number): boolean {
  return sellDate.getTime() > addMonthsUTC(buyDate, months).getTime();
}

function isEquityLike(ac: AssetClass): boolean {
  return ac === 'EQUITY' || ac === 'ETF';
}

/**
 * Asset classes that never produce capital gains here:
 *  - F&O and forex pairs are §43(5)/§28 business income (foPnl / forex services).
 *  - Deposits, small savings, PF, NPS, insurance and cash return principal plus
 *    interest; a maturity is not a transfer of a capital asset, and the
 *    interest is income from other sources (reported by the income reports).
 */
const NON_CAPITAL_ASSETS = new Set<AssetClass>([
  'FUTURES',
  'OPTIONS',
  'FOREX_PAIR',
  'FIXED_DEPOSIT',
  'RECURRING_DEPOSIT',
  'NPS',
  'PPF',
  'EPF',
  'ULIP',
  'INSURANCE',
  'CASH',
  'NSC',
  'KVP',
  'SCSS',
  'SSY',
  'POST_OFFICE_MIS',
  'POST_OFFICE_RD',
  'POST_OFFICE_TD',
  'POST_OFFICE_SAVINGS',
]);

/** INR value of a transaction's net amount (Rule 115: foreign legs at the rate frozen on the trade date). */
function inrNetAmount(tx: Transaction): { value: Decimal; converted: boolean } {
  const raw = new Decimal(tx.netAmount.toString());
  const currency = (tx as Transaction & { currency?: string | null }).currency;
  if (!currency || currency === 'INR') return { value: raw, converted: true };
  const t = tx as Transaction & {
    fxRateAtTrade?: { toString(): string } | null;
    inrEquivalent?: { toString(): string } | null;
  };
  if (t.fxRateAtTrade) return { value: raw.times(t.fxRateAtTrade.toString()), converted: true };
  if (t.inrEquivalent) return { value: new Decimal(t.inrEquivalent.toString()), converted: true };
  return { value: raw, converted: false };
}

// ─── Tax treatment ──────────────────────────────────────────────────

type MfOrientation = 'equity' | 'debt' | 'ambiguous' | 'unknown';

/**
 * Whether a MUTUAL_FUND is equity-oriented. Unknown or mixed categories are
 * never guessed as equity: they get debt-conservative treatment and a review
 * flag, because index funds, ETFs, hybrids and fund-of-funds can be either.
 */
function mfOrientation(fundId: string | null, fundCategoryMap?: Map<string, MFCategory>): MfOrientation {
  if (!fundId || !fundCategoryMap) return 'unknown';
  const cat = fundCategoryMap.get(fundId);
  if (!cat) return 'unknown';
  if (cat === 'EQUITY' || cat === 'ELSS') return 'equity';
  if (cat === 'DEBT' || cat === 'LIQUID' || cat === 'FMP') return 'debt';
  return 'ambiguous';
}

const UNKNOWN_MF_NOTE =
  'Mutual fund category could not be resolved — taxed as a debt fund (no 12-month equity rule, no 112A grandfathering); verify the fund category.';
const AMBIGUOUS_MF_NOTE =
  'Fund category (index / ETF / hybrid / solution-oriented / other) can be equity- or debt-oriented — taxed as a debt fund; if it holds 65% or more in Indian equity it is equity-oriented (12-month rule, sec 111A/112A).';

interface TaxTreatment {
  /** Months that must be exceeded for long-term; null = always short-term. */
  longTermAfterMonths: number | null;
  indexation: boolean;
  /** Sec 111A / 112A asset (listed equity, equity-oriented fund, business-trust unit). */
  equityOriented: boolean;
  note: string | null;
}

/**
 * Holding period, indexation and tax section for one lot, by the rules in
 * force on the transfer date.
 */
function taxTreatment(
  ac: AssetClass,
  buyDate: Date,
  sellDate: Date,
  orientation: MfOrientation,
): TaxTreatment {
  const newRegime = sellDate >= FINANCE_ACT_2024_CUTOFF;
  switch (ac) {
    case 'EQUITY':
    case 'ETF':
      return { longTermAfterMonths: 12, indexation: false, equityOriented: true, note: null };
    case 'REIT':
    case 'INVIT':
      // Listed business-trust units: 36 months before 23-Jul-2024, 12 after; sec 111A/112A.
      return { longTermAfterMonths: newRegime ? 12 : 36, indexation: false, equityOriented: true, note: null };
    case 'MUTUAL_FUND': {
      if (orientation === 'equity') {
        return { longTermAfterMonths: 12, indexation: false, equityOriented: true, note: null };
      }
      const note =
        orientation === 'unknown' ? UNKNOWN_MF_NOTE : orientation === 'ambiguous' ? AMBIGUOUS_MF_NOTE : null;
      if (buyDate >= SPECIFIED_MF_CUTOFF) {
        // Sec 50AA: gains on specified mutual fund units are always short-term.
        return { longTermAfterMonths: null, indexation: false, equityOriented: false, note };
      }
      return newRegime
        ? { longTermAfterMonths: 24, indexation: false, equityOriented: false, note }
        : { longTermAfterMonths: 36, indexation: true, equityOriented: false, note };
    }
    case 'GOLD_ETF':
      if (buyDate >= SPECIFIED_MF_CUTOFF && sellDate < SPECIFIED_MF_NARROWED) {
        return { longTermAfterMonths: null, indexation: false, equityOriented: false, note: null };
      }
      return newRegime
        ? { longTermAfterMonths: 24, indexation: false, equityOriented: false, note: null }
        : { longTermAfterMonths: 36, indexation: true, equityOriented: false, note: null };
    case 'GOLD_BOND':
      // Sovereign Gold Bonds are listed; sec 48 lets SGBs keep indexation (until 23-Jul-2024).
      return { longTermAfterMonths: 12, indexation: !newRegime, equityOriented: false, note: null };
    case 'BOND':
    case 'GOVT_BOND':
    case 'CORPORATE_BOND':
      // Treated as listed. Sec 48 denies indexation on bonds and debentures.
      return { longTermAfterMonths: 12, indexation: false, equityOriented: false, note: null };
    case 'REAL_ESTATE':
      return newRegime
        ? { longTermAfterMonths: 24, indexation: false, equityOriented: false, note: null }
        : { longTermAfterMonths: 24, indexation: true, equityOriented: false, note: null };
    case 'FOREIGN_EQUITY':
    case 'PRIVATE_EQUITY':
      // Unlisted in India: 24 months; indexation until 23-Jul-2024.
      return { longTermAfterMonths: 24, indexation: !newRegime, equityOriented: false, note: null };
    case 'CRYPTOCURRENCY':
      return {
        longTermAfterMonths: null,
        indexation: false,
        equityOriented: false,
        note: 'Virtual digital asset: taxed at a flat 30% under sec 115BBH with no deduction other than cost, and losses cannot be set off or carried forward.',
      };
    default:
      // Physical gold/silver, art, AIF/PMS units and other capital assets.
      return newRegime
        ? { longTermAfterMonths: 24, indexation: false, equityOriented: false, note: null }
        : { longTermAfterMonths: 36, indexation: true, equityOriented: false, note: null };
  }
}

// Exported for the CII-coverage guard test. `sellDate` defaults to the last day
// indexation existed, so the guard lists every class that could ever index.
export function qualifiesForIndexation(
  ac: AssetClass,
  buyDate: Date,
  fundId: string | null = null,
  fundCategoryMap?: Map<string, MFCategory>,
  sellDate: Date = new Date('2024-07-22T00:00:00Z'),
): boolean {
  if (NON_CAPITAL_ASSETS.has(ac)) return false;
  return taxTreatment(ac, buyDate, sellDate, mfOrientation(fundId, fundCategoryMap)).indexation;
}

export type IndexationStatus = 'applied' | 'cii_unavailable';

export interface IndexationResult {
  indexedCost: Decimal | null;
  status: IndexationStatus;
}

function indexedCost(cost: Decimal, buyDate: Date, sellDate: Date): IndexationResult {
  const buyCii = CII[fyStartYear(buyDate)];
  const sellCii = CII[fyStartYear(sellDate)];
  if (!buyCii || !sellCii) {
    return { indexedCost: null, status: 'cii_unavailable' };
  }
  return { indexedCost: cost.times(sellCii).dividedBy(buyCii), status: 'applied' };
}

// ─── FIFO engine ────────────────────────────────────────────────────

const BUY_TYPES = new Set<TransactionType>([
  'BUY',
  'SIP',
  'SWITCH_IN',
  'BONUS',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'OPENING_BALANCE',
]);

const SELL_TYPES = new Set<TransactionType>(['SELL', 'SWITCH_OUT', 'REDEMPTION', 'MATURITY']);

/** Amalgamation / demerger legs: not transfers (sec 47); cost and holding date carry over. */
const CARRY_OUT_TYPES = new Set<TransactionType>(['MERGER_OUT', 'DEMERGER_OUT']);
const CARRY_IN_TYPES = new Set<TransactionType>(['MERGER_IN', 'DEMERGER_IN']);
/** How far apart a merger's out and in legs may be recorded and still be linked. */
const CARRY_WINDOW_DAYS = 31;

interface Lot {
  buyTxId: string;
  buyDate: Date;
  qty: Decimal;
  costPerUnit: Decimal; // INR, net of charges
  note: string | null;
}

interface CarriedLot {
  buyTxId: string;
  buyDate: Date;
  qty: Decimal;
  cost: Decimal;
  outDate: Date;
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
  // Whether this row is a sec 111A/112A asset. Single source of truth for
  // downstream consumers — do not re-derive from `assetClass` alone, since
  // MUTUAL_FUND rows split into equity- and debt-oriented.
  isEquityOriented: boolean;
  // True when the numbers need a human look before they can be trusted as
  // final; `reviewReason` explains why.
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

interface Group {
  portfolioId: string;
  assetClass: AssetClass;
  fundId: string | null;
  isin: string | null;
  assetName: string;
  lots: Lot[];
}

function groupKey(tx: Transaction): string {
  return `${tx.portfolioId}|${tx.assetKey ?? computeAssetKey(tx)}`;
}

/** Same-day processing order: split first (ex-date), then acquisitions, merger legs, disposals. */
function sameDayRank(type: TransactionType): number {
  if (type === 'SPLIT') return 0;
  if (BUY_TYPES.has(type)) return 1;
  if (CARRY_OUT_TYPES.has(type)) return 2;
  if (CARRY_IN_TYPES.has(type)) return 3;
  return 4;
}

function joinNotes(notes: Array<string | null>): string | null {
  const unique = [...new Set(notes.filter((n): n is string => Boolean(n)))];
  return unique.length ? unique.join(' ') : null;
}

export function computeFIFOGains(
  txs: Transaction[],
  fmvMap?: Map<string, Decimal>, // isin -> fmvPerUnit on 31-Jan-2018
  fundCategoryMap?: Map<string, MFCategory>, // fundId -> MutualFundMaster.category
): CapitalGainRow[] {
  const relevant = txs.filter(
    (t) =>
      !NON_CAPITAL_ASSETS.has(t.assetClass) &&
      (BUY_TYPES.has(t.transactionType) ||
        SELL_TYPES.has(t.transactionType) ||
        CARRY_OUT_TYPES.has(t.transactionType) ||
        CARRY_IN_TYPES.has(t.transactionType) ||
        t.transactionType === 'SPLIT'),
  );

  // One lot queue per (portfolio, assetKey) — the key holdings use, so a sale
  // imported with an ISIN still meets a purchase entered without one, and two
  // different name-only assets never share lots.
  const groups = new Map<string, Group>();
  for (const tx of relevant) {
    const k = groupKey(tx);
    const g = groups.get(k);
    if (!g) {
      groups.set(k, {
        portfolioId: tx.portfolioId,
        assetClass: tx.assetClass,
        fundId: tx.fundId,
        isin: tx.isin,
        assetName: tx.assetName ?? '',
        lots: [],
      });
    } else {
      g.fundId ??= tx.fundId;
      g.isin ??= tx.isin;
      if (!g.assetName && tx.assetName) g.assetName = tx.assetName;
    }
  }

  // Chronological across all assets, so a merger's out leg (one asset) is seen
  // before its in leg (another asset).
  const ordered = [...relevant].sort((a, b) => {
    const d = a.tradeDate.getTime() - b.tradeDate.getTime();
    if (d !== 0) return d;
    const r = sameDayRank(a.transactionType) - sameDayRank(b.transactionType);
    if (r !== 0) return r;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const carried = new Map<string, CarriedLot[]>(); // portfolioId -> lots taken out by a merger
  const rows: CapitalGainRow[] = [];

  for (const tx of ordered) {
    const g = groups.get(groupKey(tx))!;
    const qty = new Decimal(tx.quantity.toString());
    if (qty.isZero() || qty.isNegative()) continue;
    const { value: net, converted } = inrNetAmount(tx);
    const fxNote = converted
      ? null
      : `Foreign-currency trade has no exchange rate — amounts are in ${
          (tx as Transaction & { currency?: string | null }).currency
        }, not INR; add the rate on the trade date.`;
    const type = tx.transactionType;

    if (type === 'SPLIT') {
      // SPLIT rows carry the extra units. Spread them over the open lots so each
      // keeps its purchase date and total cost.
      const open = g.lots.reduce((s, l) => s.plus(l.qty), new Decimal(0));
      if (open.greaterThan(0)) {
        const factor = open.plus(qty).dividedBy(open);
        for (const lot of g.lots) {
          lot.qty = lot.qty.times(factor);
          lot.costPerUnit = lot.costPerUnit.dividedBy(factor);
        }
      }
      continue;
    }

    if (BUY_TYPES.has(type)) {
      // Bonus shares cost nil and are held from allotment (sec 55(2)(aa)).
      const costPerUnit = type === 'BONUS' ? new Decimal(0) : net.dividedBy(qty);
      g.lots.push({ buyTxId: tx.id, buyDate: tx.tradeDate, qty, costPerUnit, note: fxNote });
      continue;
    }

    if (CARRY_OUT_TYPES.has(type)) {
      let remaining = qty;
      const out = carried.get(g.portfolioId) ?? [];
      while (remaining.greaterThan(0) && g.lots.length > 0) {
        const lot = g.lots[0]!;
        const take = Decimal.min(lot.qty, remaining);
        out.push({
          buyTxId: lot.buyTxId,
          buyDate: lot.buyDate,
          qty: take,
          cost: lot.costPerUnit.times(take),
          outDate: tx.tradeDate,
        });
        lot.qty = lot.qty.minus(take);
        remaining = remaining.minus(take);
        if (lot.qty.lessThanOrEqualTo(0)) g.lots.shift();
      }
      carried.set(g.portfolioId, out);
      continue;
    }

    if (CARRY_IN_TYPES.has(type)) {
      const windowStart = tx.tradeDate.getTime() - CARRY_WINDOW_DAYS * 86_400_000;
      const pool = (carried.get(g.portfolioId) ?? []).filter(
        (c) => c.outDate.getTime() >= windowStart && c.outDate.getTime() <= tx.tradeDate.getTime(),
      );
      if (pool.length > 0) {
        // Sec 49(2) / 2(42A): the new shares take over the old cost and holding period.
        const poolQty = pool.reduce((s, c) => s.plus(c.qty), new Decimal(0));
        for (const c of pool) {
          const newQty = qty.times(c.qty).dividedBy(poolQty);
          g.lots.push({
            buyTxId: c.buyTxId,
            buyDate: c.buyDate,
            qty: newQty,
            costPerUnit: c.cost.dividedBy(newQty),
            note: fxNote,
          });
        }
        carried.set(
          g.portfolioId,
          (carried.get(g.portfolioId) ?? []).filter((c) => !pool.includes(c)),
        );
      } else {
        g.lots.push({
          buyTxId: tx.id,
          buyDate: tx.tradeDate,
          qty,
          costPerUnit: net.dividedBy(qty),
          note: joinNotes([
            fxNote,
            `${type === 'MERGER_IN' ? 'Merger' : 'Demerger'} units are not linked to the shares they replaced — cost and holding period should carry over from the original purchase (sec 49(2), 2(42A)); record the matching ${type === 'MERGER_IN' ? 'MERGER_OUT' : 'DEMERGER_OUT'} or edit the cost.`,
          ]),
        });
      }
      continue;
    }

    // ── Disposal ──
    const sellPricePerUnit = net.dividedBy(qty);
    const orientation = g.assetClass === 'MUTUAL_FUND' ? mfOrientation(g.fundId, fundCategoryMap) : 'equity';

    // An intraday square-off matches that day's purchases before older lots.
    const intradayFirst = isEquityLike(g.assetClass) && type === 'SELL';
    const order = intradayFirst
      ? [
          ...g.lots.filter((l) => sameDay(l.buyDate, tx.tradeDate)),
          ...g.lots.filter((l) => !sameDay(l.buyDate, tx.tradeDate)),
        ]
      : [...g.lots];

    let remaining = qty;
    for (const lot of order) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = Decimal.min(lot.qty, remaining);
      const costBasis = lot.costPerUnit.times(take);
      const proceeds = sellPricePerUnit.times(take);
      const gainLoss = proceeds.minus(costBasis);
      const treatment = taxTreatment(g.assetClass, lot.buyDate, tx.tradeDate, orientation);
      const notes: Array<string | null> = [lot.note, fxNote, treatment.note];

      let gainType: CapitalGainType;
      if (isEquityLike(g.assetClass) && type === 'SELL' && sameDay(lot.buyDate, tx.tradeDate)) {
        gainType = 'INTRADAY';
      } else if (treatment.longTermAfterMonths === null) {
        gainType = 'SHORT_TERM';
      } else {
        gainType = heldMoreThanMonths(lot.buyDate, tx.tradeDate, treatment.longTermAfterMonths)
          ? 'LONG_TERM'
          : 'SHORT_TERM';
      }

      let indexed: Decimal | null = null;
      let taxableGain = gainLoss;

      if (gainType === 'LONG_TERM' && treatment.indexation) {
        const result = indexedCost(costBasis, lot.buyDate, tx.tradeDate);
        if (result.status === 'applied') {
          indexed = result.indexedCost;
          taxableGain = proceeds.minus(indexed!);
        } else {
          notes.push(
            `CII not available for FY ${financialYearOf(lot.buyDate)} or ${financialYearOf(tx.tradeDate)} — indexation could not be computed; taxable gain shown is non-indexed and may overstate tax.`,
          );
        }
      }

      if (
        g.assetClass === 'REAL_ESTATE' &&
        gainType === 'LONG_TERM' &&
        tx.tradeDate >= FINANCE_ACT_2024_CUTOFF &&
        lot.buyDate < FINANCE_ACT_2024_CUTOFF
      ) {
        notes.push(
          'Land or building bought before 23-Jul-2024: a resident individual/HUF may instead pay 20% on the indexed gain if that is lower (sec 112 proviso).',
        );
      }

      if (
        ['BOND', 'GOVT_BOND', 'CORPORATE_BOND'].includes(g.assetClass) &&
        gainType === 'LONG_TERM'
      ) {
        notes.push(
          'Treated as a listed bond (long-term after 12 months). If it is unlisted: it needed 36 months before 23-Jul-2024, and from 23-Jul-2024 its gains are always short-term (sec 50AA).',
        );
      }

      if (
        g.assetClass === 'GOLD_ETF' &&
        tx.tradeDate >= FINANCE_ACT_2024_CUTOFF &&
        gainType === 'SHORT_TERM' &&
        treatment.longTermAfterMonths !== null &&
        heldMoreThanMonths(lot.buyDate, tx.tradeDate, 12)
      ) {
        notes.push(
          'Gold ETF held more than 12 but not more than 24 months: treated as short-term; check whether listed-ETF units qualify for the 12-month rule for this sale.',
        );
      }

      // Sec 55(2)(ac) grandfathering for 112A assets bought on/before 31-Jan-2018:
      // cost = higher of (actual cost, lower of (FMV on 31-Jan-2018, sale value)).
      if (
        gainType === 'LONG_TERM' &&
        treatment.equityOriented &&
        lot.buyDate <= GRANDFATHERING_CUTOFF &&
        tx.tradeDate >= SEC_112A_START &&
        fmvMap &&
        g.isin &&
        fmvMap.has(g.isin)
      ) {
        const fmvBasis = fmvMap.get(g.isin)!.times(take);
        const adjustedBasis = Decimal.max(costBasis, Decimal.min(fmvBasis, proceeds));
        taxableGain = proceeds.minus(adjustedBasis);
        // Stored in indexedCostOfAcquisition — it's the adjusted cost of acquisition.
        indexed = adjustedBasis;
      }

      if (gainType === 'LONG_TERM' && treatment.equityOriented && tx.tradeDate < SEC_112A_START) {
        taxableGain = new Decimal(0);
        notes.push('Long-term gain on listed equity transferred before 1-Apr-2018: exempt under sec 10(38).');
      }

      if (g.assetClass === 'GOLD_BOND' && (type === 'MATURITY' || type === 'REDEMPTION')) {
        taxableGain = new Decimal(0);
        notes.push('Sovereign Gold Bond redeemed with RBI: exempt for individuals under sec 47(viic).');
      }

      const reviewReason = joinNotes(notes);
      rows.push({
        portfolioId: g.portfolioId,
        sellTransactionId: tx.id,
        buyTransactionId: lot.buyTxId,
        assetClass: g.assetClass,
        assetName: tx.assetName ?? g.assetName,
        isin: g.isin,
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
        isEquityOriented: treatment.equityOriented,
        needsReview: reviewReason !== null,
        reviewReason,
      });

      lot.qty = lot.qty.minus(take);
      remaining = remaining.minus(take);
    }
    g.lots = g.lots.filter((l) => l.qty.greaterThan(0));

    if (remaining.greaterThan(0)) {
      // Sold more than the recorded purchases: keep the sale visible (at nil
      // cost, so tax is not understated) and ask for the missing purchase.
      const proceeds = sellPricePerUnit.times(remaining);
      const treatment = taxTreatment(g.assetClass, tx.tradeDate, tx.tradeDate, orientation);
      rows.push({
        portfolioId: g.portfolioId,
        sellTransactionId: tx.id,
        buyTransactionId: tx.id,
        assetClass: g.assetClass,
        assetName: tx.assetName ?? g.assetName,
        isin: g.isin,
        buyDate: tx.tradeDate,
        sellDate: tx.tradeDate,
        quantity: remaining,
        buyPrice: new Decimal(0),
        sellPrice: sellPricePerUnit,
        buyAmount: new Decimal(0),
        sellAmount: proceeds,
        indexedCostOfAcquisition: null,
        capitalGainType: 'SHORT_TERM',
        gainLoss: proceeds,
        taxableGain: proceeds,
        financialYear: financialYearOf(tx.tradeDate),
        isEquityOriented: treatment.equityOriented,
        needsReview: true,
        reviewReason: joinNotes([
          fxNote,
          `Sold ${remaining.toString()} more units than the recorded purchases — shown at nil cost and short-term; add the purchase to compute the real cost and holding period.`,
        ]),
      });
    }
  }

  return rows;
}

/**
 * Per-FY totals. `taxable` applies the set-off rules instead of netting
 * everything: short-term losses reduce short-term then long-term gains,
 * long-term losses reduce only long-term gains, speculative (intraday) losses
 * stay within speculation, and virtual-digital-asset losses offset nothing.
 */
export function summarizeCapitalGains(rows: CapitalGainRow[]): CapitalGainsResult['summaryByFy'] {
  const acc: Record<
    string,
    { intraday: Decimal; stcg: Decimal; ltcg: Decimal; st: Decimal; lt: Decimal; spec: Decimal; vda: Decimal }
  > = {};
  const zero = () => new Decimal(0);
  for (const r of rows) {
    const b = (acc[r.financialYear] ??= {
      intraday: zero(),
      stcg: zero(),
      ltcg: zero(),
      st: zero(),
      lt: zero(),
      spec: zero(),
      vda: zero(),
    });
    if (r.capitalGainType === 'INTRADAY') {
      b.intraday = b.intraday.plus(r.gainLoss);
      b.spec = b.spec.plus(r.taxableGain);
    } else if (r.assetClass === 'CRYPTOCURRENCY') {
      b.stcg = b.stcg.plus(r.gainLoss);
      if (r.taxableGain.greaterThan(0)) b.vda = b.vda.plus(r.taxableGain);
    } else if (r.capitalGainType === 'SHORT_TERM') {
      b.stcg = b.stcg.plus(r.gainLoss);
      b.st = b.st.plus(r.taxableGain);
    } else {
      b.ltcg = b.ltcg.plus(r.gainLoss);
      b.lt = b.lt.plus(r.taxableGain);
    }
  }
  const out: CapitalGainsResult['summaryByFy'] = {};
  for (const [fy, b] of Object.entries(acc)) {
    let st = b.st;
    let lt = b.lt;
    if (st.isNegative()) {
      lt = lt.plus(st);
      st = zero();
    }
    const taxable = Decimal.max(st, 0)
      .plus(Decimal.max(lt, 0))
      .plus(Decimal.max(b.spec, 0))
      .plus(b.vda);
    out[fy] = { intraday: b.intraday, stcg: b.stcg, ltcg: b.ltcg, taxable };
  }
  return out;
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
  return { rows, summaryByFy: summarizeCapitalGains(rows) };
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
  return { rows, summaryByFy: summarizeCapitalGains(rows) };
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
  const data = rows.map(toCGCreateInput);
  // Replace atomically: a failed insert keeps the previous rows, and two
  // rebuilds can't interleave into duplicates.
  await runInTransaction(async (db) => {
    await db.capitalGain.deleteMany({ where: { portfolioId } });
    if (data.length > 0) await db.capitalGain.createMany({ data });
  });
  return data.length;
}

/**
 * Scoped re-persist: only rebuilds CapitalGain rows for one (portfolio,
 * assetKey). Used by transaction create/edit/delete so we don't re-FIFO the
 * whole portfolio every time a narration changes. §5.1 task 10 / BUG-004.
 *
 * `buyTransactionId` is a bare String on CapitalGain (no FK), so deleting a
 * BUY does NOT cascade-delete the CG rows that reference it — we explicitly
 * wipe by touching-tx-id here.
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
  const data = computeFIFOGains(txs, fmvMap, fundCategoryMap).map(toCGCreateInput);

  await runInTransaction(async (db) => {
    if (txIds.length > 0) {
      await db.capitalGain.deleteMany({
        where: {
          portfolioId,
          OR: [{ buyTransactionId: { in: txIds } }, { sellTransactionId: { in: txIds } }],
        },
      });
    }
    if (data.length > 0) await db.capitalGain.createMany({ data });
  });
  return data.length;
}
