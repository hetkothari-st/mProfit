import { Decimal } from 'decimal.js';
import type { AssetClass, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import {
  computeUserCapitalGains,
  financialYearOf,
  type CapitalGainRow,
} from './capitalGains.service.js';
import { buildSchedule43Report } from './reports/schedule43.report.js';

/**
 * Tax module — user-level (cross-portfolio) tax reporting.
 *
 * Sits on top of capitalGains.service (per-asset FIFO engine) + foPnl.service
 * (F&O business income) and produces ITR-aligned consolidated reports
 * comparable to mProfit / i-Record:
 *   - Tax summary (FY-level with estimated liability per section)
 *   - Schedule 112A scrip-wise CSV (ITR-portal compatible)
 *   - Schedule 112 (non-equity LTCG with indexation)
 *   - STCG / LTCG / Intraday / F&O reports
 *   - Dividend + Interest income consolidation
 *   - Tax-loss harvesting view (unrealised losses available to offset)
 */

// ─── Tax rates (FY 2024-25+, post-Finance Act 2024) ─────────────────

const RATE_CHANGE_DATE = new Date('2024-07-23T00:00:00Z');

interface TaxRates {
  // §111A: STCG on listed equity / equity MF / ETF (STT paid)
  stcgEquityPct: number;
  // §112A: LTCG on listed equity / equity MF / ETF over exemption
  ltcgEquityPct: number;
  ltcgEquityExemption: Decimal;
  // §112: LTCG on other assets — indexed (pre-23-Jul-2024) or non-indexed (post)
  ltcgOtherIndexedPct: number;
  ltcgOtherNonIndexedPct: number;
  // Slab (used as estimate for STCG non-equity, intraday speculation, F&O)
  // Defaults to top slab; user-configurable in future.
  slabPct: number;
}

function ratesForDate(d: Date): TaxRates {
  const isPost = d >= RATE_CHANGE_DATE;
  return {
    stcgEquityPct: isPost ? 20 : 15,
    ltcgEquityPct: isPost ? 12.5 : 10,
    ltcgEquityExemption: new Decimal(isPost ? 125000 : 100000),
    ltcgOtherIndexedPct: 20,
    ltcgOtherNonIndexedPct: 12.5,
    slabPct: 30,
  };
}

// Returns the predominant rate set for an FY (taken from the FY-end date).
function ratesForFy(fy: string): TaxRates {
  const startYear = parseInt(fy.split('-')[0]!, 10);
  // Use 31-Mar of the closing year as a reference point
  return ratesForDate(new Date(`${startYear + 1}-03-31T00:00:00Z`));
}

// ─── Helpers ────────────────────────────────────────────────────────

function isListedEquityClass(ac: AssetClass): boolean {
  return ac === 'EQUITY' || ac === 'ETF' || ac === 'MUTUAL_FUND';
}

function pct(amount: Decimal, percentage: number): Decimal {
  return amount.times(percentage).dividedBy(100);
}

async function userCgRows(userId: string, fy?: string): Promise<CapitalGainRow[]> {
  const { rows } = await computeUserCapitalGains(userId);
  return fy ? rows.filter((r) => r.financialYear === fy) : rows;
}

function fyOptionsFromRows(rows: CapitalGainRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.financialYear);
  return Array.from(set).sort().reverse();
}

/**
 * Returns FYs (descending) where the user has any taxable activity:
 * realised capital gains, dividend/interest income, F&O trades, or
 * maturity proceeds. Used by the Tax page to default the FY selector
 * to the latest FY with data instead of the calendar-current FY.
 */
export async function availableTaxFys(userId: string): Promise<string[]> {
  const [cgRows, txs] = await Promise.all([
    computeUserCapitalGains(userId).then((r) => r.rows),
    prisma.transaction.findMany({
      where: { portfolio: { userId } },
      select: { tradeDate: true },
    }),
  ]);
  const set = new Set<string>();
  for (const r of cgRows) set.add(r.financialYear);
  for (const t of txs) set.add(financialYearOf(t.tradeDate));
  return Array.from(set).sort().reverse();
}

// ─── User-scoped cross-portfolio CG reports ─────────────────────────

export async function userStcgReport(userId: string, fy?: string) {
  const rows = (await userCgRows(userId, fy)).filter((r) => r.capitalGainType === 'SHORT_TERM');
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const taxable = rows.reduce((a, r) => a.plus(r.taxableGain), new Decimal(0));
  return { rows: rows.map(rowToJson), totalGain: totalGain.toString(), taxable: taxable.toString(), count: rows.length };
}

export async function userLtcgReport(userId: string, fy?: string) {
  const rows = (await userCgRows(userId, fy)).filter((r) => r.capitalGainType === 'LONG_TERM');
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const taxable = rows.reduce((a, r) => a.plus(r.taxableGain), new Decimal(0));
  return { rows: rows.map(rowToJson), totalGain: totalGain.toString(), taxable: taxable.toString(), count: rows.length };
}

export async function userIntradayReport(userId: string, fy?: string) {
  const rows = (await userCgRows(userId, fy)).filter((r) => r.capitalGainType === 'INTRADAY');
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  return { rows: rows.map(rowToJson), totalGain: totalGain.toString(), count: rows.length };
}

/**
 * Schedule 112A — LTCG on listed equity / equity MF / ETF.
 * Applies the post-Jul-2024 ₹1.25L exemption if FY ≥ 2024-25, else ₹1L.
 */
export async function userSchedule112AReport(userId: string, fy?: string) {
  const all = await userCgRows(userId, fy);
  const rows = all.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && isListedEquityClass(r.assetClass),
  );
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const rates = fy ? ratesForFy(fy) : ratesForDate(new Date());
  const taxable = Decimal.max(totalGain.minus(rates.ltcgEquityExemption), new Decimal(0));
  const estimatedTax = pct(taxable, rates.ltcgEquityPct);
  return {
    rows: rows.map(rowToJson),
    totalGain: totalGain.toString(),
    exemptionLimit: rates.ltcgEquityExemption.toString(),
    taxable: taxable.toString(),
    ratePct: rates.ltcgEquityPct,
    estimatedTax: estimatedTax.toString(),
    count: rows.length,
  };
}

/**
 * Schedule 112 — LTCG on non-equity assets (debt MF, bonds, gold, real estate,
 * foreign equity, etc.). Shows indexed cost + tax estimate.
 */
export async function userSchedule112Report(userId: string, fy?: string) {
  const all = await userCgRows(userId, fy);
  const rows = all.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && !isListedEquityClass(r.assetClass),
  );
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const totalTaxable = rows.reduce((a, r) => a.plus(r.taxableGain), new Decimal(0));
  // Per-row estimated tax: indexed → 20%, non-indexed → 12.5%
  let estimatedTax = new Decimal(0);
  for (const r of rows) {
    const ratePct = r.indexedCostOfAcquisition ? 20 : 12.5;
    estimatedTax = estimatedTax.plus(pct(r.taxableGain, ratePct));
  }
  return {
    rows: rows.map(rowToJson),
    totalGain: totalGain.toString(),
    taxable: totalTaxable.toString(),
    estimatedTax: estimatedTax.toString(),
    count: rows.length,
  };
}

// ─── Income (dividends + interest) consolidated across portfolios ───

const INCOME_TYPES: TransactionType[] = ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY'];

export async function userIncomeReport(userId: string, fy?: string) {
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      transactionType: { in: INCOME_TYPES },
    },
    include: { portfolio: { select: { name: true } } },
    orderBy: { tradeDate: 'asc' },
  });
  const filtered = fy ? txs.filter((t) => financialYearOf(t.tradeDate) === fy) : txs;
  let dividend = new Decimal(0);
  let interest = new Decimal(0);
  let maturity = new Decimal(0);
  for (const t of filtered) {
    const amt = new Decimal(t.netAmount.toString());
    if (t.transactionType === 'DIVIDEND_PAYOUT') dividend = dividend.plus(amt);
    else if (t.transactionType === 'INTEREST_RECEIVED') interest = interest.plus(amt);
    else if (t.transactionType === 'MATURITY') maturity = maturity.plus(amt);
  }
  return {
    rows: filtered.map((t) => ({
      id: t.id,
      date: t.tradeDate,
      type: t.transactionType,
      assetName: t.assetName ?? '',
      portfolioName: t.portfolio?.name ?? '',
      amount: t.netAmount.toString(),
      narration: t.narration ?? null,
    })),
    dividend: dividend.toString(),
    interest: interest.toString(),
    maturity: maturity.toString(),
    total: dividend.plus(interest).plus(maturity).toString(),
    count: filtered.length,
  };
}

// ─── Tax summary — consolidated FY view with estimated tax ──────────

export interface TaxSummary {
  financialYear: string;
  rates: {
    stcgEquityPct: number;
    ltcgEquityPct: number;
    ltcgEquityExemption: string;
    ltcgOtherIndexedPct: number;
    ltcgOtherNonIndexedPct: number;
    slabPct: number;
  };
  capitalGains: {
    section111A_stcgEquity: { gain: string; tax: string };
    section112A_ltcgEquity: { gain: string; exemption: string; taxable: string; tax: string };
    section112_ltcgOther: { gain: string; taxable: string; tax: string };
    stcgOther: { gain: string; tax: string };
    intradaySpeculative: { gain: string; tax: string };
  };
  fnoBusinessIncome: { netPnl: string; turnover: string; tax: string; auditApplicable: boolean };
  otherIncome: { dividend: string; interest: string; maturity: string };
  totalRealisedGain: string;
  totalEstimatedTax: string;
  availableFys: string[];
}

export async function buildTaxSummary(userId: string, fy: string): Promise<TaxSummary> {
  const { rows } = await computeUserCapitalGains(userId);
  const inFy = rows.filter((r) => r.financialYear === fy);
  const rates = ratesForFy(fy);

  // §111A — STCG on listed equity (STT paid)
  const s111ARows = inFy.filter(
    (r) => r.capitalGainType === 'SHORT_TERM' && isListedEquityClass(r.assetClass),
  );
  const s111AGain = s111ARows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const s111ATax = pct(Decimal.max(s111AGain, new Decimal(0)), rates.stcgEquityPct);

  // §112A — LTCG on listed equity
  const s112ARows = inFy.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && isListedEquityClass(r.assetClass),
  );
  const s112AGain = s112ARows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const s112ATaxable = Decimal.max(s112AGain.minus(rates.ltcgEquityExemption), new Decimal(0));
  const s112ATax = pct(s112ATaxable, rates.ltcgEquityPct);

  // §112 — LTCG on other assets (indexed vs non-indexed mix)
  const s112Rows = inFy.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && !isListedEquityClass(r.assetClass),
  );
  const s112Gain = s112Rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const s112Taxable = s112Rows.reduce((a, r) => a.plus(r.taxableGain), new Decimal(0));
  let s112Tax = new Decimal(0);
  for (const r of s112Rows) {
    const pctRate = r.indexedCostOfAcquisition ? rates.ltcgOtherIndexedPct : rates.ltcgOtherNonIndexedPct;
    s112Tax = s112Tax.plus(pct(Decimal.max(r.taxableGain, new Decimal(0)), pctRate));
  }

  // STCG on non-equity (slab rate)
  const stcgOtherRows = inFy.filter(
    (r) => r.capitalGainType === 'SHORT_TERM' && !isListedEquityClass(r.assetClass),
  );
  const stcgOtherGain = stcgOtherRows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const stcgOtherTax = pct(Decimal.max(stcgOtherGain, new Decimal(0)), rates.slabPct);

  // Intraday speculative business income (slab rate)
  const intradayRows = inFy.filter((r) => r.capitalGainType === 'INTRADAY');
  const intradayGain = intradayRows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const intradayTax = pct(Decimal.max(intradayGain, new Decimal(0)), rates.slabPct);

  // F&O — non-speculative business income (slab rate)
  let fnoNet = new Decimal(0);
  let fnoTurnover = new Decimal(0);
  let fnoAudit = false;
  try {
    const s43 = await buildSchedule43Report(userId, fy);
    fnoNet = new Decimal(s43.nonSpeculative.netPnl);
    fnoTurnover = new Decimal(s43.nonSpeculative.turnover);
    fnoAudit = s43.taxAuditApplicable;
  } catch (err) {
    logger.warn({ userId, fy, err }, 'tax.summary: F&O schedule-43 failed; treating as zero');
  }
  const fnoTax = pct(Decimal.max(fnoNet, new Decimal(0)), rates.slabPct);

  // Other income (informational; taxed at slab outside this estimate)
  const income = await userIncomeReport(userId, fy);

  const totalRealisedGain = s111AGain
    .plus(s112AGain)
    .plus(s112Gain)
    .plus(stcgOtherGain)
    .plus(intradayGain)
    .plus(fnoNet);

  const totalEstimatedTax = s111ATax
    .plus(s112ATax)
    .plus(s112Tax)
    .plus(stcgOtherTax)
    .plus(intradayTax)
    .plus(fnoTax);

  return {
    financialYear: fy,
    rates: {
      stcgEquityPct: rates.stcgEquityPct,
      ltcgEquityPct: rates.ltcgEquityPct,
      ltcgEquityExemption: rates.ltcgEquityExemption.toString(),
      ltcgOtherIndexedPct: rates.ltcgOtherIndexedPct,
      ltcgOtherNonIndexedPct: rates.ltcgOtherNonIndexedPct,
      slabPct: rates.slabPct,
    },
    capitalGains: {
      section111A_stcgEquity: { gain: s111AGain.toString(), tax: s111ATax.toString() },
      section112A_ltcgEquity: {
        gain: s112AGain.toString(),
        exemption: rates.ltcgEquityExemption.toString(),
        taxable: s112ATaxable.toString(),
        tax: s112ATax.toString(),
      },
      section112_ltcgOther: {
        gain: s112Gain.toString(),
        taxable: s112Taxable.toString(),
        tax: s112Tax.toString(),
      },
      stcgOther: { gain: stcgOtherGain.toString(), tax: stcgOtherTax.toString() },
      intradaySpeculative: { gain: intradayGain.toString(), tax: intradayTax.toString() },
    },
    fnoBusinessIncome: {
      netPnl: fnoNet.toString(),
      turnover: fnoTurnover.toString(),
      tax: fnoTax.toString(),
      auditApplicable: fnoAudit,
    },
    otherIncome: {
      dividend: income.dividend,
      interest: income.interest,
      maturity: income.maturity,
    },
    totalRealisedGain: totalRealisedGain.toString(),
    totalEstimatedTax: totalEstimatedTax.toString(),
    availableFys: fyOptionsFromRows(rows),
  };
}

// ─── Schedule 112A scrip-wise CSV (ITR-portal format) ───────────────

/**
 * Generates ITR-portal-compatible scrip-wise CSV for Schedule 112A.
 * Column order matches the income-tax e-filing portal's bulk upload
 * template (FY 2023-24 onwards):
 *   Share/Unit acquired, ISIN, Name, No. of shares, Sale Price per share,
 *   Full value of consideration, Cost of acquisition without indexation,
 *   Cost per share (col 6/4), If acquired before 1-Feb-2018 (Y/N),
 *   FMV per share as on 31-Jan-2018, Sale price (col 5),
 *   Higher of col 8 & 9 (per share), Lower of col 11 & 10,
 *   Acquisition cost u/s 55(2)(ac) (col 12 × col 4),
 *   Expenditure wholly & exclusively in connection with transfer,
 *   Total deductions, Balance (col 6 – col 14).
 *
 * FMV for grandfathering (col 9) is left blank — the user fills it in
 * before submitting, since we don't yet have BSE/NSE 31-Jan-2018 close
 * prices loaded (see capitalGains.service §grandfathering TODO).
 */
export async function schedule112ACsv(userId: string, fy: string): Promise<string> {
  const all = await userCgRows(userId, fy);
  const rows = all.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && isListedEquityClass(r.assetClass),
  );
  const grandfatherCutoff = new Date('2018-02-01T00:00:00Z');

  const headers = [
    'ISIN',
    'Name of Share/Unit',
    'No. of Shares/Units',
    'Sale Price per Share/Unit',
    'Full Value of Consideration',
    'Cost of Acquisition Without Indexation',
    'Cost per Share/Unit',
    'Acquired Before 01/02/2018',
    'FMV per Share/Unit as on 31/01/2018',
    'Sale Price (Col 5)',
    'Higher of Col 8 and Col 9',
    'Lower of Col 11 and Col 10',
    'Acquisition Cost u/s 55(2)(ac)',
    'Expenditure on Transfer',
    'Total Deductions',
    'Balance (Col 6 - Col 14)',
  ];

  const lines: string[] = [headers.map(csvCell).join(',')];

  for (const r of rows) {
    const qty = r.quantity;
    const salePricePerUnit = r.sellPrice;
    const fullConsideration = r.sellAmount;
    const costNoIndex = r.buyAmount;
    const costPerUnit = qty.isZero() ? new Decimal(0) : costNoIndex.dividedBy(qty);
    const acquiredBeforeCutoff = r.buyDate < grandfatherCutoff ? 'Y' : 'N';
    // FMV blank by default — user supplies
    const fmvPerUnit = '';
    // Col 11 = higher of cost-per-share and FMV (FMV blank → use cost)
    const col11 = costPerUnit;
    // Col 12 = lower of col 11 and sale price
    const col12 = Decimal.min(col11, salePricePerUnit);
    // Col 13 = col 12 × qty
    const col13 = col12.times(qty);
    // Expenditure on transfer (col 14) — not tracked at row level; default 0
    const col14 = new Decimal(0);
    const totalDeductions = col13.plus(col14);
    const balance = fullConsideration.minus(totalDeductions);

    lines.push(
      [
        r.isin ?? '',
        r.assetName,
        qty.toFixed(4),
        salePricePerUnit.toFixed(4),
        fullConsideration.toFixed(2),
        costNoIndex.toFixed(2),
        costPerUnit.toFixed(4),
        acquiredBeforeCutoff,
        fmvPerUnit,
        salePricePerUnit.toFixed(4),
        col11.toFixed(4),
        col12.toFixed(4),
        col13.toFixed(2),
        col14.toFixed(2),
        totalDeductions.toFixed(2),
        balance.toFixed(2),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function csvCell(v: string): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── Tax-loss harvesting view ───────────────────────────────────────

export interface TaxHarvestRow {
  portfolioId: string;
  assetClass: AssetClass;
  assetName: string;
  isin: string | null;
  quantity: string;
  avgCostPrice: string;
  currentPrice: string | null;
  totalCost: string;
  currentValue: string;
  unrealisedPnL: string;
  pctReturn: string;
  longTermEligible: boolean; // current holding period ≥ LTCG threshold
  classification: 'STCG_LOSS' | 'LTCG_LOSS' | 'STCG_GAIN' | 'LTCG_GAIN';
}

/**
 * Tax-loss harvesting candidates — unrealised losses available to offset
 * realised gains in the current FY. Includes all holdings (not just losses)
 * so the user can also see unrealised gains close to LTCG threshold.
 */
export async function taxHarvestReport(userId: string, fy?: string) {
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    include: { portfolio: { select: { name: true } } },
  });

  // Use oldest BUY tradeDate per (portfolioId, assetKey) as the holding-period
  // anchor for "long-term eligible" classification.
  const oldestByAsset = new Map<string, Date>();
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      transactionType: { in: ['BUY', 'SIP', 'OPENING_BALANCE', 'BONUS', 'MERGER_IN', 'DEMERGER_IN', 'RIGHTS_ISSUE', 'DIVIDEND_REINVEST', 'SWITCH_IN'] },
    },
    select: { portfolioId: true, assetKey: true, tradeDate: true },
    orderBy: { tradeDate: 'asc' },
  });
  for (const t of txs) {
    const k = `${t.portfolioId}|${t.assetKey}`;
    if (!oldestByAsset.has(k)) oldestByAsset.set(k, t.tradeDate);
  }

  const now = new Date();
  function isLongTermEligible(ac: AssetClass, oldestBuy: Date): boolean {
    const months = (ac === 'EQUITY' || ac === 'ETF' || ac === 'MUTUAL_FUND') ? 12
      : (ac === 'FOREIGN_EQUITY') ? 24 : 36;
    const days = (now.getTime() - oldestBuy.getTime()) / (24 * 60 * 60 * 1000);
    return days >= months * 30;
  }

  const out: Array<TaxHarvestRow & { portfolioName: string }> = [];
  let totalUnrealisedLoss = new Decimal(0);
  let stcgLossAvailable = new Decimal(0);
  let ltcgLossAvailable = new Decimal(0);

  for (const h of holdings) {
    const cost = new Decimal(h.totalCost.toString());
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : cost;
    const pnl = value.minus(cost);
    const pctReturn = cost.isZero() ? '0' : pnl.dividedBy(cost).times(100).toFixed(2);
    const oldest = oldestByAsset.get(`${h.portfolioId}|${h.assetKey}`) ?? now;
    const ltEligible = isLongTermEligible(h.assetClass, oldest);
    let classification: TaxHarvestRow['classification'];
    if (pnl.isNegative()) classification = ltEligible ? 'LTCG_LOSS' : 'STCG_LOSS';
    else classification = ltEligible ? 'LTCG_GAIN' : 'STCG_GAIN';

    if (pnl.isNegative()) {
      totalUnrealisedLoss = totalUnrealisedLoss.plus(pnl.abs());
      if (ltEligible) ltcgLossAvailable = ltcgLossAvailable.plus(pnl.abs());
      else stcgLossAvailable = stcgLossAvailable.plus(pnl.abs());
    }

    out.push({
      portfolioId: h.portfolioId,
      portfolioName: h.portfolio?.name ?? '',
      assetClass: h.assetClass,
      assetName: h.assetName ?? '',
      isin: h.isin,
      quantity: h.quantity.toString(),
      avgCostPrice: h.avgCostPrice.toString(),
      currentPrice: h.currentPrice?.toString() ?? null,
      totalCost: cost.toString(),
      currentValue: value.toString(),
      unrealisedPnL: pnl.toString(),
      pctReturn,
      longTermEligible: ltEligible,
      classification,
    });
  }

  // Realised gains in FY available to offset against
  let realisedStcg = new Decimal(0);
  let realisedLtcg = new Decimal(0);
  if (fy) {
    const cgRows = await userCgRows(userId, fy);
    for (const r of cgRows) {
      if (r.capitalGainType === 'SHORT_TERM') realisedStcg = realisedStcg.plus(r.gainLoss);
      else if (r.capitalGainType === 'LONG_TERM') realisedLtcg = realisedLtcg.plus(r.gainLoss);
    }
  }

  // Sort: biggest unrealised losses first
  out.sort((a, b) => {
    const ap = new Decimal(a.unrealisedPnL);
    const bp = new Decimal(b.unrealisedPnL);
    return ap.minus(bp).toNumber();
  });

  return {
    rows: out,
    totals: {
      unrealisedLoss: totalUnrealisedLoss.toString(),
      stcgLossAvailable: stcgLossAvailable.toString(),
      ltcgLossAvailable: ltcgLossAvailable.toString(),
      realisedStcgInFy: realisedStcg.toString(),
      realisedLtcgInFy: realisedLtcg.toString(),
    },
    count: out.length,
  };
}

// ─── Internal: serialize CG row for JSON ────────────────────────────

function rowToJson(r: CapitalGainRow) {
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
  };
}
