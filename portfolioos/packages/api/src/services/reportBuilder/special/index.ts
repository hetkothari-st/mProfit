/**
 * Tax / MIS report layout builders.
 *
 * Each function returns a `MprofitLayout` that the new streamMprofitPdf
 * / streamMprofitExcel can serialise into a pixel-close match of the
 * legacy desktop screenshots the user shared. Pink/blue/yellow/green
 * banded rows, two-level column headers, Indian lakh/crore numbers,
 * negatives in parens.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import {
  fmtDateDDMMYYYY,
  indianInt,
  indianMoney,
  todayDDMMYYYY,
  type ColumnDef,
  type MprofitLayout,
  type SubGroup,
  type ReportSection,
} from '../mprofitStyle.js';
import {
  grandfatheringReport,
  dematHoldingReport,
  m2mReport,
  fetchFmvOn31Jan2018,
  adjustGainForGrandfathering,
  residualLots,
  BUY_TXN_TYPES,
  SELL_TXN_TYPES,
} from '../../specialReports.service.js';
import {
  intradayReport,
  stcgReport,
  ltcgReport,
  schedule112AReport,
  userIntradayReport,
  userStcgReport,
  userLtcgReport,
  userSchedule112AReport,
  userIncomeReport,
  incomeReport,
} from '../../reports.service.js';
import { computeUserCapitalGains, type CapitalGainRow } from '../../capitalGains.service.js';
import {
  getTrialBalance,
  getAccountLedger,
  getPnL,
  getBalanceSheet,
  listAccountsFlat,
} from '../../accounting.service.js';
import { computeUserXirr } from '../../xirr.service.js';

async function userMember(userId: string): Promise<{ family: string; member: string; pan: string | undefined }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, pan: true },
  });
  const member = u?.name ?? u?.email ?? 'Member';
  return {
    family: member, // family roll-up not yet implemented (Phase C in memory)
    member,
    pan: u?.pan ?? undefined,
  };
}

const MONEY = (v: unknown) => indianMoney(v);
const INT = (v: unknown) => indianInt(v);
const DATE = (v: unknown) => fmtDateDDMMYYYY(v);

// ─── Helper: group CapitalGainRow[] by assetName ─────────────────

function groupCG(rows: CapitalGainRow[]): Array<{ name: string; rows: CapitalGainRow[] }> {
  const m = new Map<string, CapitalGainRow[]>();
  for (const r of rows) {
    const arr = m.get(r.assetName) ?? [];
    arr.push(r);
    m.set(r.assetName, arr);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, rs]) => ({ name, rows: rs }));
}

// ─── 1. Grandfathering LTCG ───────────────────────────────────────

export async function buildGrandfatheringLayout(userId: string, fy?: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const r = await grandfatheringReport(userId, fy);

  // Group rows by script
  const byScript = new Map<string, typeof r.rows>();
  for (const row of r.rows) {
    const arr = byScript.get(row.scriptName) ?? [];
    arr.push(row);
    byScript.set(row.scriptName, arr);
  }

  const groups: SubGroup[] = Array.from(byScript.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([scriptName, rows]) => {
      const tot = rows.reduce(
        (acc, x) => ({
          buyQty: acc.buyQty.plus(x.buyQty),
          buyAmt: acc.buyAmt.plus(x.buyAmount),
          sellQty: acc.sellQty.plus(x.sellQty),
          sellAmt: acc.sellAmt.plus(x.sellAmount),
          gain: acc.gain.plus(x.gain),
          loss: acc.loss.plus(x.loss),
        }),
        { buyQty: new Decimal(0), buyAmt: new Decimal(0), sellQty: new Decimal(0), sellAmt: new Decimal(0), gain: new Decimal(0), loss: new Decimal(0) },
      );
      return {
        header: scriptName,
        rows: rows.map((row) => ({
          cells: {
            scriptName: 'SHARE INVESTMENT (EQUITY) A/C',
            buyDate: row.buyDate,
            buyQty: row.buyQty,
            buyRate: row.buyRate,
            buyAmount: row.buyAmount,
            fmv: row.fmvOn31Jan2018 ?? '',
            sellDate: row.sellDate,
            sellQty: row.sellQty,
            sellRate: row.sellRate,
            sellAmount: row.sellAmount,
            gainLoss: row.gainLoss,
            gain: row.gain,
            loss: row.loss,
          },
        })),
        subtotal: {
          label: `Total For ${scriptName}`,
          values: {
            buyQty: tot.buyQty.toString(),
            buyAmount: tot.buyAmt.toString(),
            sellQty: tot.sellQty.toString(),
            sellAmount: tot.sellAmt.toString(),
            gainLoss: tot.gain.minus(tot.loss).toString(),
            gain: tot.gain.toString(),
            loss: tot.loss.toString(),
          },
        },
      };
    });

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 14, align: 'left' },
    { key: 'buyDate', label: 'Date', width: 6, align: 'center', formatter: DATE },
    { key: 'buyQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'buyRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'buyAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'fmv', label: 'FMV', width: 7, align: 'right', formatter: (v) => (v ? MONEY(v) : '') },
    { key: 'sellDate', label: 'Date', width: 6, align: 'center', formatter: DATE },
    { key: 'sellQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'sellAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'gainLoss', label: 'Gain/Loss', width: 8, align: 'right', formatter: MONEY, signed: true },
    { key: 'gain', label: 'Gain', width: 7, align: 'right', formatter: (v) => (new Decimal(String(v ?? 0)).gt(0) ? MONEY(v) : '') },
    { key: 'loss', label: 'Loss', width: 7, align: 'right', formatter: (v) => (new Decimal(String(v ?? 0)).gt(0) ? MONEY(v) : '') },
  ];

  return {
    reportTitle: `Grandfathering Report ${r.scope.financialYear ? `(FY ${r.scope.financialYear})` : ''}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: r.scope.financialYear ?? 'All',
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Opening / Purchase', spanCols: 4 },
      { label: '31st Jan 2018', spanCols: 1 },
      { label: 'Sale', spanCols: 4 },
      { label: 'LTCG', spanCols: 3 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups }],
    grandTotal: {
      label: 'Grand Total',
      values: {
        buyQty: r.totals.buyQty,
        buyAmount: r.totals.buyAmount,
        sellQty: r.totals.sellQty,
        sellAmount: r.totals.sellAmount,
        gainLoss: r.totals.net,
        gain: r.totals.gain,
        loss: r.totals.loss,
      },
    },
    filenameStem: `grandfathering-ltcg${fy ? `-${fy}` : ''}`,
  };
}

// ─── 2. Demat-wise holdings ───────────────────────────────────────

export async function buildDematHoldingsLayout(userId: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const r = await dematHoldingReport(userId);

  // Group movements by broker → script. We render the screenshot's
  // "Dated movements" variant since it's the visually richer one.
  const byBroker = new Map<string, Map<string, typeof r.movements>>();
  for (const mv of r.movements) {
    let inner = byBroker.get(mv.brokerName);
    if (!inner) {
      inner = new Map();
      byBroker.set(mv.brokerName, inner);
    }
    const arr = inner.get(mv.scriptName) ?? [];
    arr.push(mv);
    inner.set(mv.scriptName, arr);
  }

  const sections: ReportSection[] = Array.from(byBroker.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([brokerName, scriptMap]) => ({
      banner: brokerName,
      groups: Array.from(scriptMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([scriptName, movements]) => {
          const sumIn = movements.reduce((s, x) => s.plus(x.inQty), new Decimal(0));
          const sumOut = movements.reduce((s, x) => s.plus(x.outQty), new Decimal(0));
          const balance = sumIn.minus(sumOut);
          return {
            header: scriptName,
            rows: movements.map((mv) => ({
              cells: {
                date: mv.kind === 'OPENING' ? '' : mv.date,
                reason: mv.reason,
                inQty: mv.inQty === '0' ? '0' : mv.inQty,
                outQty: mv.outQty === '0' ? '0' : mv.outQty,
                balanceQty: mv.balanceQty,
              },
              bg: mv.kind === 'OPENING' ? '#FFE3E6' : undefined,
            })),
            subtotal: {
              label: 'Script Total',
              values: {
                inQty: sumIn.toString(),
                outQty: sumOut.toString(),
                balanceQty: balance.toString(),
              },
            },
          };
        }),
    }));

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date', width: 12, align: 'center', formatter: DATE },
    { key: 'reason', label: 'Demat Account / Script Name', width: 38, align: 'left' },
    { key: 'inQty', label: 'In Qty.', width: 16, align: 'right', formatter: INT },
    { key: 'outQty', label: 'Out Qty.', width: 16, align: 'right', formatter: INT },
    { key: 'balanceQty', label: 'Balance Qty.', width: 18, align: 'right', formatter: INT, signed: true },
  ];

  return {
    reportTitle: `Physical/Demat Accountwise Stock Report As On ${todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: { balanceQty: r.grandTotal },
    },
    filenameStem: 'demat-accountwise-holdings',
  };
}

// ─── 3. M2M Equity + F&O ──────────────────────────────────────────

export async function buildM2MLayout(userId: string, asOf?: Date): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const r = await m2mReport(userId, asOf);

  function rowCells(row: typeof r.equityRows[number]) {
    return {
      scriptName: row.scriptName,
      closingDate: row.closingDate,
      qty: row.qty,
      purRate: row.purRate,
      purValue: row.purValue,
      bhavRate: row.bhavRate ?? '',
      valuation: row.valuation ?? '',
      unrealisedPnL: row.unrealisedPnL ?? '',
      noOfDays: row.noOfDays,
      actualRoi: row.actualRoiPct,
      monthlyRoi: row.monthlyRoiPct,
      annualRoi: row.annualRoiPct,
      cagr: row.cagrPct,
    };
  }

  // Group by script per segment, with per-script subtotal
  function buildSection(label: string, rows: typeof r.equityRows): ReportSection {
    const byScript = new Map<string, typeof rows>();
    for (const row of rows) {
      const arr = byScript.get(row.scriptName) ?? [];
      arr.push(row);
      byScript.set(row.scriptName, arr);
    }
    const groups: SubGroup[] = Array.from(byScript.entries()).map(([name, rs]) => {
      const tQty = rs.reduce((s, x) => s.plus(x.qty), new Decimal(0));
      const tPur = rs.reduce((s, x) => s.plus(x.purValue), new Decimal(0));
      const tVal = rs.reduce((s, x) => s.plus(x.valuation ?? '0'), new Decimal(0));
      const tPnl = rs.reduce((s, x) => s.plus(x.unrealisedPnL ?? '0'), new Decimal(0));
      return {
        rows: rs.map((row) => ({ cells: rowCells(row) })),
        subtotal: {
          label: `Total : ${name}`,
          values: {
            qty: tQty.toString(),
            purValue: tPur.toString(),
            valuation: tVal.toString(),
            unrealisedPnL: tPnl.toString(),
          },
        },
      };
    });
    return { banner: label, groups };
  }

  const sections: ReportSection[] = [];
  if (r.equityRows.length) sections.push(buildSection('Equity', r.equityRows));
  if (r.fnoRows.length) sections.push(buildSection('F & O', r.fnoRows));

  const pct = (v: unknown) =>
    v == null || v === '' || !Number.isFinite(Number(v))
      ? ''
      : indianMoney(v, 2);

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 16, align: 'left' },
    { key: 'closingDate', label: 'Closing Date', width: 7, align: 'center', formatter: DATE },
    { key: 'qty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'purRate', label: 'Pur Rate', width: 7, align: 'right', formatter: MONEY },
    { key: 'purValue', label: 'Pur Value', width: 8, align: 'right', formatter: MONEY },
    { key: 'bhavRate', label: 'Bhav Rate', width: 7, align: 'right', formatter: MONEY },
    { key: 'valuation', label: 'Valuation', width: 8, align: 'right', formatter: MONEY },
    { key: 'unrealisedPnL', label: 'Unreal. G/L', width: 8, align: 'right', formatter: MONEY, signed: true },
    { key: 'noOfDays', label: 'Days', width: 4, align: 'right' },
    { key: 'actualRoi', label: 'Actual %', width: 6, align: 'right', formatter: pct, signed: true },
    { key: 'monthlyRoi', label: 'Monthly %', width: 6, align: 'right', formatter: pct, signed: true },
    { key: 'annualRoi', label: 'Annual %', width: 6, align: 'right', formatter: pct, signed: true },
    { key: 'cagr', label: 'CAGR %', width: 6, align: 'right', formatter: pct, signed: true },
  ];

  return {
    reportTitle: `M2M (ALL) report as on ${fmtDateDDMMYYYY(r.asOfDate)}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Closing Date', spanCols: 1 },
      { label: 'Average', spanCols: 3 },
      { label: 'Bhav Rate', spanCols: 1 },
      { label: 'Valuation', spanCols: 1 },
      { label: 'Unreal. G/L', spanCols: 1 },
      { label: 'UN-Realised ROI', spanCols: 5 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: {
        purValue: r.grandTotal.purValue,
        valuation: r.grandTotal.valuation,
        unrealisedPnL: r.grandTotal.unrealisedPnL,
      },
    },
    filenameStem: `m2m-${r.asOfDate}`,
  };
}

// ─── Helper for capital-gain-style reports (STCG / LTCG / Spec) ───

function cgColumns(): ColumnDef[] {
  return [
    { key: 'scriptName', label: 'Script Name', width: 14, align: 'left' },
    { key: 'buyDate', label: 'Date', width: 6, align: 'center', formatter: DATE },
    { key: 'buyQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'buyRate', label: 'Rate', width: 7, align: 'right', formatter: MONEY },
    { key: 'buyAmount', label: 'Amount', width: 9, align: 'right', formatter: MONEY },
    { key: 'sellDate', label: 'Date', width: 6, align: 'center', formatter: DATE },
    { key: 'sellQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Rate', width: 7, align: 'right', formatter: MONEY },
    { key: 'sellAmount', label: 'Amount', width: 9, align: 'right', formatter: MONEY },
    { key: 'gainLoss', label: 'Gain/Loss', width: 9, align: 'right', formatter: MONEY, signed: true },
    { key: 'gain', label: 'Gain', width: 8, align: 'right', formatter: (v) => (new Decimal(String(v ?? 0)).gt(0) ? MONEY(v) : '') },
    { key: 'loss', label: 'Loss', width: 8, align: 'right', formatter: (v) => (new Decimal(String(v ?? 0)).gt(0) ? MONEY(v) : '') },
  ];
}

function cgHeaderRow1() {
  return [
    { label: 'Script Name', spanCols: 1 },
    { label: 'Opening / Purchase', spanCols: 4 },
    { label: 'Sale', spanCols: 4 },
    { label: 'Gain / Loss', spanCols: 3 },
  ];
}

function buildCgSection(rows: CapitalGainRow[]): ReportSection {
  const groups: SubGroup[] = groupCG(rows).map((g) => {
    const tot = g.rows.reduce(
      (acc, r) => ({
        buyQty: acc.buyQty.plus(r.quantity),
        buyAmt: acc.buyAmt.plus(r.buyAmount),
        sellQty: acc.sellQty.plus(r.quantity),
        sellAmt: acc.sellAmt.plus(r.sellAmount),
        gain: acc.gain.plus(r.gainLoss.isPositive() ? r.gainLoss : 0),
        loss: acc.loss.plus(r.gainLoss.isNegative() ? r.gainLoss.negated() : 0),
      }),
      { buyQty: new Decimal(0), buyAmt: new Decimal(0), sellQty: new Decimal(0), sellAmt: new Decimal(0), gain: new Decimal(0), loss: new Decimal(0) },
    );
    return {
      header: g.name,
      rows: g.rows.map((r) => ({
        cells: {
          scriptName: 'SHARE INVESTMENT (EQUITY) A/C',
          buyDate: r.buyDate,
          buyQty: r.quantity.toString(),
          buyRate: r.buyPrice.toString(),
          buyAmount: r.buyAmount.toString(),
          sellDate: r.sellDate,
          sellQty: r.quantity.toString(),
          sellRate: r.sellPrice.toString(),
          sellAmount: r.sellAmount.toString(),
          gainLoss: r.gainLoss.toString(),
          gain: r.gainLoss.isPositive() ? r.gainLoss.toString() : '0',
          loss: r.gainLoss.isNegative() ? r.gainLoss.negated().toString() : '0',
        },
      })),
      subtotal: {
        label: `Total For ${g.name}`,
        values: {
          buyQty: tot.buyQty.toString(),
          buyAmount: tot.buyAmt.toString(),
          sellQty: tot.sellQty.toString(),
          sellAmount: tot.sellAmt.toString(),
          gainLoss: tot.gain.minus(tot.loss).toString(),
          gain: tot.gain.toString(),
          loss: tot.loss.toString(),
        },
      },
    };
  });
  return { banner: 'SHARE INVESTMENT (EQUITY) A/C', groups };
}

// ─── 4. Short Term / Long Term / Speculation (unified) ────────────

export async function buildShortLongSpecLayout(
  userId: string,
  fy?: string,
  portfolioId?: string,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const intraday = portfolioId ? await intradayReport(portfolioId, fy) : await userIntradayReport(userId, fy);
  const st = portfolioId ? await stcgReport(portfolioId, fy) : await userStcgReport(userId, fy);
  const lt = portfolioId ? await ltcgReport(portfolioId, fy) : await userLtcgReport(userId, fy);

  const sections: ReportSection[] = [];
  if (intraday.rows.length) {
    const sec = buildCgSection(intraday.rows);
    sec.banner = 'Speculation (Intraday)';
    sections.push(sec);
  }
  if (st.rows.length) {
    const sec = buildCgSection(st.rows);
    sec.banner = 'Short Term';
    sections.push(sec);
  }
  if (lt.rows.length) {
    const sec = buildCgSection(lt.rows);
    sec.banner = 'Long Term';
    sections.push(sec);
  }

  const tIntra = new Decimal(intraday.totalGain);
  const tST = new Decimal(st.totalGain);
  const tLT = new Decimal(lt.totalGain);

  return {
    reportTitle: `Capital Gain — Short / Long / Speculation ${fy ? `(FY ${fy})` : ''}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: fy ?? 'All',
    headerRow1: cgHeaderRow1(),
    headerRow2: cgColumns().map((c) => ({ label: c.label, align: c.align })),
    columns: cgColumns(),
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: { gainLoss: tIntra.plus(tST).plus(tLT).toString() },
    },
    filenameStem: `short-long-speculation${fy ? `-${fy}` : ''}`,
  };
}

// ─── 5. Trial Balance ─────────────────────────────────────────────

export async function buildTrialBalanceLayout(userId: string, asOf?: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const rows = await getTrialBalance(userId, asOf);
  const tDr = rows.reduce((s, r) => s.plus(r.totalDebit), new Decimal(0));
  const tCr = rows.reduce((s, r) => s.plus(r.totalCredit), new Decimal(0));

  const columns: ColumnDef[] = [
    { key: 'name', label: 'Particulars', width: 38, align: 'left' },
    { key: 'totalDebit', label: 'Debit', width: 14, align: 'right', formatter: MONEY },
    { key: 'totalCredit', label: 'Credit', width: 14, align: 'right', formatter: MONEY },
  ];

  return {
    reportTitle: `Trial Balance As On ${asOf ? fmtDateDDMMYYYY(asOf) : todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [
      {
        groups: [
          {
            rows: rows
              .filter((r) => Number(r.totalDebit) !== 0 || Number(r.totalCredit) !== 0)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((r) => ({
                cells: {
                  name: r.name.toUpperCase(),
                  totalDebit: Number(r.totalDebit) > 0 ? r.totalDebit : '',
                  totalCredit: Number(r.totalCredit) > 0 ? r.totalCredit : '',
                },
              })),
          },
        ],
      },
    ],
    grandTotal: {
      label: 'Grand Total',
      values: { totalDebit: tDr.toString(), totalCredit: tCr.toString() },
    },
    filenameStem: `trial-balance${asOf ? `-${asOf}` : ''}`,
  };
}

// ─── 6. Account Ledger ────────────────────────────────────────────

export async function buildAccountLedgerLayout(
  userId: string,
  opts: { accountId?: string; from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const accounts = await listAccountsFlat(userId);
  const groups: SubGroup[] = [];
  for (const a of accounts) {
    const led = await getAccountLedger(userId, a.id, opts);
    if (led.entries.length === 0) continue;
    groups.push({
      header: `${a.code} — ${a.name}`,
      rows: led.entries.map((e) => ({
        cells: {
          date: e.date,
          voucher: `${e.voucherType} ${e.voucherNo}`,
          narration: e.narration ?? '',
          debit: e.debit ?? '',
          credit: e.credit ?? '',
          balance: e.balance,
        },
      })),
      subtotal: {
        label: 'Closing balance',
        values: { balance: led.closingBalance },
      },
    });
  }

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date', width: 8, align: 'center', formatter: DATE },
    { key: 'voucher', label: 'Voucher', width: 12, align: 'left' },
    { key: 'narration', label: 'Narration', width: 34, align: 'left' },
    { key: 'debit', label: 'Debit', width: 10, align: 'right', formatter: MONEY },
    { key: 'credit', label: 'Credit', width: 10, align: 'right', formatter: MONEY },
    { key: 'balance', label: 'Balance', width: 12, align: 'right', formatter: MONEY, signed: true },
  ];

  return {
    reportTitle: `Account Ledger From ${opts.from ? fmtDateDDMMYYYY(opts.from) : '—'} To ${opts.to ? fmtDateDDMMYYYY(opts.to) : todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups }],
    filenameStem: 'account-ledger-all',
  };
}

// ─── 7. Profit & Loss ─────────────────────────────────────────────

export async function buildProfitLossLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const pl = await getPnL(userId, opts.from, opts.to);

  // Indian-style P&L T-account: net profit/loss appears as a transfer
  // entry on the side opposite where it was earned, so both columns
  // tally to the same grand total. Profit sits on the debit side as
  // "To Net Profit transferred to Capital A/c"; a loss sits on the
  // credit side instead.
  const netPl = new Decimal(pl.netProfit);
  const isProfit = netPl.greaterThanOrEqualTo(0);
  const debitList = pl.expense.map((x) => ({
    name: `TO ${x.name.toUpperCase()}`,
    amount: x.closingBalance,
  }));
  const creditList = pl.income.map((x) => ({
    name: `BY ${x.name.toUpperCase()}`,
    amount: x.closingBalance,
  }));
  if (isProfit) {
    debitList.push({
      name: 'TO NET PROFIT TRANSFERRED TO CAPITAL A/C',
      amount: netPl.toString(),
    });
  } else {
    creditList.push({
      name: 'BY NET LOSS TRANSFERRED TO CAPITAL A/C',
      amount: netPl.abs().toString(),
    });
  }

  const maxLen = Math.max(debitList.length, creditList.length);
  const rows: Array<{ cells: Record<string, unknown> }> = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      cells: {
        debitParticulars: debitList[i]?.name ?? '',
        debit: debitList[i]?.amount ?? '',
        creditParticulars: creditList[i]?.name ?? '',
        credit: creditList[i]?.amount ?? '',
      },
    });
  }

  const columns: ColumnDef[] = [
    { key: 'debitParticulars', label: 'Particulars', width: 32, align: 'left' },
    { key: 'debit', label: 'Debit', width: 12, align: 'right', formatter: MONEY },
    { key: 'creditParticulars', label: 'Particulars', width: 32, align: 'left' },
    { key: 'credit', label: 'Credit', width: 12, align: 'right', formatter: MONEY },
  ];

  const sideTotal = (isProfit
    ? new Decimal(pl.totalExpense).plus(netPl)
    : new Decimal(pl.totalIncome).plus(netPl.abs())
  ).toString();
  const debitTotal = isProfit ? sideTotal : pl.totalExpense;
  const creditTotal = isProfit ? pl.totalIncome : sideTotal;

  return {
    reportTitle: `Profit & Loss Report As On ${opts.to ? fmtDateDDMMYYYY(opts.to) : todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'Grand Total',
      values: { debit: debitTotal, credit: creditTotal },
    },
    filenameStem: `profit-loss${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 8. Balance Sheet ─────────────────────────────────────────────

export async function buildBalanceSheetLayout(userId: string, asOf?: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const bs = await getBalanceSheet(userId, asOf);
  const liabilities = [
    ...bs.liabilities.map((x) => ({ name: x.name, amount: x.closingBalance })),
    ...bs.equity.map((x) => ({ name: x.name, amount: x.closingBalance })),
    { name: 'Retained Earnings (P&L)', amount: bs.retainedEarnings },
  ];
  const assets = bs.assets.map((x) => ({ name: x.name, amount: x.closingBalance }));
  const maxLen = Math.max(liabilities.length, assets.length);
  const rows: Array<{ cells: Record<string, unknown> }> = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      cells: {
        liability: liabilities[i]?.name.toUpperCase() ?? '',
        lAmount: liabilities[i]?.amount ?? '',
        asset: assets[i]?.name.toUpperCase() ?? '',
        aAmount: assets[i]?.amount ?? '',
      },
    });
  }

  const columns: ColumnDef[] = [
    { key: 'liability', label: 'Liabilities', width: 32, align: 'left' },
    { key: 'lAmount', label: 'Amt. in Rs.', width: 13, align: 'right', formatter: MONEY, signed: true },
    { key: 'asset', label: 'Assets', width: 32, align: 'left' },
    { key: 'aAmount', label: 'Amt. in Rs.', width: 13, align: 'right', formatter: MONEY, signed: true },
  ];

  const totalLiab = new Decimal(bs.totalLiabilities).plus(bs.totalEquity);
  return {
    reportTitle: `Balance Sheet Report As On ${asOf ? fmtDateDDMMYYYY(asOf) : todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'Grand Total',
      values: { lAmount: totalLiab.toString(), aAmount: bs.totalAssets },
    },
    filenameStem: `balance-sheet${asOf ? `-${asOf}` : ''}`,
  };
}

// ─── 9. ITR Schedule 112A ─────────────────────────────────────────

export async function buildSchedule112ALayout(
  userId: string,
  fy?: string,
  portfolioId?: string,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const r = portfolioId ? await schedule112AReport(portfolioId, fy) : await userSchedule112AReport(userId, fy);
  const rows = r.rows.map((row) => ({
    cells: {
      listed: 'Listed',
      category: 'Equity Shares',
      term: 'Long term',
      name: row.assetName,
      sale: row.sellAmount,
      cost: row.buyAmount,
      fmv: '',
      expenses: '0',
      transferDate: row.sellDate,
      acquisitionDate: row.buyDate,
      qty: row.quantity.toString(),
      sellRate: row.sellPrice.toString(),
      gain: row.gainLoss.toString(),
    },
  }));

  const totalSale = r.rows.reduce((s, x) => s.plus(x.sellAmount), new Decimal(0));
  const totalCost = r.rows.reduce((s, x) => s.plus(x.buyAmount), new Decimal(0));

  const columns: ColumnDef[] = [
    { key: 'listed', label: 'Listed/Unlisted', width: 9, align: 'left' },
    { key: 'category', label: 'Category', width: 9, align: 'left' },
    { key: 'term', label: 'Long/Short Term', width: 9, align: 'left' },
    { key: 'name', label: 'Name of Company', width: 18, align: 'left' },
    { key: 'sale', label: 'Sale Amount', width: 9, align: 'right', formatter: MONEY },
    { key: 'cost', label: 'Cost of Acq.', width: 9, align: 'right', formatter: MONEY },
    { key: 'fmv', label: 'FMV', width: 7, align: 'right' },
    { key: 'expenses', label: 'Expenses', width: 7, align: 'right' },
    { key: 'transferDate', label: 'Transfer Date', width: 8, align: 'center', formatter: DATE },
    { key: 'acquisitionDate', label: 'Acq. Date', width: 8, align: 'center', formatter: DATE },
    { key: 'qty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Sell Rate', width: 7, align: 'right', formatter: MONEY },
    { key: 'gain', label: 'Gain/Loss', width: 8, align: 'right', formatter: MONEY, signed: true },
  ];

  return {
    reportTitle: `Income Tax — Schedule 112A LTCG ${fy ? `(FY ${fy})` : ''}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: fy ?? 'All',
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'Grand Total',
      values: {
        sale: totalSale.toString(),
        cost: totalCost.toString(),
        gain: r.totalGain,
      },
    },
    filenameStem: `itr-schedule-112a${fy ? `-${fy}` : ''}`,
  };
}

// ─── 10. MF capital gain (short + long) ───────────────────────────

export async function buildMFCapitalGainLayout(userId: string, fy?: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const { rows } = await computeUserCapitalGains(userId);
  const filtered = rows.filter(
    (r) =>
      (r.assetClass === 'MUTUAL_FUND' || r.assetClass === 'ETF') &&
      (!fy || r.financialYear === fy),
  );
  const stcgRows = filtered.filter((r) => r.capitalGainType !== 'LONG_TERM');
  const ltcgRows = filtered.filter((r) => r.capitalGainType === 'LONG_TERM');
  const sections: ReportSection[] = [];
  if (stcgRows.length) {
    const sec = buildCgSection(stcgRows);
    sec.banner = 'Short Term';
    sections.push(sec);
  }
  if (ltcgRows.length) {
    const sec = buildCgSection(ltcgRows);
    sec.banner = 'Long Term';
    sections.push(sec);
  }
  const totalGain = filtered.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));

  return {
    reportTitle: `Capital Gain - Loss Mutual Fund As on ${todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: fy ?? 'All',
    headerRow1: cgHeaderRow1(),
    headerRow2: cgColumns().map((c) => ({ label: c.label, align: c.align })),
    columns: cgColumns(),
    sections,
    grandTotal: { label: 'Grand Total', values: { gainLoss: totalGain.toString() } },
    filenameStem: `mf-capital-gain${fy ? `-${fy}` : ''}`,
  };
}

// ─── 11. Daily transactions (Broker Bill Register) ────────────────

export async function buildDailyTransactionsLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const where: Record<string, unknown> = { portfolio: { userId } };
  if (opts.from || opts.to) {
    where['tradeDate'] = {
      ...(opts.from && { gte: new Date(opts.from) }),
      ...(opts.to && { lte: new Date(opts.to) }),
    };
  }
  const txs = await prisma.transaction.findMany({
    where,
    orderBy: [{ broker: 'asc' }, { tradeDate: 'asc' }],
  });
  const byBroker = new Map<string, typeof txs>();
  for (const t of txs) {
    const k = t.broker ?? 'Self';
    const arr = byBroker.get(k) ?? [];
    arr.push(t);
    byBroker.set(k, arr);
  }
  const sections: ReportSection[] = Array.from(byBroker.entries()).map(([broker, list]) => ({
    banner: broker,
    groups: [{
      rows: list.map((t) => ({
        cells: {
          tradeDate: t.tradeDate.toISOString().slice(0, 10),
          type: t.transactionType,
          script: t.assetName ?? '—',
          qty: t.quantity.toString(),
          rate: t.price.toString(),
          gross: t.grossAmount.toString(),
          brokerage: t.brokerage.toString(),
          net: t.netAmount.toString(),
        },
      })),
      subtotal: {
        label: `Total: ${broker}`,
        values: {
          gross: list.reduce((s, t) => s.plus(t.grossAmount.toString()), new Decimal(0)).toString(),
          brokerage: list.reduce((s, t) => s.plus(t.brokerage.toString()), new Decimal(0)).toString(),
          net: list.reduce((s, t) => s.plus(t.netAmount.toString()), new Decimal(0)).toString(),
        },
      },
    }],
  }));

  const columns: ColumnDef[] = [
    { key: 'tradeDate', label: 'Date', width: 8, align: 'center', formatter: DATE },
    { key: 'type', label: 'Type', width: 8, align: 'left' },
    { key: 'script', label: 'Script Name', width: 24, align: 'left' },
    { key: 'qty', label: 'Qty', width: 6, align: 'right', formatter: INT },
    { key: 'rate', label: 'Rate', width: 8, align: 'right', formatter: MONEY },
    { key: 'gross', label: 'Gross Amt.', width: 9, align: 'right', formatter: MONEY },
    { key: 'brokerage', label: 'Brokerage', width: 8, align: 'right', formatter: MONEY },
    { key: 'net', label: 'Net Amount', width: 10, align: 'right', formatter: MONEY, signed: true },
  ];

  const grandGross = txs.reduce((s, t) => s.plus(t.grossAmount.toString()), new Decimal(0));
  const grandBrokerage = txs.reduce((s, t) => s.plus(t.brokerage.toString()), new Decimal(0));
  const grandNet = txs.reduce((s, t) => s.plus(t.netAmount.toString()), new Decimal(0));

  return {
    reportTitle: `BrokerBill Register As On ${todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: {
        gross: grandGross.toString(),
        brokerage: grandBrokerage.toString(),
        net: grandNet.toString(),
      },
    },
    filenameStem: `broker-bill-register${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 12. Income (dividends / interest / maturity) ─────────────────

export async function buildIncomeReportLayout(
  userId: string,
  fy?: string,
  portfolioId?: string,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const r = portfolioId ? await incomeReport(portfolioId, fy) : await userIncomeReport(userId, fy);
  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date', width: 8, align: 'center', formatter: DATE },
    { key: 'type', label: 'Type', width: 12, align: 'left' },
    { key: 'assetName', label: 'Script', width: 28, align: 'left' },
    { key: 'amount', label: 'Amount', width: 10, align: 'right', formatter: MONEY },
    { key: 'narration', label: 'Narration', width: 32, align: 'left' },
  ];
  return {
    reportTitle: `Income Report ${fy ? `(FY ${fy})` : ''}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: fy ?? 'All',
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [
      {
        groups: [{
          rows: r.rows.map((row) => ({
            cells: {
              date: row.date,
              type: row.type,
              assetName: row.assetName,
              amount: row.amount,
              narration: row.narration ?? '',
            },
          })),
        }],
      },
    ],
    grandTotal: {
      label: 'Grand Total',
      values: { amount: r.total },
    },
    filenameStem: `income-report${fy ? `-${fy}` : ''}`,
  };
}

// ─── 13. Portfolio Holdings Summary ───────────────────────────────
//
// Cross-asset valuation as-of-today. Holdings live in HoldingProjection,
// already FIFO-replayed from Transactions + CorporateActions, so this
// builder only reads, groups by asset class, and tallies. Holdings that
// have no live price (FD, gold, bonds…) fall back to totalCost so they
// still appear in totals.

export async function buildPortfolioHoldingsSummaryLayout(
  userId: string,
  portfolioId?: string,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const holdings = await prisma.holdingProjection.findMany({
    where: {
      portfolio: { userId },
      ...(portfolioId ? { portfolioId } : {}),
    },
    include: { portfolio: { select: { name: true } } },
    orderBy: [{ assetClass: 'asc' }, { assetName: 'asc' }],
  });

  const effectiveVal = (h: { currentValue: unknown; totalCost: unknown }): Decimal => {
    if (h.currentValue != null) return new Decimal(String(h.currentValue));
    return new Decimal(String(h.totalCost));
  };

  const byClass = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const arr = byClass.get(h.assetClass) ?? [];
    arr.push(h);
    byClass.set(h.assetClass, arr);
  }

  const sections: ReportSection[] = Array.from(byClass.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([assetClass, list]) => {
      const tot = list.reduce(
        (acc, h) => ({
          qty: acc.qty.plus(new Decimal(String(h.quantity))),
          cost: acc.cost.plus(new Decimal(String(h.totalCost))),
          value: acc.value.plus(effectiveVal(h)),
          pnl: acc.pnl.plus(effectiveVal(h).minus(new Decimal(String(h.totalCost)))),
        }),
        { qty: new Decimal(0), cost: new Decimal(0), value: new Decimal(0), pnl: new Decimal(0) },
      );
      return {
        banner: assetClass.replace(/_/g, ' '),
        groups: [{
          rows: list.map((h) => {
            const cost = new Decimal(String(h.totalCost));
            const value = effectiveVal(h);
            const pnl = value.minus(cost);
            const pct = cost.greaterThan(0) ? pnl.dividedBy(cost).times(100) : new Decimal(0);
            return {
              cells: {
                scriptName: h.assetName ?? '—',
                isin: h.isin ?? '',
                portfolio: h.portfolio.name,
                qty: h.quantity.toString(),
                avgCost: h.avgCostPrice.toString(),
                totalCost: h.totalCost.toString(),
                currentPrice: h.currentPrice?.toString() ?? '',
                currentValue: value.toString(),
                pnl: pnl.toString(),
                pct: pct.toFixed(2),
              },
            };
          }),
          subtotal: {
            label: `Total: ${assetClass.replace(/_/g, ' ')}`,
            values: {
              totalCost: tot.cost.toString(),
              currentValue: tot.value.toString(),
              pnl: tot.pnl.toString(),
              pct: tot.cost.greaterThan(0)
                ? tot.pnl.dividedBy(tot.cost).times(100).toFixed(2)
                : '0.00',
            },
          },
        }],
      };
    });

  const grand = holdings.reduce(
    (acc, h) => {
      const value = effectiveVal(h);
      const cost = new Decimal(String(h.totalCost));
      return {
        cost: acc.cost.plus(cost),
        value: acc.value.plus(value),
        pnl: acc.pnl.plus(value.minus(cost)),
      };
    },
    { cost: new Decimal(0), value: new Decimal(0), pnl: new Decimal(0) },
  );

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script / Holding', width: 20, align: 'left' },
    { key: 'isin', label: 'ISIN', width: 10, align: 'left' },
    { key: 'portfolio', label: 'Portfolio', width: 12, align: 'left' },
    { key: 'qty', label: 'Qty', width: 7, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'avgCost', label: 'Avg Cost', width: 8, align: 'right', formatter: MONEY },
    { key: 'totalCost', label: 'Invested', width: 9, align: 'right', formatter: MONEY },
    { key: 'currentPrice', label: 'CMP', width: 7, align: 'right', formatter: (v) => (v ? MONEY(v) : '—') },
    { key: 'currentValue', label: 'Current Value', width: 10, align: 'right', formatter: MONEY },
    { key: 'pnl', label: 'P&L', width: 9, align: 'right', formatter: MONEY, signed: true },
    { key: 'pct', label: '%', width: 6, align: 'right' },
  ];

  return {
    reportTitle: `Portfolio Holdings Summary As On ${todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: {
        totalCost: grand.cost.toString(),
        currentValue: grand.value.toString(),
        pnl: grand.pnl.toString(),
        pct: grand.cost.greaterThan(0)
          ? grand.pnl.dividedBy(grand.cost).times(100).toFixed(2)
          : '0.00',
      },
    },
    filenameStem: `holdings-summary-${new Date().toISOString().slice(0, 10)}`,
  };
}

// ─── 14. XIRR / TWR Performance ───────────────────────────────────
//
// Performance summary per portfolio + a user-wide row. XIRR comes from
// the existing computeUserXirr / portfolio-level service. We list each
// portfolio with invested, current, absolute return, XIRR.

export async function buildPerformanceLayout(userId: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
  });

  // Reuse the per-portfolio XIRR engine; computeUserXirr already loops
  // through all portfolios, so we duplicate the loop only to get the
  // per-portfolio breakdown plus the user roll-up in a single layout.
  const { computePortfolioXirr } = await import('../../xirr.service.js');

  const rows: BodyRowLite[] = [];
  let totalInvested = new Decimal(0);
  let totalValue = new Decimal(0);
  for (const p of portfolios) {
    const x = await computePortfolioXirr(p.id);
    const invested = new Decimal(x.totalInvested);
    const value = new Decimal(x.terminalValue);
    const absRet = value.minus(invested);
    const absPct = invested.greaterThan(0) ? absRet.dividedBy(invested).times(100) : new Decimal(0);
    totalInvested = totalInvested.plus(invested);
    totalValue = totalValue.plus(value);
    rows.push({
      cells: {
        name: p.name,
        type: p.type,
        invested: invested.toString(),
        value: value.toString(),
        absRet: absRet.toString(),
        absPct: absPct.toFixed(2),
        xirr: x.xirr != null ? new Decimal(x.xirr).times(100).toFixed(2) : '—',
      },
    });
  }

  const user = await computeUserXirr(userId);
  const grandAbs = totalValue.minus(totalInvested);
  const grandPct = totalInvested.greaterThan(0)
    ? grandAbs.dividedBy(totalInvested).times(100)
    : new Decimal(0);

  const columns: ColumnDef[] = [
    { key: 'name', label: 'Portfolio', width: 22, align: 'left' },
    { key: 'type', label: 'Type', width: 10, align: 'left' },
    { key: 'invested', label: 'Invested', width: 12, align: 'right', formatter: MONEY },
    { key: 'value', label: 'Current Value', width: 12, align: 'right', formatter: MONEY },
    { key: 'absRet', label: 'Abs Return', width: 11, align: 'right', formatter: MONEY, signed: true },
    { key: 'absPct', label: 'Abs %', width: 7, align: 'right' },
    { key: 'xirr', label: 'XIRR %', width: 7, align: 'right' },
  ];

  return {
    reportTitle: `XIRR / Performance Report As On ${todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'All Portfolios',
      values: {
        invested: totalInvested.toString(),
        value: totalValue.toString(),
        absRet: grandAbs.toString(),
        absPct: grandPct.toFixed(2),
        xirr: user.xirr != null ? new Decimal(user.xirr).times(100).toFixed(2) : '—',
      },
    },
    filenameStem: `performance-xirr-${new Date().toISOString().slice(0, 10)}`,
  };
}

// ─── 15. Tax Summary (Form 16 helper) ─────────────────────────────
//
// Annual tax rollup combining intraday, STCG, LTCG, Sec 112A and the
// income types (dividend / interest / maturity) into one table that
// mirrors the cells of ITR-2 / ITR-3.

export async function buildTaxSummaryLayout(
  userId: string,
  fy?: string,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const [intraday, stcg, ltcg, s112a, income] = await Promise.all([
    userIntradayReport(userId, fy),
    userStcgReport(userId, fy),
    userLtcgReport(userId, fy),
    userSchedule112AReport(userId, fy),
    userIncomeReport(userId, fy),
  ]);

  const sum = (rows: Array<{ gainLoss: Decimal | string }>): Decimal =>
    rows.reduce((s, r) => s.plus(new Decimal(String(r.gainLoss))), new Decimal(0));

  const intradayPL = sum(intraday.rows);
  const stcgPL = sum(stcg.rows);
  const ltcgPL = sum(ltcg.rows);
  const s112aTaxable = new Decimal(s112a.taxable);
  const s112aTotal = new Decimal(s112a.totalGain);

  // userIncomeReport returns rows with `amount` field, not gainLoss.
  // Re-derive the totals it already publishes on the response.
  const dividend = new Decimal(income.dividend);
  const interest = new Decimal(income.interest);
  const maturity = new Decimal(income.maturity);

  // ITR head sub-totals.
  const totalCapGain = intradayPL.plus(stcgPL).plus(ltcgPL);
  const otherIncome = dividend.plus(interest).plus(maturity);
  const grand = totalCapGain.plus(otherIncome);

  type Row = { head: string; section: string; line: string; amount: string; note?: string };
  const data: Row[] = [
    { head: 'Capital Gains', section: 'Speculation', line: 'Intraday (business income)', amount: intradayPL.toString() },
    { head: 'Capital Gains', section: 'STCG (Sec 111A)', line: 'Equity / Equity-MF short-term gain', amount: stcgPL.toString() },
    { head: 'Capital Gains', section: 'LTCG (Sec 112)', line: 'Long-term gain (non-grandfathered)', amount: ltcgPL.toString() },
    { head: 'Capital Gains', section: 'LTCG (Sec 112A)', line: 'Equity / Equity-MF LTCG (gross)', amount: s112aTotal.toString(), note: '₹1L exemption applies' },
    { head: 'Capital Gains', section: 'LTCG (Sec 112A)', line: 'Equity / Equity-MF LTCG (taxable)', amount: s112aTaxable.toString() },
    { head: 'Other Income', section: 'IFOS', line: 'Dividend income', amount: dividend.toString() },
    { head: 'Other Income', section: 'IFOS', line: 'Interest received', amount: interest.toString() },
    { head: 'Other Income', section: 'IFOS', line: 'Maturity proceeds', amount: maturity.toString() },
  ];

  const sections: ReportSection[] = (['Capital Gains', 'Other Income'] as const).map((head) => {
    const list = data.filter((d) => d.head === head);
    const sub = list.reduce((s, r) => s.plus(new Decimal(r.amount)), new Decimal(0));
    return {
      banner: head.toUpperCase(),
      groups: [{
        rows: list.map((r) => ({
          cells: {
            section: r.section,
            line: r.line,
            amount: r.amount,
            note: r.note ?? '',
          },
        })),
        subtotal: {
          label: `Total: ${head}`,
          values: { amount: sub.toString() },
        },
      }],
    };
  });

  const columns: ColumnDef[] = [
    { key: 'section', label: 'Tax Section', width: 16, align: 'left' },
    { key: 'line', label: 'Description', width: 32, align: 'left' },
    { key: 'amount', label: 'Amount', width: 12, align: 'right', formatter: MONEY, signed: true },
    { key: 'note', label: 'Notes', width: 18, align: 'left' },
  ];

  return {
    reportTitle: `Tax Summary (Form 16 Helper) ${fy ? `FY ${fy}` : ''}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: fy ?? 'All',
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Total Taxable + Reportable',
      values: { amount: grand.toString() },
    },
    filenameStem: `tax-summary${fy ? `-${fy}` : ''}`,
  };
}

// ─── 16. Cash Flow Statement ──────────────────────────────────────
//
// Period inflows / outflows from the CashFlow table grouped by
// description-prefix → category. Rendered T-account style: inflows
// on credit side, outflows on debit side, net change as balancing
// entry so columns tally.

export async function buildCashFlowStatementLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const where: Record<string, unknown> = { portfolio: { userId } };
  if (opts.from || opts.to) {
    where['date'] = {
      ...(opts.from && { gte: new Date(opts.from) }),
      ...(opts.to && { lte: new Date(opts.to) }),
    };
  }
  const flows = await prisma.cashFlow.findMany({
    where,
    include: { portfolio: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });

  // Categorise from the type + description. Pretty coarse on purpose:
  // INFLOW + "dividend" → Dividend Received, INFLOW + "interest" → Interest, etc.
  function category(f: { type: string; description: string | null }): string {
    const d = (f.description ?? '').toLowerCase();
    if (d.includes('dividend')) return 'Dividend Received';
    if (d.includes('interest')) return 'Interest Received';
    if (d.includes('rent')) return 'Rental Income';
    if (d.includes('maturity')) return 'Maturity Proceeds';
    if (d.includes('sell') || d.includes('sale')) return 'Sale Proceeds';
    if (d.includes('buy') || d.includes('purchase')) return 'Investment Purchases';
    if (d.includes('premium')) return 'Insurance Premium';
    if (d.includes('emi') || d.includes('loan')) return 'Loan / EMI';
    return f.type === 'INFLOW' ? 'Other Income' : 'Other Outflow';
  }

  const inflowByCat = new Map<string, Decimal>();
  const outflowByCat = new Map<string, Decimal>();
  for (const f of flows) {
    const cat = category(f);
    const amt = new Decimal(String(f.amount));
    if (f.type === 'INFLOW') {
      inflowByCat.set(cat, (inflowByCat.get(cat) ?? new Decimal(0)).plus(amt));
    } else {
      outflowByCat.set(cat, (outflowByCat.get(cat) ?? new Decimal(0)).plus(amt));
    }
  }

  const inflowList = Array.from(inflowByCat.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, amount]) => ({ name: `BY ${name.toUpperCase()}`, amount: amount.toString() }));
  const outflowList = Array.from(outflowByCat.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, amount]) => ({ name: `TO ${name.toUpperCase()}`, amount: amount.toString() }));

  const totalInflow = Array.from(inflowByCat.values()).reduce((s, v) => s.plus(v), new Decimal(0));
  const totalOutflow = Array.from(outflowByCat.values()).reduce((s, v) => s.plus(v), new Decimal(0));
  const net = totalInflow.minus(totalOutflow);
  const isPositive = net.greaterThanOrEqualTo(0);
  if (isPositive) {
    outflowList.push({
      name: 'TO NET CASH SURPLUS C/F',
      amount: net.toString(),
    });
  } else {
    inflowList.push({
      name: 'BY NET CASH DEFICIT C/F',
      amount: net.abs().toString(),
    });
  }

  const maxLen = Math.max(outflowList.length, inflowList.length);
  const rows: BodyRowLite[] = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      cells: {
        outParticulars: outflowList[i]?.name ?? '',
        outAmount: outflowList[i]?.amount ?? '',
        inParticulars: inflowList[i]?.name ?? '',
        inAmount: inflowList[i]?.amount ?? '',
      },
    });
  }

  const columns: ColumnDef[] = [
    { key: 'outParticulars', label: 'Outflow', width: 28, align: 'left' },
    { key: 'outAmount', label: 'Amount', width: 12, align: 'right', formatter: MONEY },
    { key: 'inParticulars', label: 'Inflow', width: 28, align: 'left' },
    { key: 'inAmount', label: 'Amount', width: 12, align: 'right', formatter: MONEY },
  ];

  const sideTotal = (isPositive ? totalInflow : totalOutflow).toString();
  const debitTotal = isPositive ? sideTotal : totalOutflow.toString();
  const creditTotal = isPositive ? totalInflow.toString() : sideTotal;

  const fromStamp = opts.from
    ? fmtDateDDMMYYYY(opts.from)
    : (flows[0] ? fmtDateDDMMYYYY(flows[0].date) : 'inception');
  const toStamp = opts.to ? fmtDateDDMMYYYY(opts.to) : todayDDMMYYYY();

  return {
    reportTitle: `Cash Flow Statement (${fromStamp} → ${toStamp})`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'Grand Total',
      values: { outAmount: debitTotal, inAmount: creditTotal },
    },
    filenameStem: `cash-flow${opts.from ? `-${opts.from}` : ''}`,
  };
}

// Helper alias to avoid widening BodyRow's `cells` type.
type BodyRowLite = { cells: Record<string, unknown> };

// ─── 17. Combined Realised / Unrealised G/L (Equity) ─────────────
//
// Matches the mProfit screenshot: every BUY lot appears as one row.
// If the lot has been FIFO-matched against a SELL, the sell columns
// + Realized G/L (ST or LT) populate. If the lot still has residual
// quantity at as-of-date, the Closing + Mkt rate + Unrealised cells
// populate. Pre-31-Jan-2018 buys get the FMV grandfathering treatment
// in the dedicated GF columns.

export async function buildCombinedRealisedUnrealisedLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();

  // ── Realised half: pull all capital-gain matches for equity / ETF ──
  const { rows: cgRows } = await computeUserCapitalGains(userId);
  const equityCg = cgRows.filter(
    (r) => (r.assetClass === 'EQUITY' || r.assetClass === 'ETF')
      && r.sellDate.getTime() <= cutoff.getTime(),
  );

  // ── Unrealised half: residual lots from raw txs ─────────────
  const allTxs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      assetClass: { in: ['EQUITY', 'ETF'] },
      tradeDate: { lte: cutoff },
    },
    orderBy: { tradeDate: 'asc' },
  });
  const lots = residualLots(
    allTxs.map((t) => {
      const q = new Decimal(t.quantity.toString());
      const net = new Decimal(t.netAmount.toString());
      const effective = q.isZero() ? new Decimal(t.price.toString()) : net.dividedBy(q);
      return {
        tradeDate: t.tradeDate,
        quantity: q,
        price: effective,
        assetKey: t.assetKey ?? `name:${t.assetName ?? ''}`,
        assetName: t.assetName,
        isin: t.isin,
        transactionType: t.transactionType,
      };
    }),
  );

  // Latest market price per stockId (via assetKey lookup) ----------
  const stockIds = Array.from(new Set(
    lots.filter((l) => l.assetKey.startsWith('stock:')).map((l) => l.assetKey.slice(6)),
  ));
  const priceByStock = new Map<string, Decimal>();
  if (stockIds.length > 0) {
    const latest = await prisma.stockPrice.findMany({
      where: { stockId: { in: stockIds }, date: { lte: cutoff } },
      orderBy: { date: 'desc' },
    });
    for (const p of latest) {
      if (!priceByStock.has(p.stockId)) {
        priceByStock.set(p.stockId, new Decimal(p.close.toString()));
      }
    }
  }
  const mktForKey = (key: string): Decimal | null => {
    if (key.startsWith('stock:')) return priceByStock.get(key.slice(6)) ?? null;
    return null;
  };

  // FMV table for grandfathering -----------------------------------
  const allIsins = Array.from(new Set([
    ...equityCg.map((r) => r.isin),
    ...lots.map((l) => l.isin),
  ].filter((i): i is string => !!i)));
  const fmvByIsin = await fetchFmvOn31Jan2018(allIsins);

  const GF_CUTOFF = new Date('2018-01-31T23:59:59.999Z');

  // Row shape -----------------------------------------------------
  type Row = {
    scriptName: string;
    scriptCode: string;
    buyDate: string;
    buyQty: string;
    buyRate: string;
    buyAmount: string;
    sellDate: string;
    sellQty: string;
    sellRate: string;
    sellAmount: string;
    closingQty: string;
    mktRate: string;
    intradayGL: string;
    realizedST: string;
    realizedLT: string;
    unrealisedGL: string;
    holdingDays: string;
    gfRate: string;
    gfCost: string;
    gfComputedGL: string;
  };

  const byScript = new Map<string, Row[]>();
  const addRow = (name: string, r: Row) => {
    const arr = byScript.get(name) ?? [];
    arr.push(r);
    byScript.set(name, arr);
  };

  // Realised rows -------------------------------------------------
  for (const r of equityCg) {
    const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
    const adjGain = adjustGainForGrandfathering(
      r.buyDate,
      r.quantity,
      r.buyAmount,
      r.sellAmount,
      r.gainLoss,
      fmv,
    );
    const isGf = r.buyDate.getTime() <= GF_CUTOFF.getTime() && fmv != null;
    const isIntraday = r.capitalGainType === 'INTRADAY';
    const isST = r.capitalGainType === 'SHORT_TERM';
    const isLT = r.capitalGainType === 'LONG_TERM';
    const holdingDays = Math.round(
      (r.sellDate.getTime() - r.buyDate.getTime()) / 86_400_000,
    );
    addRow(r.assetName, {
      scriptName: r.assetName,
      scriptCode: r.isin ?? '',
      buyDate: r.buyDate.toISOString().slice(0, 10),
      buyQty: r.quantity.toString(),
      buyRate: r.buyPrice.toString(),
      buyAmount: r.buyAmount.toString(),
      sellDate: r.sellDate.toISOString().slice(0, 10),
      sellQty: r.quantity.toString(),
      sellRate: r.sellPrice.toString(),
      sellAmount: r.sellAmount.toString(),
      closingQty: '',
      mktRate: '',
      intradayGL: isIntraday ? r.gainLoss.toString() : '',
      realizedST: isST ? r.gainLoss.toString() : '',
      realizedLT: isLT ? r.gainLoss.toString() : '',
      unrealisedGL: '',
      holdingDays: String(holdingDays),
      gfRate: isGf && fmv ? fmv.toFixed(4) : '',
      gfCost: isGf && fmv ? fmv.times(r.quantity).toString() : '',
      gfComputedGL: isGf ? adjGain.toString() : '',
    });
  }

  // Unrealised rows (residual lots) -------------------------------
  for (const l of lots) {
    const name = l.scriptName;
    const mkt = mktForKey(l.assetKey);
    const unrealised = mkt ? mkt.minus(l.rate).times(l.qty) : null;
    const days = Math.round((cutoff.getTime() - l.date.getTime()) / 86_400_000);
    const fmv = l.isin ? fmvByIsin.get(l.isin) ?? null : null;
    const isGf = l.date.getTime() <= GF_CUTOFF.getTime() && fmv != null;
    const gfGL = mkt && isGf && fmv
      ? mkt.times(l.qty).minus(fmv.times(l.qty)).toString()
      : '';
    addRow(name, {
      scriptName: name,
      scriptCode: l.isin ?? '',
      buyDate: l.date.toISOString().slice(0, 10),
      buyQty: l.qty.toString(),
      buyRate: l.rate.toString(),
      buyAmount: l.qty.times(l.rate).toString(),
      sellDate: '',
      sellQty: '',
      sellRate: '',
      sellAmount: '',
      closingQty: l.qty.toString(),
      mktRate: mkt ? mkt.toString() : '',
      intradayGL: '',
      realizedST: '',
      realizedLT: '',
      unrealisedGL: unrealised ? unrealised.toString() : '',
      holdingDays: String(days),
      gfRate: isGf && fmv ? fmv.toFixed(4) : '',
      gfCost: isGf && fmv ? fmv.times(l.qty).toString() : '',
      gfComputedGL: gfGL,
    });
  }

  const groups: SubGroup[] = Array.from(byScript.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([scriptName, rows]) => {
      const tot = rows.reduce(
        (acc, r) => ({
          buyQty: acc.buyQty.plus(new Decimal(r.buyQty || '0')),
          buyAmt: acc.buyAmt.plus(new Decimal(r.buyAmount || '0')),
          sellQty: acc.sellQty.plus(new Decimal(r.sellQty || '0')),
          sellAmt: acc.sellAmt.plus(new Decimal(r.sellAmount || '0')),
          closingQty: acc.closingQty.plus(new Decimal(r.closingQty || '0')),
          rST: acc.rST.plus(new Decimal(r.realizedST || '0')),
          rLT: acc.rLT.plus(new Decimal(r.realizedLT || '0')),
          unrealised: acc.unrealised.plus(new Decimal(r.unrealisedGL || '0')),
        }),
        {
          buyQty: new Decimal(0), buyAmt: new Decimal(0),
          sellQty: new Decimal(0), sellAmt: new Decimal(0),
          closingQty: new Decimal(0),
          rST: new Decimal(0), rLT: new Decimal(0), unrealised: new Decimal(0),
        },
      );
      return {
        header: scriptName,
        rows: rows.map((r) => ({ cells: r as unknown as Record<string, unknown> })),
        subtotal: {
          label: `Total: ${scriptName}`,
          values: {
            buyQty: tot.buyQty.toString(),
            buyAmount: tot.buyAmt.toString(),
            sellQty: tot.sellQty.toString(),
            sellAmount: tot.sellAmt.toString(),
            closingQty: tot.closingQty.toString(),
            realizedST: tot.rST.toString(),
            realizedLT: tot.rLT.toString(),
            unrealisedGL: tot.unrealised.toString(),
          },
        },
      };
    });

  const grand = {
    buyQty: new Decimal(0), buyAmt: new Decimal(0),
    sellQty: new Decimal(0), sellAmt: new Decimal(0),
    closingQty: new Decimal(0),
    rST: new Decimal(0), rLT: new Decimal(0), unrealised: new Decimal(0),
  };
  for (const rows of byScript.values()) {
    for (const r of rows) {
      grand.buyQty = grand.buyQty.plus(new Decimal(r.buyQty || '0'));
      grand.buyAmt = grand.buyAmt.plus(new Decimal(r.buyAmount || '0'));
      grand.sellQty = grand.sellQty.plus(new Decimal(r.sellQty || '0'));
      grand.sellAmt = grand.sellAmt.plus(new Decimal(r.sellAmount || '0'));
      grand.closingQty = grand.closingQty.plus(new Decimal(r.closingQty || '0'));
      grand.rST = grand.rST.plus(new Decimal(r.realizedST || '0'));
      grand.rLT = grand.rLT.plus(new Decimal(r.realizedLT || '0'));
      grand.unrealised = grand.unrealised.plus(new Decimal(r.unrealisedGL || '0'));
    }
  }

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 12, align: 'left' },
    { key: 'scriptCode', label: 'Script Code', width: 7, align: 'left' },
    { key: 'buyDate', label: 'Date', width: 6, align: 'center', formatter: DATE },
    { key: 'buyQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'buyRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'buyAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'sellDate', label: 'Date', width: 6, align: 'center', formatter: DATE },
    { key: 'sellQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'sellAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'closingQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'mktRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'intradayGL', label: 'IntraDay G/L', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'realizedST', label: 'ST', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'realizedLT', label: 'LT', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'unrealisedGL', label: 'Unrealised G/L', width: 8, align: 'right', formatter: MONEY, signed: true },
    { key: 'holdingDays', label: 'Days', width: 4, align: 'right' },
    { key: 'gfRate', label: 'GF Rate 31/01/2018', width: 7, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'gfCost', label: 'GF Cost', width: 7, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'gfComputedGL', label: 'GF Computed G/L', width: 8, align: 'right', formatter: (v) => v ? MONEY(v) : '', signed: true },
  ];

  return {
    reportTitle: `Combined Realised/Unrealised Gain/Loss Report as on ${fmtDateDDMMYYYY(cutoff)} (Equity)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Script Code', spanCols: 1 },
      { label: 'Buy', spanCols: 4 },
      { label: 'Sell', spanCols: 4 },
      { label: 'Closing', spanCols: 1 },
      { label: 'Mkt', spanCols: 1 },
      { label: 'IntraDay', spanCols: 1 },
      { label: 'Realized Gain/Loss', spanCols: 2 },
      { label: 'Unrealised', spanCols: 2 },
      { label: 'Grandfathering', spanCols: 3 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups }],
    grandTotal: {
      label: 'Grand Total',
      values: {
        buyQty: grand.buyQty.toString(),
        buyAmount: grand.buyAmt.toString(),
        sellQty: grand.sellQty.toString(),
        sellAmount: grand.sellAmt.toString(),
        closingQty: grand.closingQty.toString(),
        realizedST: grand.rST.toString(),
        realizedLT: grand.rLT.toString(),
        unrealisedGL: grand.unrealised.toString(),
      },
    },
    filenameStem: `combined-realised-unrealised-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── 18. Family-wise Holdings Report ──────────────────────────────
//
// Family / Member roll-up. v2 is single-user (CLAUDE.md §1 row 2), so
// "family" = the user, "member" = each portfolio, "holding type" =
// each asset class within a portfolio. Schema already supports the
// multi-member shape (v3); when that lands we swap the user→members
// hierarchy without changing the layout.

export async function buildFamilyWiseHoldingsLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    include: { portfolio: { select: { name: true } } },
    orderBy: [{ portfolioId: 'asc' }, { assetClass: 'asc' }, { assetName: 'asc' }],
  });

  const effectiveVal = (h: { currentValue: unknown; totalCost: unknown }): Decimal =>
    h.currentValue != null ? new Decimal(String(h.currentValue)) : new Decimal(String(h.totalCost));

  // Two-level grouping: portfolio → assetClass.
  const byPortfolio = new Map<string, Map<string, typeof holdings>>();
  for (const h of holdings) {
    const pName = h.portfolio.name;
    let inner = byPortfolio.get(pName);
    if (!inner) {
      inner = new Map();
      byPortfolio.set(pName, inner);
    }
    const arr = inner.get(h.assetClass) ?? [];
    arr.push(h);
    inner.set(h.assetClass, arr);
  }

  const sections: ReportSection[] = Array.from(byPortfolio.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([portfolioName, byClass]) => {
      const groups: SubGroup[] = [];
      let memberTotalQty = new Decimal(0);
      let memberTotalValue = new Decimal(0);
      for (const [assetClass, list] of Array.from(byClass.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const tot = list.reduce(
          (acc, h) => ({
            qty: acc.qty.plus(new Decimal(h.quantity.toString())),
            value: acc.value.plus(effectiveVal(h)),
          }),
          { qty: new Decimal(0), value: new Decimal(0) },
        );
        memberTotalQty = memberTotalQty.plus(tot.qty);
        memberTotalValue = memberTotalValue.plus(tot.value);
        groups.push({
          header: `${assetClass.replace(/_/g, ' ')} A/C`,
          rows: list.map((h) => ({
            cells: {
              script: h.assetName ?? '—',
              qty: h.quantity.toString(),
              rate: h.avgCostPrice.toString(),
              value: effectiveVal(h).toString(),
            },
          })),
          subtotal: {
            label: `Total: ${assetClass.replace(/_/g, ' ')} A/C`,
            values: {
              qty: tot.qty.toString(),
              value: tot.value.toString(),
            },
          },
        });
      }
      // Member roll-up subtotal as last "group" with grandTotal styling.
      groups.push({
        rows: [],
        subtotal: {
          label: `Total: ${portfolioName}`,
          values: { qty: memberTotalQty.toString(), value: memberTotalValue.toString() },
        },
      });
      return { banner: portfolioName.toUpperCase(), groups };
    });

  const grandQty = holdings.reduce((s, h) => s.plus(new Decimal(h.quantity.toString())), new Decimal(0));
  const grandValue = holdings.reduce((s, h) => s.plus(effectiveVal(h)), new Decimal(0));

  const columns: ColumnDef[] = [
    { key: 'script', label: 'Script / Consultant Name', width: 32, align: 'left' },
    { key: 'qty', label: 'Qty', width: 8, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'rate', label: 'Rate', width: 9, align: 'right', formatter: MONEY },
    { key: 'value', label: 'Value', width: 11, align: 'right', formatter: MONEY },
  ];

  return {
    reportTitle: `FamilyWise capital Gain - Loss Summary As On ${fmtDateDDMMYYYY(cutoff)}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Script / Consultant Name', spanCols: 1 },
      { label: 'Average', spanCols: 3 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: { qty: grandQty.toString(), value: grandValue.toString() },
    },
    filenameStem: `family-wise-holdings-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── 19. Scriptwise Qtywise Report ────────────────────────────────
//
// For a period: per-script Opening (from positions before `from`),
// Purchase (BUYs in window), Sale (SELLs in window) and Net Position
// (qty + amount). Opening uses average cost from prior FIFO replay;
// Net Position uses Avg Method as the screenshot notes ("Purchase -
// sell txn during the year and find closing stock as per avg method").

export async function buildScriptwiseQtywiseLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const fromDate = opts.from ? new Date(opts.from) : null;
  const toDate = opts.to ? new Date(opts.to) : new Date();

  // All equity / ETF transactions up to `to` — needed for opening calc.
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      assetClass: { in: ['EQUITY', 'ETF'] },
      tradeDate: { lte: toDate },
    },
    orderBy: { tradeDate: 'asc' },
  });

  // Walk the txs once, tracking per-asset running average. Snapshot
  // when we cross `from` for the opening figure; accumulate in/out
  // figures while in the window.
  type Bucket = {
    assetName: string;
    isin: string | null;
    openingQty: Decimal;
    openingValue: Decimal;
    buyQty: Decimal;
    buyValue: Decimal;
    sellQty: Decimal;
    sellValue: Decimal;
    // Running average for net-position computation
    runningQty: Decimal;
    runningValue: Decimal;
  };
  const buckets = new Map<string, Bucket>();
  const keyOf = (t: typeof txs[number]): string => t.assetKey ?? `name:${t.assetName ?? ''}`;
  const getBucket = (t: typeof txs[number]): Bucket => {
    const k = keyOf(t);
    let b = buckets.get(k);
    if (!b) {
      b = {
        assetName: t.assetName ?? k,
        isin: t.isin,
        openingQty: new Decimal(0),
        openingValue: new Decimal(0),
        buyQty: new Decimal(0),
        buyValue: new Decimal(0),
        sellQty: new Decimal(0),
        sellValue: new Decimal(0),
        runningQty: new Decimal(0),
        runningValue: new Decimal(0),
      };
      buckets.set(k, b);
    }
    return b;
  };
  // Snapshot opening once per bucket when first crossing `from`.
  const snapped = new Set<string>();
  for (const t of txs) {
    const k = keyOf(t);
    const b = getBucket(t);
    // "In window" = inside [from, to]. With no `from`, the entire
    // history is in-window (opening stays 0) — otherwise the report
    // shows everything as Opening with empty Purchase/Sale columns.
    const inWindow = !fromDate || t.tradeDate.getTime() >= fromDate.getTime();
    if (fromDate && t.tradeDate.getTime() >= fromDate.getTime() && !snapped.has(k)) {
      b.openingQty = b.runningQty;
      b.openingValue = b.runningValue;
      snapped.add(k);
    }
    const q = new Decimal(t.quantity.toString());
    const net = new Decimal(t.netAmount.toString());
    if (BUY_TXN_TYPES.has(t.transactionType)) {
      if (inWindow) {
        b.buyQty = b.buyQty.plus(q);
        b.buyValue = b.buyValue.plus(net);
      }
      b.runningQty = b.runningQty.plus(q);
      b.runningValue = b.runningValue.plus(net);
    } else if (SELL_TXN_TYPES.has(t.transactionType)) {
      if (inWindow) {
        b.sellQty = b.sellQty.plus(q);
        b.sellValue = b.sellValue.plus(net);
      }
      // Average-method exit: remove qty at the running average cost.
      const avg = b.runningQty.isZero() ? new Decimal(0) : b.runningValue.dividedBy(b.runningQty);
      b.runningQty = b.runningQty.minus(q);
      b.runningValue = b.runningValue.minus(avg.times(q));
    }
  }

  // Buckets with no in-window transactions: opening = full running
  // state at end of pre-window. Only relevant when fromDate is set.
  if (fromDate) {
    for (const [k, b] of buckets) {
      if (!snapped.has(k)) {
        b.openingQty = b.runningQty;
        b.openingValue = b.runningValue;
      }
    }
  }

  const rows = Array.from(buckets.values())
    .filter((b) => !b.openingQty.isZero() || !b.buyQty.isZero() || !b.sellQty.isZero() || !b.runningQty.isZero())
    .sort((a, b) => a.assetName.localeCompare(b.assetName))
    .map((b, idx) => {
      const openRate = b.openingQty.isZero() ? new Decimal(0) : b.openingValue.dividedBy(b.openingQty);
      const buyRate = b.buyQty.isZero() ? new Decimal(0) : b.buyValue.dividedBy(b.buyQty);
      const sellRate = b.sellQty.isZero() ? new Decimal(0) : b.sellValue.dividedBy(b.sellQty);
      return {
        cells: {
          sr: String(idx + 1),
          name: b.assetName,
          openQty: b.openingQty.toString(),
          openRate: openRate.toString(),
          openAmount: b.openingValue.toString(),
          buyQty: b.buyQty.toString(),
          buyRate: buyRate.toString(),
          buyAmount: b.buyValue.toString(),
          sellQty: b.sellQty.toString(),
          sellRate: sellRate.toString(),
          sellAmount: b.sellValue.toString(),
          netQty: b.runningQty.toString(),
          netAmount: b.runningValue.toString(),
        },
      };
    });

  const grand = rows.reduce(
    (acc, r) => ({
      openQty: acc.openQty.plus(new Decimal(r.cells.openQty as string)),
      openAmt: acc.openAmt.plus(new Decimal(r.cells.openAmount as string)),
      buyQty: acc.buyQty.plus(new Decimal(r.cells.buyQty as string)),
      buyAmt: acc.buyAmt.plus(new Decimal(r.cells.buyAmount as string)),
      sellQty: acc.sellQty.plus(new Decimal(r.cells.sellQty as string)),
      sellAmt: acc.sellAmt.plus(new Decimal(r.cells.sellAmount as string)),
      netQty: acc.netQty.plus(new Decimal(r.cells.netQty as string)),
      netAmt: acc.netAmt.plus(new Decimal(r.cells.netAmount as string)),
    }),
    {
      openQty: new Decimal(0), openAmt: new Decimal(0),
      buyQty: new Decimal(0), buyAmt: new Decimal(0),
      sellQty: new Decimal(0), sellAmt: new Decimal(0),
      netQty: new Decimal(0), netAmt: new Decimal(0),
    },
  );

  const columns: ColumnDef[] = [
    { key: 'sr', label: 'Sr No', width: 4, align: 'center' },
    { key: 'name', label: 'Name of the Company', width: 16, align: 'left' },
    { key: 'openQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'openRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'openAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'buyQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'buyRate', label: 'Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'buyAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'sellQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Avg Rate', width: 6, align: 'right', formatter: MONEY },
    { key: 'sellAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'netQty', label: 'Qty', width: 5, align: 'right', formatter: INT, signed: true },
    { key: 'netAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY, signed: true },
  ];

  const fromStamp = opts.from ? fmtDateDDMMYYYY(opts.from) : 'inception';
  const toStamp = opts.to ? fmtDateDDMMYYYY(opts.to) : todayDDMMYYYY();

  return {
    reportTitle: `Scriptwise - Qtywise Report As ${fromStamp} To ${toStamp} (Equity)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Sr No', spanCols: 1 },
      { label: 'Name of the Company', spanCols: 1 },
      { label: 'Opening', spanCols: 3 },
      { label: 'Purchase', spanCols: 3 },
      { label: 'Sale', spanCols: 3 },
      { label: 'Net Position', spanCols: 2 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'Grand Total',
      values: {
        openQty: grand.openQty.toString(),
        openAmount: grand.openAmt.toString(),
        buyQty: grand.buyQty.toString(),
        buyAmount: grand.buyAmt.toString(),
        sellQty: grand.sellQty.toString(),
        sellAmount: grand.sellAmt.toString(),
        netQty: grand.netQty.toString(),
        netAmount: grand.netAmt.toString(),
      },
    },
    filenameStem: `scriptwise-qtywise${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 20. Contract Note Charges Report ─────────────────────────────
//
// Broker-wise rollup of contract-note expenses pulled from the
// Transaction table (brokerage, STT, CGST + SGST / IGST split via the
// `gst` field, SEBI, stamp duty, exchange/transaction charges, other).
// CGST + SGST split: the schema stores total `gst`; we present the
// total as a single SGST column when an interstate marker exists, or
// split 50/50 between CGST and SGST otherwise — matches mProfit's
// convention.

export async function buildContractNoteChargesLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      tradeDate: { lte: cutoff },
    },
    orderBy: [{ broker: 'asc' }, { tradeDate: 'asc' }],
  });

  type Tot = {
    brokerage: Decimal;
    cgst: Decimal;
    sebi: Decimal;
    stt: Decimal;
    sgst: Decimal;
    sgstRate: Decimal;
    stamp: Decimal;
    txn: Decimal;
    total: Decimal;
    totalNoBrk: Decimal;
  };
  const zero = (): Tot => ({
    brokerage: new Decimal(0), cgst: new Decimal(0), sebi: new Decimal(0),
    stt: new Decimal(0), sgst: new Decimal(0), sgstRate: new Decimal(0),
    stamp: new Decimal(0), txn: new Decimal(0),
    total: new Decimal(0), totalNoBrk: new Decimal(0),
  });
  const accum = (t: Tot, tx: typeof txs[number]): void => {
    const brk = new Decimal(tx.brokerage.toString());
    // Split GST 50/50 between CGST and SGST. mProfit's portal shows the
    // CGST column populated when the broker invoiced intra-state, blank
    // otherwise. Without an interstate marker on the row we split.
    const gst = new Decimal(tx.gst.toString()).dividedBy(2);
    const stt = new Decimal(tx.stt.toString());
    const sebi = new Decimal(tx.sebiCharges.toString());
    const stamp = new Decimal(tx.stampDuty.toString());
    const txn = new Decimal(tx.exchangeCharges.toString());
    const other = new Decimal(tx.otherCharges.toString());
    const total = brk.plus(gst).plus(gst).plus(stt).plus(sebi).plus(stamp).plus(txn).plus(other);
    t.brokerage = t.brokerage.plus(brk);
    t.cgst = t.cgst.plus(gst);
    t.sebi = t.sebi.plus(sebi);
    t.stt = t.stt.plus(stt);
    t.sgst = t.sgst.plus(gst);
    t.stamp = t.stamp.plus(stamp);
    t.txn = t.txn.plus(txn).plus(other);
    t.total = t.total.plus(total);
    t.totalNoBrk = t.totalNoBrk.plus(total).minus(brk);
  };

  const byBroker = new Map<string, Tot>();
  for (const tx of txs) {
    const b = tx.broker ?? 'SELF-BROKER A/C';
    let t = byBroker.get(b);
    if (!t) {
      t = zero();
      byBroker.set(b, t);
    }
    accum(t, tx);
  }

  const rows = Array.from(byBroker.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([broker, t]) => ({
      cells: {
        broker,
        brokerage: t.brokerage.toString(),
        cgst: t.cgst.toString(),
        sebi: t.sebi.toString(),
        stt: t.stt.toString(),
        sgst: t.sgst.toString(),
        sgstRate: '',  // rate not stored per row; shown only when known
        stamp: t.stamp.toString(),
        txn: t.txn.toString(),
        total: t.total.toString(),
        totalNoBrk: t.totalNoBrk.toString(),
      },
    }));

  const grand = zero();
  for (const t of byBroker.values()) {
    grand.brokerage = grand.brokerage.plus(t.brokerage);
    grand.cgst = grand.cgst.plus(t.cgst);
    grand.sebi = grand.sebi.plus(t.sebi);
    grand.stt = grand.stt.plus(t.stt);
    grand.sgst = grand.sgst.plus(t.sgst);
    grand.stamp = grand.stamp.plus(t.stamp);
    grand.txn = grand.txn.plus(t.txn);
    grand.total = grand.total.plus(t.total);
    grand.totalNoBrk = grand.totalNoBrk.plus(t.totalNoBrk);
  }

  const columns: ColumnDef[] = [
    { key: 'broker', label: 'Broker Name', width: 16, align: 'left' },
    { key: 'brokerage', label: 'Brokerage Amount', width: 9, align: 'right', formatter: MONEY },
    { key: 'cgst', label: 'CGST', width: 7, align: 'right', formatter: MONEY },
    { key: 'sebi', label: 'SEBI TURNOVER FEES', width: 8, align: 'right', formatter: MONEY },
    { key: 'stt', label: 'SECURITY TRANSACTION TAX', width: 10, align: 'right', formatter: MONEY },
    { key: 'sgst', label: 'SGST', width: 7, align: 'right', formatter: MONEY },
    { key: 'sgstRate', label: 'SGST/UTGST RATE (9%)', width: 9, align: 'right' },
    { key: 'stamp', label: 'STAMP DUTY', width: 8, align: 'right', formatter: MONEY },
    { key: 'txn', label: 'TRANSACTION CHARGES', width: 9, align: 'right', formatter: MONEY },
    { key: 'total', label: 'Total Expenses', width: 9, align: 'right', formatter: MONEY },
    { key: 'totalNoBrk', label: 'Total Expenses Without Brokerage', width: 10, align: 'right', formatter: MONEY },
  ];

  return {
    reportTitle: `Brokerage Statement & Other Charges As On ${fmtDateDDMMYYYY(cutoff)} (Equity)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    grandTotal: {
      label: 'Grand Total',
      values: {
        brokerage: grand.brokerage.toString(),
        cgst: grand.cgst.toString(),
        sebi: grand.sebi.toString(),
        stt: grand.stt.toString(),
        sgst: grand.sgst.toString(),
        stamp: grand.stamp.toString(),
        txn: grand.txn.toString(),
        total: grand.total.toString(),
        totalNoBrk: grand.totalNoBrk.toString(),
      },
    },
    filenameStem: `contract-note-charges-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── 21. M2M Mutual Funds Report ──────────────────────────────────
//
// Per residual MF lot: closing date, qty, avg rate (effective price),
// purchase value, current MF Bhav NAV, MF valuation, unrealised G/L,
// holding days, Actual / Monthly / Annual ROI, CAGR. Subtotal per
// scheme, no grand total (mProfit's MF M2M doesn't carry one).

export async function buildMfM2MLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      assetClass: 'MUTUAL_FUND',
      tradeDate: { lte: cutoff },
    },
    orderBy: { tradeDate: 'asc' },
  });
  const lots = residualLots(
    txs.map((t) => {
      const q = new Decimal(t.quantity.toString());
      const net = new Decimal(t.netAmount.toString());
      const eff = q.isZero() ? new Decimal(t.price.toString()) : net.dividedBy(q);
      return {
        tradeDate: t.tradeDate,
        quantity: q,
        price: eff,
        assetKey: t.assetKey ?? `name:${t.assetName ?? ''}`,
        assetName: t.assetName,
        isin: t.isin,
        transactionType: t.transactionType,
      };
    }),
  );

  // Latest NAV per fundId.
  const fundIds = Array.from(new Set(
    lots.filter((l) => l.assetKey.startsWith('fund:')).map((l) => l.assetKey.slice(5)),
  ));
  const navByFund = new Map<string, Decimal>();
  if (fundIds.length > 0) {
    const navs = await prisma.mFNav.findMany({
      where: { fundId: { in: fundIds }, date: { lte: cutoff } },
      orderBy: { date: 'desc' },
    });
    for (const n of navs) {
      if (!navByFund.has(n.fundId)) {
        navByFund.set(n.fundId, new Decimal(n.nav.toString()));
      }
    }
  }
  const navFor = (key: string): Decimal | null => {
    if (key.startsWith('fund:')) return navByFund.get(key.slice(5)) ?? null;
    return null;
  };

  const byScheme = new Map<string, typeof lots>();
  for (const l of lots) {
    const arr = byScheme.get(l.scriptName) ?? [];
    arr.push(l);
    byScheme.set(l.scriptName, arr);
  }

  const groups: SubGroup[] = Array.from(byScheme.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([scheme, list]) => {
      const tot = { qty: new Decimal(0), purVal: new Decimal(0), valuation: new Decimal(0), gl: new Decimal(0) };
      const rows = list.map((l) => {
        const nav = navFor(l.assetKey);
        const purValue = l.qty.times(l.rate);
        const valuation = nav ? l.qty.times(nav) : null;
        const gl = valuation ? valuation.minus(purValue) : null;
        const days = Math.round((cutoff.getTime() - l.date.getTime()) / 86_400_000);
        const actualRoi = gl && !purValue.isZero() ? gl.dividedBy(purValue).times(100) : null;
        const monthlyRoi = actualRoi && days > 0 ? actualRoi.times(30).dividedBy(days) : null;
        const annualRoi = actualRoi && days > 0 ? actualRoi.times(365).dividedBy(days) : null;
        // CAGR: (end/start)^(1/years) - 1, only meaningful for ≥1y holds
        let cagr: Decimal | null = null;
        if (valuation && !purValue.isZero() && days >= 365) {
          const years = days / 365.25;
          const ratio = valuation.dividedBy(purValue).toNumber();
          if (ratio > 0) cagr = new Decimal((Math.pow(ratio, 1 / years) - 1) * 100);
        }
        tot.qty = tot.qty.plus(l.qty);
        tot.purVal = tot.purVal.plus(purValue);
        if (valuation) tot.valuation = tot.valuation.plus(valuation);
        if (gl) tot.gl = tot.gl.plus(gl);
        return {
          cells: {
            scheme: l.scriptName,
            closingDate: l.date.toISOString().slice(0, 10),
            qty: l.qty.toString(),
            avgRate: l.rate.toString(),
            purValue: purValue.toString(),
            navRate: nav ? nav.toString() : '',
            valuation: valuation ? valuation.toString() : '',
            unrealisedGL: gl ? gl.toString() : '',
            days: String(days),
            actualRoi: actualRoi ? actualRoi.toFixed(2) : '',
            monthlyRoi: monthlyRoi ? monthlyRoi.toFixed(2) : '',
            annualRoi: annualRoi ? annualRoi.toFixed(2) : '',
            cagr: cagr ? cagr.toFixed(2) : '',
          },
        };
      });
      return {
        rows,
        subtotal: {
          label: `Total: ${scheme}`,
          values: {
            qty: tot.qty.toString(),
            purValue: tot.purVal.toString(),
            valuation: tot.valuation.toString(),
            unrealisedGL: tot.gl.toString(),
          },
        },
      };
    });

  const columns: ColumnDef[] = [
    { key: 'scheme', label: 'Script Name', width: 22, align: 'left' },
    { key: 'closingDate', label: 'Closing Date', width: 7, align: 'center', formatter: DATE },
    { key: 'qty', label: 'Qty', width: 7, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'avgRate', label: 'Avg Rate', width: 7, align: 'right', formatter: MONEY },
    { key: 'purValue', label: 'Pur Value', width: 9, align: 'right', formatter: MONEY },
    { key: 'navRate', label: 'MF Bhav Rate', width: 8, align: 'right', formatter: MONEY },
    { key: 'valuation', label: 'MF Valuation', width: 9, align: 'right', formatter: MONEY },
    { key: 'unrealisedGL', label: 'MF Unrealised G/L', width: 9, align: 'right', formatter: MONEY, signed: true },
    { key: 'days', label: 'No Of Days', width: 5, align: 'right' },
    { key: 'actualRoi', label: 'Actual ROI %', width: 6, align: 'right' },
    { key: 'monthlyRoi', label: 'Monthly ROI %', width: 6, align: 'right' },
    { key: 'annualRoi', label: 'Annual ROI %', width: 6, align: 'right' },
    { key: 'cagr', label: 'CAGR', width: 5, align: 'right' },
  ];

  return {
    reportTitle: `M2M (NSE) report as on ${fmtDateDDMMYYYY(cutoff)} (Mutual Fund)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Closing Date', spanCols: 1 },
      { label: 'Average', spanCols: 3 },
      { label: 'MF Bhav Rate', spanCols: 1 },
      { label: 'MF Valuation', spanCols: 1 },
      { label: 'MF Unrealised G/L', spanCols: 1 },
      { label: 'UN-Realised ROI', spanCols: 4 },
      { label: 'CAGR', spanCols: 1 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups }],
    filenameStem: `mf-m2m-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── 22. Financial Ledger ─────────────────────────────────────────
//
// Account-by-account ledger with extra Investment Type / Bill-Voucher
// / Cheque columns. Reads VoucherEntry + Transaction. One section per
// account (sky-blue banner), opening row, transaction rows, total row.

export async function buildFinancialLedgerLayout(
  userId: string,
  opts: { from?: string; to?: string; accountId?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const fromDate = opts.from ? new Date(opts.from) : null;
  const toDate = opts.to ? new Date(opts.to) : new Date();

  const accountsWhere: Record<string, unknown> = { userId };
  if (opts.accountId) accountsWhere['id'] = opts.accountId;
  const accounts = await prisma.account.findMany({
    where: accountsWhere,
    orderBy: { name: 'asc' },
  });

  const sections: ReportSection[] = [];
  for (const a of accounts) {
    // VoucherEntry stores debit + credit account on the same row;
    // map presence-on-debit-side → debit amount, presence-on-credit-side
    // → credit amount.
    const entries = await prisma.voucherEntry.findMany({
      where: {
        OR: [{ debitAccountId: a.id }, { creditAccountId: a.id }],
        voucher: {
          userId,
          ...(fromDate || toDate ? {
            date: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          } : {}),
        },
      },
      include: { voucher: true },
      orderBy: { voucher: { date: 'asc' } },
    });
    if (entries.length === 0) continue;

    let opening = new Decimal(0);
    if (fromDate) {
      const priorEntries = await prisma.voucherEntry.findMany({
        where: {
          OR: [{ debitAccountId: a.id }, { creditAccountId: a.id }],
          voucher: { userId, date: { lt: fromDate } },
        },
      });
      for (const e of priorEntries) {
        const amt = new Decimal(e.amount.toString());
        if (e.debitAccountId === a.id) opening = opening.plus(amt);
        else opening = opening.minus(amt);
      }
    }

    let running = opening;
    const rows: BodyRowLite[] = [{
      cells: {
        investmentType: '',
        billNo: '',
        date: '',
        cheque: '',
        narration: 'Opening...',
        debit: opening.greaterThan(0) ? opening.toString() : '',
        credit: opening.lessThan(0) ? opening.abs().toString() : '',
        balance: opening.abs().toString(),
        drCr: opening.greaterThanOrEqualTo(0) ? 'Dr.' : 'Cr.',
      },
    }];
    for (const e of entries) {
      const amt = new Decimal(e.amount.toString());
      const isDebit = e.debitAccountId === a.id;
      const debit = isDebit ? amt : new Decimal(0);
      const credit = isDebit ? new Decimal(0) : amt;
      running = running.plus(debit).minus(credit);
      rows.push({
        cells: {
          investmentType: e.voucher.type ?? '',
          billNo: e.voucher.voucherNo,
          date: e.voucher.date.toISOString().slice(0, 10),
          cheque: '',
          narration: e.narration ?? e.voucher.narration ?? '',
          debit: debit.greaterThan(0) ? debit.toString() : '',
          credit: credit.greaterThan(0) ? credit.toString() : '',
          balance: running.abs().toString(),
          drCr: running.greaterThanOrEqualTo(0) ? 'Dr.' : 'Cr.',
        },
      });
    }
    sections.push({ banner: a.name, groups: [{ rows }] });
  }

  const columns: ColumnDef[] = [
    { key: 'investmentType', label: 'Investment Type', width: 8, align: 'left' },
    { key: 'billNo', label: 'Bill / Vocher', width: 7, align: 'left' },
    { key: 'date', label: 'Date', width: 7, align: 'center', formatter: DATE },
    { key: 'cheque', label: 'Cheque', width: 5, align: 'center' },
    { key: 'narration', label: 'Narration', width: 28, align: 'left' },
    { key: 'debit', label: 'Debit', width: 10, align: 'right', formatter: MONEY },
    { key: 'credit', label: 'Credit', width: 10, align: 'right', formatter: MONEY },
    { key: 'balance', label: 'Balance', width: 10, align: 'right', formatter: MONEY },
    { key: 'drCr', label: '', width: 3, align: 'center' },
  ];

  return {
    reportTitle: `Account Ledger From ${opts.from ? fmtDateDDMMYYYY(opts.from) : '—'} To ${opts.to ? fmtDateDDMMYYYY(opts.to) : todayDDMMYYYY()}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    filenameStem: `financial-ledger${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 23. Closing Balance Report ───────────────────────────────────
//
// As-of holdings, segmented by asset class. Shows asset name, first
// acquisition date, qty, weighted-avg pur price, total invested,
// current price + value, ISIN. Grand total at the foot.

export async function buildClosingBalanceLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();

  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    orderBy: [{ assetClass: 'asc' }, { assetName: 'asc' }],
  });

  // First-acquisition date per asset = earliest BUY txn for that asset.
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      tradeDate: { lte: cutoff },
    },
    select: { assetKey: true, assetName: true, tradeDate: true, transactionType: true },
    orderBy: { tradeDate: 'asc' },
  });
  const firstDate = new Map<string, Date>();
  for (const t of txs) {
    if (!BUY_TXN_TYPES.has(t.transactionType)) continue;
    const k = t.assetKey ?? `name:${t.assetName ?? ''}`;
    if (!firstDate.has(k)) firstDate.set(k, t.tradeDate);
  }

  const byClass = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const arr = byClass.get(h.assetClass) ?? [];
    arr.push(h);
    byClass.set(h.assetClass, arr);
  }

  // Each asset class becomes its OWN report — but the mProfit layout
  // splits into separate windows. We compress into sections with
  // banners (Equity / Mutual Fund / F & O).
  const sections: ReportSection[] = [];
  let grandQty = new Decimal(0);
  let grandInvested = new Decimal(0);
  let grandValue = new Decimal(0);
  for (const [assetClass, list] of byClass) {
    const tot = list.reduce(
      (acc, h) => ({
        qty: acc.qty.plus(new Decimal(h.quantity.toString())),
        invested: acc.invested.plus(new Decimal(h.totalCost.toString())),
        value: acc.value.plus(h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(h.totalCost.toString())),
      }),
      { qty: new Decimal(0), invested: new Decimal(0), value: new Decimal(0) },
    );
    grandQty = grandQty.plus(tot.qty);
    grandInvested = grandInvested.plus(tot.invested);
    grandValue = grandValue.plus(tot.value);
    sections.push({
      banner: `${assetClass.replace(/_/g, ' ')} — Closing Balance As On ${fmtDateDDMMYYYY(cutoff)}`,
      groups: [{
        rows: list.map((h) => {
          const k = h.assetKey;
          const acqDate = firstDate.get(k);
          return {
            cells: {
              assetName: h.assetName ?? '—',
              acqDate: acqDate ? acqDate.toISOString().slice(0, 10) : '',
              qty: h.quantity.toString(),
              purPrice: h.avgCostPrice.toString(),
              invested: h.totalCost.toString(),
              currPrice: h.currentPrice?.toString() ?? '',
              currValue: h.currentValue?.toString() ?? '',
              isin: h.isin ?? '',
            },
          };
        }),
        subtotal: {
          label: `Total: ${assetClass.replace(/_/g, ' ')}`,
          values: {
            qty: tot.qty.toString(),
            invested: tot.invested.toString(),
            currValue: tot.value.toString(),
          },
        },
      }],
    });
  }

  const columns: ColumnDef[] = [
    { key: 'assetName', label: 'Asset Name', width: 22, align: 'left' },
    { key: 'acqDate', label: 'Date of Acquisition', width: 8, align: 'center', formatter: DATE },
    { key: 'qty', label: 'Quantity', width: 7, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'purPrice', label: 'Pur. Price', width: 7, align: 'right', formatter: MONEY },
    { key: 'invested', label: 'Amount Invested', width: 9, align: 'right', formatter: MONEY },
    { key: 'currPrice', label: 'Curr. Price', width: 7, align: 'right', formatter: (v) => v ? MONEY(v) : '—' },
    { key: 'currValue', label: 'Curr. Value', width: 9, align: 'right', formatter: MONEY },
    { key: 'isin', label: 'ISIN No', width: 9, align: 'left' },
  ];

  return {
    reportTitle: `Closing Balance Report As On ${fmtDateDDMMYYYY(cutoff)}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: {
        qty: grandQty.toString(),
        invested: grandInvested.toString(),
        currValue: grandValue.toString(),
      },
    },
    filenameStem: `closing-balance-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── 24. Top Holdings Report ──────────────────────────────────────
//
// Top 5 per asset class by amount invested. Layout: section banner =
// asset class, top 5 rows, "Grand Total For Top 5 X Positions" row.
// % weightage = invested / (sum of invested in that class).

export async function buildTopHoldingsLayout(userId: string): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
  });

  const byClass = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const arr = byClass.get(h.assetClass) ?? [];
    arr.push(h);
    byClass.set(h.assetClass, arr);
  }

  const sections: ReportSection[] = [];
  for (const [assetClass, list] of byClass) {
    const sorted = [...list].sort((a, b) =>
      new Decimal(b.totalCost.toString()).comparedTo(new Decimal(a.totalCost.toString())),
    );
    const top5 = sorted.slice(0, 5);
    const totalInClass = list.reduce(
      (s, h) => s.plus(new Decimal(h.totalCost.toString())),
      new Decimal(0),
    );
    const tot = top5.reduce(
      (acc, h) => ({
        qty: acc.qty.plus(new Decimal(h.quantity.toString())),
        invested: acc.invested.plus(new Decimal(h.totalCost.toString())),
        bseValue: acc.bseValue.plus(h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0)),
        nseValue: acc.nseValue.plus(h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0)),
      }),
      { qty: new Decimal(0), invested: new Decimal(0), bseValue: new Decimal(0), nseValue: new Decimal(0) },
    );
    const label = assetClass === 'EQUITY' || assetClass === 'ETF'
      ? 'Stocks'
      : assetClass === 'MUTUAL_FUND'
        ? 'Mutual Funds'
        : assetClass === 'FUTURES' || assetClass === 'OPTIONS'
          ? 'Derivatives'
          : assetClass === 'COMMODITY' ? 'MCX' : assetClass;
    sections.push({
      banner: label,
      groups: [{
        rows: top5.map((h) => {
          const invested = new Decimal(h.totalCost.toString());
          const weight = totalInClass.greaterThan(0) ? invested.dividedBy(totalInClass).times(100) : new Decimal(0);
          const currValue = h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0);
          return {
            cells: {
              scriptName: h.assetName ?? '—',
              qty: h.quantity.toString(),
              invested: invested.toString(),
              weight: weight.toFixed(2) + '%',
              bseValue: currValue.toString(),
              nseValue: currValue.toString(),
            },
          };
        }),
        subtotal: {
          label: `Grand Total For Top 5 ${label} Positions`,
          values: {
            qty: tot.qty.toString(),
            invested: tot.invested.toString(),
            bseValue: tot.bseValue.toString(),
            nseValue: tot.nseValue.toString(),
          },
        },
      }],
    });
  }

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 28, align: 'left' },
    { key: 'qty', label: 'Quantity / Units', width: 9, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'invested', label: 'Amount invested', width: 11, align: 'right', formatter: MONEY },
    { key: 'weight', label: '% weightage', width: 7, align: 'right' },
    { key: 'bseValue', label: 'BSE current value', width: 11, align: 'right', formatter: MONEY },
    { key: 'nseValue', label: 'NSE current value', width: 11, align: 'right', formatter: MONEY },
  ];

  return {
    reportTitle: `Top Holdings Report`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    filenameStem: `top-holdings-${todayDDMMYYYY()}`,
  };
}

// ─── 25. Sector Wise Allocation ───────────────────────────────────
//
// Two-mode: sector-only rollup OR sector → script drill-down.
// `mode=sector` (default) lists each sector once with totals; mode=script
// groups scripts under their sector banner with per-sector subtotals.

export async function buildSectorWiseAllocationLayout(
  userId: string,
  mode: 'sector' | 'script' = 'sector',
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId }, assetClass: { in: ['EQUITY', 'ETF'] } },
  });

  // Sector lookup via StockMaster — HoldingProjection has no stock
  // relation but stores stockId.
  const stockIds = holdings.map((h) => h.stockId).filter((id): id is string => !!id);
  const sectorById = new Map<string, string>();
  if (stockIds.length > 0) {
    const stocks = await prisma.stockMaster.findMany({
      where: { id: { in: stockIds } },
      select: { id: true, sector: true },
    });
    for (const s of stocks) {
      if (s.sector) sectorById.set(s.id, s.sector);
    }
  }

  const totalInvested = holdings.reduce(
    (s, h) => s.plus(new Decimal(h.totalCost.toString())),
    new Decimal(0),
  );
  const sectorOf = (h: typeof holdings[number]): string =>
    (h.stockId && sectorById.get(h.stockId)) ?? 'UNCLASSIFIED';

  if (mode === 'sector') {
    const bySector = new Map<string, { qty: Decimal; invested: Decimal; bseValue: Decimal; nseValue: Decimal }>();
    for (const h of holdings) {
      const s = sectorOf(h).toUpperCase();
      const rec = bySector.get(s) ?? { qty: new Decimal(0), invested: new Decimal(0), bseValue: new Decimal(0), nseValue: new Decimal(0) };
      rec.qty = rec.qty.plus(new Decimal(h.quantity.toString()));
      rec.invested = rec.invested.plus(new Decimal(h.totalCost.toString()));
      const v = h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0);
      rec.bseValue = rec.bseValue.plus(v);
      rec.nseValue = rec.nseValue.plus(v);
      bySector.set(s, rec);
    }
    const rows = Array.from(bySector.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([sector, rec]) => ({
        cells: {
          sectorName: sector,
          qty: rec.qty.toString(),
          invested: rec.invested.toString(),
          weight: (totalInvested.greaterThan(0)
            ? rec.invested.dividedBy(totalInvested).times(100).toFixed(2)
            : '0.00') + '%',
          bseValue: rec.bseValue.toString(),
          nseValue: rec.nseValue.toString(),
        },
      }));
    const columns: ColumnDef[] = [
      { key: 'sectorName', label: 'Sector Name', width: 28, align: 'left' },
      { key: 'qty', label: 'Quantity / Units', width: 9, align: 'right', formatter: (v) => indianMoney(v, 4) },
      { key: 'invested', label: 'Amount Invested', width: 11, align: 'right', formatter: MONEY },
      { key: 'weight', label: '% weightage', width: 7, align: 'right' },
      { key: 'bseValue', label: 'BSE current value', width: 11, align: 'right', formatter: MONEY },
      { key: 'nseValue', label: 'NSE current value', width: 11, align: 'right', formatter: MONEY },
    ];
    return {
      reportTitle: `Sector Wise Allocation`,
      family: m.family,
      member: m.member,
      pan: m.pan,
      headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
      headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
      columns,
      sections: [{ groups: [{ rows }] }],
      filenameStem: `sector-allocation-${todayDDMMYYYY()}`,
    };
  }

  // mode === 'script'
  const bySector = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const s = sectorOf(h).toUpperCase();
    const arr = bySector.get(s) ?? [];
    arr.push(h);
    bySector.set(s, arr);
  }
  const sections: ReportSection[] = Array.from(bySector.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sector, list]) => {
      const tot = list.reduce(
        (acc, h) => ({
          qty: acc.qty.plus(new Decimal(h.quantity.toString())),
          invested: acc.invested.plus(new Decimal(h.totalCost.toString())),
          bseValue: acc.bseValue.plus(h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0)),
          nseValue: acc.nseValue.plus(h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0)),
        }),
        { qty: new Decimal(0), invested: new Decimal(0), bseValue: new Decimal(0), nseValue: new Decimal(0) },
      );
      return {
        banner: sector,
        groups: [{
          rows: list.map((h) => {
            const invested = new Decimal(h.totalCost.toString());
            const weight = totalInvested.greaterThan(0)
              ? invested.dividedBy(totalInvested).times(100).toFixed(2)
              : '0.00';
            const v = h.currentValue != null ? new Decimal(h.currentValue.toString()) : new Decimal(0);
            return {
              cells: {
                scriptName: h.assetName ?? '—',
                qty: h.quantity.toString(),
                invested: invested.toString(),
                weight: weight + '%',
                bseValue: v.toString(),
                nseValue: v.toString(),
              },
            };
          }),
          subtotal: {
            label: `Grand Total ${sector}`,
            values: {
              qty: tot.qty.toString(),
              invested: tot.invested.toString(),
              bseValue: tot.bseValue.toString(),
              nseValue: tot.nseValue.toString(),
            },
          },
        }],
      };
    });
  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 28, align: 'left' },
    { key: 'qty', label: 'Quantity / Units', width: 9, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'invested', label: 'Amount invested', width: 11, align: 'right', formatter: MONEY },
    { key: 'weight', label: '% weightage', width: 7, align: 'right' },
    { key: 'bseValue', label: 'BSE current value', width: 11, align: 'right', formatter: MONEY },
    { key: 'nseValue', label: 'NSE current value', width: 11, align: 'right', formatter: MONEY },
  ];
  return {
    reportTitle: `Sector Wise Allocation (Script Drill-down)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    filenameStem: `sector-allocation-script-${todayDDMMYYYY()}`,
  };
}

// ─── 26. Contract Notes Summary Report ────────────────────────────
//
// One row per contract note (Transaction.orderNo + broker). Payable
// if user bought (net out-flow), Receivable if sold (net in-flow).

export async function buildContractNotesSummaryLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      tradeDate: { lte: cutoff },
      orderNo: { not: null },
    },
    orderBy: { tradeDate: 'desc' },
  });

  const byNote = new Map<string, { broker: string; date: Date; orderNo: string; total: Decimal; isBuy: boolean }>();
  for (const t of txs) {
    const key = `${t.broker ?? 'SELF-BROKER A/C'}::${t.orderNo}`;
    let rec = byNote.get(key);
    if (!rec) {
      rec = {
        broker: t.broker ?? 'SELF-BROKER A/C',
        date: t.tradeDate,
        orderNo: t.orderNo!,
        total: new Decimal(0),
        isBuy: BUY_TXN_TYPES.has(t.transactionType),
      };
      byNote.set(key, rec);
    }
    rec.total = rec.total.plus(new Decimal(t.netAmount.toString()));
  }

  const rows: BodyRowLite[] = Array.from(byNote.values())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((rec) => ({
      cells: {
        date: rec.date.toISOString().slice(0, 10),
        broker: rec.broker,
        contractNoteNo: rec.orderNo,
        type: rec.isBuy ? 'Payable' : 'Receivable',
        amount: rec.total.abs().toString(),
      },
    }));

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date', width: 9, align: 'center', formatter: DATE },
    { key: 'broker', label: 'Broker Name', width: 28, align: 'left' },
    { key: 'contractNoteNo', label: 'Contract Note No', width: 16, align: 'left' },
    { key: 'type', label: 'Payable/Receivable', width: 12, align: 'left' },
    { key: 'amount', label: 'Amount', width: 12, align: 'right', formatter: MONEY },
  ];

  return {
    reportTitle: `Contract Notes Summary Report As On ${fmtDateDDMMYYYY(cutoff)} (Equity)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{ groups: [{ rows }] }],
    filenameStem: `contract-notes-summary-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── Helpers for capital-gain summary reports (27, 28, 30, 31) ────

// Cut-off for the 22-July-2024 LTCG rate change (Budget 2024). Sells
// up to and including 22-Jul-2024 use the old 10% / 20% schedule;
// 23-Jul-2024 onwards uses the new 12.5% schedule. Several reports
// split the column accordingly.
const LTCG_RATE_CHANGE_CUTOFF = new Date('2024-07-22T23:59:59.999Z');

type ScriptBucket = {
  assetName: string;
  isin: string | null;
  openQty: Decimal;
  openValue: Decimal;
  buyQty: Decimal;
  buyValue: Decimal;
  sellQty: Decimal;
  sellValue: Decimal;
  closingQty: Decimal;
  closingValue: Decimal;
  capitalGL: Decimal;
  shortTerm: Decimal;
  longTerm: Decimal;
  speculation: Decimal;
  speculationGain: Decimal;
  speculationLoss: Decimal;
  shortTermUpto22Jul: Decimal;
  longTermUpto22Jul: Decimal;
  shortTermOnward23Jul: Decimal;
  longTermOnward23Jul: Decimal;
};

function emptyBucket(name: string, isin: string | null): ScriptBucket {
  return {
    assetName: name,
    isin,
    openQty: new Decimal(0), openValue: new Decimal(0),
    buyQty: new Decimal(0), buyValue: new Decimal(0),
    sellQty: new Decimal(0), sellValue: new Decimal(0),
    closingQty: new Decimal(0), closingValue: new Decimal(0),
    capitalGL: new Decimal(0),
    shortTerm: new Decimal(0), longTerm: new Decimal(0),
    speculation: new Decimal(0),
    speculationGain: new Decimal(0), speculationLoss: new Decimal(0),
    shortTermUpto22Jul: new Decimal(0), longTermUpto22Jul: new Decimal(0),
    shortTermOnward23Jul: new Decimal(0), longTermOnward23Jul: new Decimal(0),
  };
}

// ─── 27. Brokerwise Capital Gain/Loss ─────────────────────────────

export async function buildBrokerwiseCapitalGainLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const fromDate = opts.from ? new Date(opts.from) : null;
  const toDate = opts.to ? new Date(opts.to) : new Date();

  // Realised gains per (broker, asset) — pull from CapitalGain rows,
  // join broker via sellTransaction.
  const { rows: cgRows } = await computeUserCapitalGains(userId);
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      tradeDate: { lte: toDate },
    },
    orderBy: { tradeDate: 'asc' },
  });
  const txById = new Map(txs.map((t) => [t.id, t]));

  // Bucket by (broker, scriptName).
  const buckets = new Map<string, Map<string, ScriptBucket>>();
  const getBucket = (broker: string, name: string, isin: string | null): ScriptBucket => {
    let inner = buckets.get(broker);
    if (!inner) {
      inner = new Map();
      buckets.set(broker, inner);
    }
    let b = inner.get(name);
    if (!b) {
      b = emptyBucket(name, isin);
      inner.set(name, b);
    }
    return b;
  };

  // Walk txs to fill opening / purchase / sale columns + closing qty.
  for (const t of txs) {
    const broker = t.broker ?? 'SELF-BROKER A/C';
    const b = getBucket(broker, t.assetName ?? '—', t.isin);
    const inWindow = !fromDate || t.tradeDate.getTime() >= fromDate.getTime();
    const q = new Decimal(t.quantity.toString());
    const net = new Decimal(t.netAmount.toString());
    if (BUY_TXN_TYPES.has(t.transactionType)) {
      if (!inWindow) {
        b.openQty = b.openQty.plus(q);
        b.openValue = b.openValue.plus(net);
      } else {
        b.buyQty = b.buyQty.plus(q);
        b.buyValue = b.buyValue.plus(net);
      }
      b.closingQty = b.closingQty.plus(q);
      b.closingValue = b.closingValue.plus(net);
    } else if (SELL_TXN_TYPES.has(t.transactionType)) {
      if (inWindow) {
        b.sellQty = b.sellQty.plus(q);
        b.sellValue = b.sellValue.plus(net);
      }
      const avg = b.closingQty.isZero() ? new Decimal(0) : b.closingValue.dividedBy(b.closingQty);
      b.closingQty = b.closingQty.minus(q);
      b.closingValue = b.closingValue.minus(avg.times(q));
    }
  }

  // Apply CG rows for ST/LT/Speculation split + 22-July cutoff.
  for (const r of cgRows) {
    if (fromDate && r.sellDate.getTime() < fromDate.getTime()) continue;
    if (r.sellDate.getTime() > toDate.getTime()) continue;
    const sellTx = txById.get(r.sellTransactionId);
    const broker = sellTx?.broker ?? 'SELF-BROKER A/C';
    const b = getBucket(broker, r.assetName, r.isin);
    b.capitalGL = b.capitalGL.plus(r.gainLoss);
    if (r.capitalGainType === 'INTRADAY') {
      b.speculation = b.speculation.plus(r.gainLoss);
      if (r.gainLoss.greaterThanOrEqualTo(0)) {
        b.speculationGain = b.speculationGain.plus(r.gainLoss);
      } else {
        b.speculationLoss = b.speculationLoss.plus(r.gainLoss.abs());
      }
    } else if (r.capitalGainType === 'SHORT_TERM') {
      b.shortTerm = b.shortTerm.plus(r.gainLoss);
      if (r.sellDate.getTime() <= LTCG_RATE_CHANGE_CUTOFF.getTime()) {
        b.shortTermUpto22Jul = b.shortTermUpto22Jul.plus(r.gainLoss);
      } else {
        b.shortTermOnward23Jul = b.shortTermOnward23Jul.plus(r.gainLoss);
      }
    } else if (r.capitalGainType === 'LONG_TERM') {
      b.longTerm = b.longTerm.plus(r.gainLoss);
      if (r.sellDate.getTime() <= LTCG_RATE_CHANGE_CUTOFF.getTime()) {
        b.longTermUpto22Jul = b.longTermUpto22Jul.plus(r.gainLoss);
      } else {
        b.longTermOnward23Jul = b.longTermOnward23Jul.plus(r.gainLoss);
      }
    }
  }

  const sections: ReportSection[] = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([broker, byName]) => {
      const list = Array.from(byName.values()).sort((a, b) => a.assetName.localeCompare(b.assetName));
      const tot = list.reduce((acc, b) => ({
        openQty: acc.openQty.plus(b.openQty), openValue: acc.openValue.plus(b.openValue),
        buyQty: acc.buyQty.plus(b.buyQty), buyValue: acc.buyValue.plus(b.buyValue),
        sellQty: acc.sellQty.plus(b.sellQty), sellValue: acc.sellValue.plus(b.sellValue),
        closingQty: acc.closingQty.plus(b.closingQty), closingValue: acc.closingValue.plus(b.closingValue),
        capitalGL: acc.capitalGL.plus(b.capitalGL),
        shortTerm: acc.shortTerm.plus(b.shortTerm), longTerm: acc.longTerm.plus(b.longTerm),
        speculation: acc.speculation.plus(b.speculation),
      }), {
        openQty: new Decimal(0), openValue: new Decimal(0),
        buyQty: new Decimal(0), buyValue: new Decimal(0),
        sellQty: new Decimal(0), sellValue: new Decimal(0),
        closingQty: new Decimal(0), closingValue: new Decimal(0),
        capitalGL: new Decimal(0),
        shortTerm: new Decimal(0), longTerm: new Decimal(0),
        speculation: new Decimal(0),
      });
      return {
        banner: broker,
        groups: [{
          rows: list.map((b) => ({
            cells: {
              scriptName: b.assetName,
              openQty: b.openQty.toString(),
              openRate: b.openQty.isZero() ? '' : b.openValue.dividedBy(b.openQty).toString(),
              openAmount: b.openValue.toString(),
              buyQty: b.buyQty.toString(),
              buyRate: b.buyQty.isZero() ? '' : b.buyValue.dividedBy(b.buyQty).toString(),
              buyAmount: b.buyValue.toString(),
              sellQty: b.sellQty.toString(),
              sellRate: b.sellQty.isZero() ? '' : b.sellValue.dividedBy(b.sellQty).toString(),
              sellAmount: b.sellValue.toString(),
              closingQty: b.closingQty.toString(),
              closingRate: b.closingQty.isZero() ? '' : b.closingValue.dividedBy(b.closingQty).toString(),
              closingValue: b.closingValue.toString(),
              capitalGL: b.capitalGL.toString(),
              shortTerm: b.shortTerm.toString(),
              longTerm: b.longTerm.toString(),
              speculation: b.speculation.toString(),
            },
          })),
          subtotal: {
            label: `Grand Total For ${broker}`,
            values: {
              openQty: tot.openQty.toString(),
              openAmount: tot.openValue.toString(),
              buyQty: tot.buyQty.toString(),
              buyAmount: tot.buyValue.toString(),
              sellQty: tot.sellQty.toString(),
              sellAmount: tot.sellValue.toString(),
              closingQty: tot.closingQty.toString(),
              closingValue: tot.closingValue.toString(),
              capitalGL: tot.capitalGL.toString(),
              shortTerm: tot.shortTerm.toString(),
              longTerm: tot.longTerm.toString(),
              speculation: tot.speculation.toString(),
            },
          },
        }],
      };
    });

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 18, align: 'left' },
    { key: 'openQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'openRate', label: 'Rate', width: 6, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'openAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'buyQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'buyRate', label: 'Rate', width: 6, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'buyAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'sellQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Rate', width: 6, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'sellAmount', label: 'Amount', width: 8, align: 'right', formatter: MONEY },
    { key: 'closingQty', label: 'Qty', width: 5, align: 'right', formatter: INT, signed: true },
    { key: 'closingRate', label: 'Rate', width: 6, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'closingValue', label: 'Value', width: 8, align: 'right', formatter: MONEY, signed: true },
    { key: 'capitalGL', label: 'Capital Gain/Loss', width: 9, align: 'right', formatter: MONEY, signed: true },
    { key: 'shortTerm', label: 'Short Term', width: 8, align: 'right', formatter: MONEY, signed: true },
    { key: 'longTerm', label: 'Long Term', width: 8, align: 'right', formatter: MONEY, signed: true },
    { key: 'speculation', label: 'Speculation', width: 8, align: 'right', formatter: MONEY, signed: true },
  ];

  return {
    reportTitle: `Brokerwise Capital Gain - Loss As On ${opts.from ? fmtDateDDMMYYYY(opts.from) : '—'} To ${fmtDateDDMMYYYY(toDate)} (Equity)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Opening', spanCols: 3 },
      { label: 'Purchase', spanCols: 3 },
      { label: 'Sale', spanCols: 3 },
      { label: 'Closing=Op+Pur-Sell(+/-)Capital G/L', spanCols: 3 },
      { label: 'Capital Gain/Loss', spanCols: 1 },
      { label: 'Gain/Loss', spanCols: 3 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    filenameStem: `brokerwise-capital-gain${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 28. Tax PnL Summary ──────────────────────────────────────────
//
// Same shape as Brokerwise but rolled up across all brokers.

export async function buildTaxPnLLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const fromDate = opts.from ? new Date(opts.from) : null;
  const toDate = opts.to ? new Date(opts.to) : new Date();

  const { rows: cgRows } = await computeUserCapitalGains(userId);
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId }, tradeDate: { lte: toDate } },
    orderBy: { tradeDate: 'asc' },
  });

  const byScript = new Map<string, ScriptBucket>();
  const getB = (name: string, isin: string | null): ScriptBucket => {
    let b = byScript.get(name);
    if (!b) {
      b = emptyBucket(name, isin);
      byScript.set(name, b);
    }
    return b;
  };

  for (const t of txs) {
    const b = getB(t.assetName ?? '—', t.isin);
    const inWindow = !fromDate || t.tradeDate.getTime() >= fromDate.getTime();
    const q = new Decimal(t.quantity.toString());
    const net = new Decimal(t.netAmount.toString());
    if (BUY_TXN_TYPES.has(t.transactionType)) {
      if (!inWindow) {
        b.openQty = b.openQty.plus(q);
        b.openValue = b.openValue.plus(net);
      } else {
        b.buyQty = b.buyQty.plus(q);
        b.buyValue = b.buyValue.plus(net);
      }
      b.closingQty = b.closingQty.plus(q);
      b.closingValue = b.closingValue.plus(net);
    } else if (SELL_TXN_TYPES.has(t.transactionType)) {
      if (inWindow) {
        b.sellQty = b.sellQty.plus(q);
        b.sellValue = b.sellValue.plus(net);
      }
      const avg = b.closingQty.isZero() ? new Decimal(0) : b.closingValue.dividedBy(b.closingQty);
      b.closingQty = b.closingQty.minus(q);
      b.closingValue = b.closingValue.minus(avg.times(q));
    }
  }

  for (const r of cgRows) {
    if (fromDate && r.sellDate.getTime() < fromDate.getTime()) continue;
    if (r.sellDate.getTime() > toDate.getTime()) continue;
    const b = getB(r.assetName, r.isin);
    b.capitalGL = b.capitalGL.plus(r.gainLoss);
    if (r.capitalGainType === 'INTRADAY') {
      b.speculation = b.speculation.plus(r.gainLoss);
      if (r.gainLoss.greaterThanOrEqualTo(0)) b.speculationGain = b.speculationGain.plus(r.gainLoss);
      else b.speculationLoss = b.speculationLoss.plus(r.gainLoss.abs());
    } else if (r.capitalGainType === 'SHORT_TERM') {
      b.shortTerm = b.shortTerm.plus(r.gainLoss);
      if (r.sellDate.getTime() <= LTCG_RATE_CHANGE_CUTOFF.getTime()) b.shortTermUpto22Jul = b.shortTermUpto22Jul.plus(r.gainLoss);
      else b.shortTermOnward23Jul = b.shortTermOnward23Jul.plus(r.gainLoss);
    } else if (r.capitalGainType === 'LONG_TERM') {
      b.longTerm = b.longTerm.plus(r.gainLoss);
      if (r.sellDate.getTime() <= LTCG_RATE_CHANGE_CUTOFF.getTime()) b.longTermUpto22Jul = b.longTermUpto22Jul.plus(r.gainLoss);
      else b.longTermOnward23Jul = b.longTermOnward23Jul.plus(r.gainLoss);
    }
  }

  const list = Array.from(byScript.values()).sort((a, b) => a.assetName.localeCompare(b.assetName));
  const tot = list.reduce((acc, b) => ({
    openQty: acc.openQty.plus(b.openQty), openValue: acc.openValue.plus(b.openValue),
    buyQty: acc.buyQty.plus(b.buyQty), buyValue: acc.buyValue.plus(b.buyValue),
    sellQty: acc.sellQty.plus(b.sellQty), sellValue: acc.sellValue.plus(b.sellValue),
    closingQty: acc.closingQty.plus(b.closingQty), closingValue: acc.closingValue.plus(b.closingValue),
    capitalGL: acc.capitalGL.plus(b.capitalGL),
    shortTerm: acc.shortTerm.plus(b.shortTerm),
    longTerm: acc.longTerm.plus(b.longTerm),
    speculation: acc.speculation.plus(b.speculation),
    specGain: acc.specGain.plus(b.speculationGain),
    specLoss: acc.specLoss.plus(b.speculationLoss),
    stUp: acc.stUp.plus(b.shortTermUpto22Jul),
    ltUp: acc.ltUp.plus(b.longTermUpto22Jul),
    stOn: acc.stOn.plus(b.shortTermOnward23Jul),
    ltOn: acc.ltOn.plus(b.longTermOnward23Jul),
  }), {
    openQty: new Decimal(0), openValue: new Decimal(0),
    buyQty: new Decimal(0), buyValue: new Decimal(0),
    sellQty: new Decimal(0), sellValue: new Decimal(0),
    closingQty: new Decimal(0), closingValue: new Decimal(0),
    capitalGL: new Decimal(0),
    shortTerm: new Decimal(0), longTerm: new Decimal(0),
    speculation: new Decimal(0),
    specGain: new Decimal(0), specLoss: new Decimal(0),
    stUp: new Decimal(0), ltUp: new Decimal(0),
    stOn: new Decimal(0), ltOn: new Decimal(0),
  });

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 16, align: 'left' },
    { key: 'openQty', label: 'Qty', width: 4, align: 'right', formatter: INT },
    { key: 'openRate', label: 'Rate', width: 5, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'openAmount', label: 'Amount', width: 7, align: 'right', formatter: MONEY },
    { key: 'buyQty', label: 'Qty', width: 4, align: 'right', formatter: INT },
    { key: 'buyRate', label: 'Rate', width: 5, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'buyAmount', label: 'Amount', width: 7, align: 'right', formatter: MONEY },
    { key: 'sellQty', label: 'Qty', width: 4, align: 'right', formatter: INT },
    { key: 'sellRate', label: 'Rate', width: 5, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'sellAmount', label: 'Amount', width: 7, align: 'right', formatter: MONEY },
    { key: 'closingQty', label: 'Qty', width: 4, align: 'right', formatter: INT, signed: true },
    { key: 'closingRate', label: 'Rate', width: 5, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'closingValue', label: 'Value', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'capitalGL', label: 'Capital G/L', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'shortTerm', label: 'Short Term', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'longTerm', label: 'Long Term', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'speculation', label: 'Speculation', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'specGain', label: 'Spec Gain', width: 6, align: 'right', formatter: MONEY },
    { key: 'specLoss', label: 'Spec Loss', width: 6, align: 'right', formatter: MONEY },
    { key: 'stUp', label: 'Short Term (Upto 22-Jul-24)', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'ltUp', label: 'Long Term (Upto 22-Jul-24)', width: 7, align: 'right', formatter: MONEY, signed: true },
  ];

  return {
    reportTitle: `Capital Gain - Loss (Equity) Summary Report As on ${fmtDateDDMMYYYY(toDate)}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: opts.from && opts.to ? `${opts.from} → ${opts.to}` : undefined,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Opening', spanCols: 3 },
      { label: 'Purchase', spanCols: 3 },
      { label: 'Sale', spanCols: 3 },
      { label: 'Closing=Op+Pur-Sell(+/-) G/L', spanCols: 3 },
      { label: 'Capital Gain/Loss', spanCols: 1 },
      { label: 'Gain/Loss', spanCols: 5 },
      { label: 'Upto 22 July 2024', spanCols: 2 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{
      groups: [{
        rows: list.map((b) => ({
          cells: {
            scriptName: b.assetName,
            openQty: b.openQty.toString(),
            openRate: b.openQty.isZero() ? '' : b.openValue.dividedBy(b.openQty).toString(),
            openAmount: b.openValue.toString(),
            buyQty: b.buyQty.toString(),
            buyRate: b.buyQty.isZero() ? '' : b.buyValue.dividedBy(b.buyQty).toString(),
            buyAmount: b.buyValue.toString(),
            sellQty: b.sellQty.toString(),
            sellRate: b.sellQty.isZero() ? '' : b.sellValue.dividedBy(b.sellQty).toString(),
            sellAmount: b.sellValue.toString(),
            closingQty: b.closingQty.toString(),
            closingRate: b.closingQty.isZero() ? '' : b.closingValue.dividedBy(b.closingQty).toString(),
            closingValue: b.closingValue.toString(),
            capitalGL: b.capitalGL.toString(),
            shortTerm: b.shortTerm.toString(),
            longTerm: b.longTerm.toString(),
            speculation: b.speculation.toString(),
            specGain: b.speculationGain.toString(),
            specLoss: b.speculationLoss.toString(),
            stUp: b.shortTermUpto22Jul.toString(),
            ltUp: b.longTermUpto22Jul.toString(),
          },
        })),
      }],
    }],
    grandTotal: {
      label: 'Grand Total',
      values: {
        openQty: tot.openQty.toString(),
        openAmount: tot.openValue.toString(),
        buyQty: tot.buyQty.toString(),
        buyAmount: tot.buyValue.toString(),
        sellQty: tot.sellQty.toString(),
        sellAmount: tot.sellValue.toString(),
        closingQty: tot.closingQty.toString(),
        closingValue: tot.closingValue.toString(),
        capitalGL: tot.capitalGL.toString(),
        shortTerm: tot.shortTerm.toString(),
        longTerm: tot.longTerm.toString(),
        speculation: tot.speculation.toString(),
        specGain: tot.specGain.toString(),
        specLoss: tot.specLoss.toString(),
        stUp: tot.stUp.toString(),
        ltUp: tot.ltUp.toString(),
      },
    },
    filenameStem: `tax-pnl${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 29. STT 10 DB Report ─────────────────────────────────────────
//
// Every transaction that incurred Securities Transaction Tax,
// grouped by broker. Bill No (= orderNo), bill date, qty, gross rate,
// gross amount, STT, type (Bought / Sold).

export async function buildStt10DbLayout(
  userId: string,
  asOf?: Date,
): Promise<MprofitLayout> {
  const m = await userMember(userId);
  const cutoff = asOf ?? new Date();
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      tradeDate: { lte: cutoff },
    },
    orderBy: [{ broker: 'asc' }, { tradeDate: 'asc' }],
  });

  const byBroker = new Map<string, typeof txs>();
  for (const t of txs) {
    const b = t.broker ?? 'SELF-BROKER A/C';
    const arr = byBroker.get(b) ?? [];
    arr.push(t);
    byBroker.set(b, arr);
  }

  const sections: ReportSection[] = [];
  let grandGross = new Decimal(0);
  let grandStt = new Decimal(0);
  for (const [broker, list] of byBroker) {
    const totalGross = list.reduce((s, t) => s.plus(new Decimal(t.grossAmount.toString())), new Decimal(0));
    const totalStt = list.reduce((s, t) => s.plus(new Decimal(t.stt.toString())), new Decimal(0));
    grandGross = grandGross.plus(totalGross);
    grandStt = grandStt.plus(totalStt);
    sections.push({
      banner: broker,
      groups: [{
        rows: list.map((t) => ({
          cells: {
            broker,
            script: t.assetName ?? '—',
            billNo: t.orderNo ?? '',
            billDate: t.tradeDate.toISOString().slice(0, 10),
            qty: t.quantity.toString(),
            grossRate: t.price.toString(),
            grossAmount: t.grossAmount.toString(),
            stt: t.stt.toString(),
            type: BUY_TXN_TYPES.has(t.transactionType)
              ? 'Bought'
              : SELL_TXN_TYPES.has(t.transactionType) ? 'Sold' : t.transactionType,
          },
        })),
        subtotal: {
          label: `Total: ${broker}`,
          values: {
            grossAmount: totalGross.toString(),
            stt: totalStt.toString(),
          },
        },
      }],
    });
  }

  const columns: ColumnDef[] = [
    { key: 'broker', label: 'Broker Name', width: 14, align: 'left' },
    { key: 'script', label: 'Script Name', width: 18, align: 'left' },
    { key: 'billNo', label: 'Bill No', width: 9, align: 'left' },
    { key: 'billDate', label: 'Bill Date', width: 8, align: 'center', formatter: DATE },
    { key: 'qty', label: 'Qty', width: 6, align: 'right', formatter: (v) => indianMoney(v, 4) },
    { key: 'grossRate', label: 'Gross Rate', width: 8, align: 'right', formatter: MONEY },
    { key: 'grossAmount', label: 'Gross Amount', width: 9, align: 'right', formatter: MONEY },
    { key: 'stt', label: 'STT', width: 7, align: 'right', formatter: MONEY },
    { key: 'type', label: 'Type', width: 7, align: 'left' },
  ];

  return {
    reportTitle: `STT Equity As On ${fmtDateDDMMYYYY(cutoff)} (Equity)`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: columns.map((c) => ({ label: c.label, spanCols: 1 })),
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections,
    grandTotal: {
      label: 'Grand Total',
      values: {
        grossAmount: grandGross.toString(),
        stt: grandStt.toString(),
      },
    },
    filenameStem: `stt-10db-${cutoff.toISOString().slice(0, 10)}`,
  };
}

// ─── 30. Capital Gains FIFO ───────────────────────────────────────
//
// Per-script capital gain summary with full Upto / Onward 22-July
// split. Uses the same data flow as Tax PnL but extra ST/LT-onward
// columns and section-wise sub-totals per equity / share trading.

export async function buildCapitalGainsFifoLayout(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<MprofitLayout> {
  // The data engine is identical to Tax PnL — re-use it and just swap
  // the column set + add the Onward 23-July columns.
  const m = await userMember(userId);
  const fromDate = opts.from ? new Date(opts.from) : null;
  const toDate = opts.to ? new Date(opts.to) : new Date();

  const { rows: cgRows } = await computeUserCapitalGains(userId);
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId }, tradeDate: { lte: toDate } },
    orderBy: { tradeDate: 'asc' },
  });

  const byScript = new Map<string, ScriptBucket>();
  const getB = (name: string, isin: string | null): ScriptBucket => {
    let b = byScript.get(name);
    if (!b) {
      b = emptyBucket(name, isin);
      byScript.set(name, b);
    }
    return b;
  };

  for (const t of txs) {
    const b = getB(t.assetName ?? '—', t.isin);
    const inWindow = !fromDate || t.tradeDate.getTime() >= fromDate.getTime();
    const q = new Decimal(t.quantity.toString());
    const net = new Decimal(t.netAmount.toString());
    if (BUY_TXN_TYPES.has(t.transactionType)) {
      if (!inWindow) {
        b.openQty = b.openQty.plus(q);
        b.openValue = b.openValue.plus(net);
      } else {
        b.buyQty = b.buyQty.plus(q);
        b.buyValue = b.buyValue.plus(net);
      }
      b.closingQty = b.closingQty.plus(q);
      b.closingValue = b.closingValue.plus(net);
    } else if (SELL_TXN_TYPES.has(t.transactionType)) {
      if (inWindow) {
        b.sellQty = b.sellQty.plus(q);
        b.sellValue = b.sellValue.plus(net);
      }
      const avg = b.closingQty.isZero() ? new Decimal(0) : b.closingValue.dividedBy(b.closingQty);
      b.closingQty = b.closingQty.minus(q);
      b.closingValue = b.closingValue.minus(avg.times(q));
    }
  }
  for (const r of cgRows) {
    if (fromDate && r.sellDate.getTime() < fromDate.getTime()) continue;
    if (r.sellDate.getTime() > toDate.getTime()) continue;
    const b = getB(r.assetName, r.isin);
    b.capitalGL = b.capitalGL.plus(r.gainLoss);
    if (r.capitalGainType === 'INTRADAY') {
      b.speculation = b.speculation.plus(r.gainLoss);
      if (r.gainLoss.greaterThanOrEqualTo(0)) b.speculationGain = b.speculationGain.plus(r.gainLoss);
      else b.speculationLoss = b.speculationLoss.plus(r.gainLoss.abs());
    } else if (r.capitalGainType === 'SHORT_TERM') {
      b.shortTerm = b.shortTerm.plus(r.gainLoss);
      if (r.sellDate.getTime() <= LTCG_RATE_CHANGE_CUTOFF.getTime()) b.shortTermUpto22Jul = b.shortTermUpto22Jul.plus(r.gainLoss);
      else b.shortTermOnward23Jul = b.shortTermOnward23Jul.plus(r.gainLoss);
    } else if (r.capitalGainType === 'LONG_TERM') {
      b.longTerm = b.longTerm.plus(r.gainLoss);
      if (r.sellDate.getTime() <= LTCG_RATE_CHANGE_CUTOFF.getTime()) b.longTermUpto22Jul = b.longTermUpto22Jul.plus(r.gainLoss);
      else b.longTermOnward23Jul = b.longTermOnward23Jul.plus(r.gainLoss);
    }
  }

  const list = Array.from(byScript.values()).sort((a, b) => a.assetName.localeCompare(b.assetName));
  const tot = list.reduce((acc, b) => ({
    capitalGL: acc.capitalGL.plus(b.capitalGL),
    shortTerm: acc.shortTerm.plus(b.shortTerm),
    longTerm: acc.longTerm.plus(b.longTerm),
    speculation: acc.speculation.plus(b.speculation),
    specGain: acc.specGain.plus(b.speculationGain),
    specLoss: acc.specLoss.plus(b.speculationLoss),
    stUp: acc.stUp.plus(b.shortTermUpto22Jul),
    ltUp: acc.ltUp.plus(b.longTermUpto22Jul),
    stOn: acc.stOn.plus(b.shortTermOnward23Jul),
    ltOn: acc.ltOn.plus(b.longTermOnward23Jul),
  }), {
    capitalGL: new Decimal(0), shortTerm: new Decimal(0), longTerm: new Decimal(0),
    speculation: new Decimal(0), specGain: new Decimal(0), specLoss: new Decimal(0),
    stUp: new Decimal(0), ltUp: new Decimal(0), stOn: new Decimal(0), ltOn: new Decimal(0),
  });

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 14, align: 'left' },
    { key: 'closingQty', label: 'Qty', width: 4, align: 'right', formatter: INT, signed: true },
    { key: 'closingRate', label: 'Rate', width: 5, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'closingValue', label: 'Value', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'capitalGL', label: 'Capital G/L', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'shortTerm', label: 'Short Term', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'longTerm', label: 'Long Term', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'speculation', label: 'Speculation', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'specGain', label: 'Spec Gain', width: 6, align: 'right', formatter: MONEY },
    { key: 'specLoss', label: 'Spec Loss', width: 6, align: 'right', formatter: MONEY },
    { key: 'stUp', label: 'Short Term (≤22-Jul-24)', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'ltUp', label: 'Long Term (≤22-Jul-24)', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'stOn', label: 'Short Term (≥23-Jul-24)', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'ltOn', label: 'Long Term (≥23-Jul-24)', width: 7, align: 'right', formatter: MONEY, signed: true },
  ];

  return {
    reportTitle: `Capital Gain - Loss (Equity) Summary Report As on ${fmtDateDDMMYYYY(toDate)}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Closing=Op+Pur-Sell(+/-) G/L', spanCols: 3 },
      { label: 'Capital Gain/Loss', spanCols: 1 },
      { label: 'Gain/Loss', spanCols: 5 },
      { label: 'Upto 22 July 2024', spanCols: 2 },
      { label: 'Onward 23 July 2024', spanCols: 2 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [{
      groups: [{
        rows: list.map((b) => ({
          cells: {
            scriptName: b.assetName,
            closingQty: b.closingQty.toString(),
            closingRate: b.closingQty.isZero() ? '' : b.closingValue.dividedBy(b.closingQty).toString(),
            closingValue: b.closingValue.toString(),
            capitalGL: b.capitalGL.toString(),
            shortTerm: b.shortTerm.toString(),
            longTerm: b.longTerm.toString(),
            speculation: b.speculation.toString(),
            specGain: b.speculationGain.toString(),
            specLoss: b.speculationLoss.toString(),
            stUp: b.shortTermUpto22Jul.toString(),
            ltUp: b.longTermUpto22Jul.toString(),
            stOn: b.shortTermOnward23Jul.toString(),
            ltOn: b.longTermOnward23Jul.toString(),
          },
        })),
      }],
    }],
    grandTotal: {
      label: 'Grand Total: SHARE INVESTMENT (EQUITY) A/C',
      values: {
        capitalGL: tot.capitalGL.toString(),
        shortTerm: tot.shortTerm.toString(),
        longTerm: tot.longTerm.toString(),
        speculation: tot.speculation.toString(),
        specGain: tot.specGain.toString(),
        specLoss: tot.specLoss.toString(),
        stUp: tot.stUp.toString(),
        ltUp: tot.ltUp.toString(),
        stOn: tot.stOn.toString(),
        ltOn: tot.ltOn.toString(),
      },
    },
    filenameStem: `capital-gains-fifo${opts.from ? `-${opts.from}` : ''}`,
  };
}

// ─── 31. Advance Tax Summary ──────────────────────────────────────
//
// Per-script gain/loss with Grandfathering cost + 31-Jan-2018 FMV
// rate. Bottom section: Period-Wise Stock Profit Summary, splitting
// realised gains by advance-tax instalment due dates:
//   01-Apr → 15-Jun     (1st instalment, 15%)
//   16-Jun → 15-Sep     (2nd instalment, 45%)
//   16-Sep → 15-Dec     (3rd instalment, 75%)
//   16-Dec → 15-Mar     (4th instalment, 100%)
//   16-Mar → 31-Mar
//   01-Apr → 31-Mar     (full FY)

export async function buildAdvanceTaxSummaryLayout(
  userId: string,
  opts: { fy?: string },
): Promise<MprofitLayout> {
  const m = await userMember(userId);

  // Resolve FY window. Default = current Indian FY.
  const fyToBoundary = (fy?: string): { fromDate: Date; toDate: Date; label: string } => {
    if (fy) {
      const [a, b] = fy.split('-');
      const ay = parseInt(a!, 10);
      const fromY = ay;
      const toY = b!.length === 2 ? 2000 + parseInt(b!, 10) : parseInt(b!, 10);
      return {
        fromDate: new Date(`${fromY}-04-01T00:00:00.000Z`),
        toDate: new Date(`${toY}-03-31T23:59:59.999Z`),
        label: fy,
      };
    }
    const now = new Date();
    const y = now.getUTCFullYear();
    const fromY = now.getUTCMonth() + 1 >= 4 ? y : y - 1;
    return {
      fromDate: new Date(`${fromY}-04-01T00:00:00.000Z`),
      toDate: new Date(`${fromY + 1}-03-31T23:59:59.999Z`),
      label: `${fromY}-${String(fromY + 1).slice(2)}`,
    };
  };
  const { fromDate, toDate, label: fyLabel } = fyToBoundary(opts.fy);
  const fyStartYear = fromDate.getUTCFullYear();

  const { rows: cgRows } = await computeUserCapitalGains(userId);
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId }, tradeDate: { lte: toDate } },
    orderBy: { tradeDate: 'asc' },
  });

  const byScript = new Map<string, {
    name: string; isin: string | null;
    openQty: Decimal; openValue: Decimal;
    buyQty: Decimal; buyValue: Decimal;
    sellQty: Decimal; sellValue: Decimal;
    gainLoss: Decimal; gain: Decimal; loss: Decimal;
    fmv31Jan2018: Decimal | null; gfCost: Decimal;
    shortTerm: Decimal; longTerm: Decimal; speculation: Decimal;
  }>();
  const getB = (name: string, isin: string | null) => {
    let b = byScript.get(name);
    if (!b) {
      b = {
        name, isin,
        openQty: new Decimal(0), openValue: new Decimal(0),
        buyQty: new Decimal(0), buyValue: new Decimal(0),
        sellQty: new Decimal(0), sellValue: new Decimal(0),
        gainLoss: new Decimal(0), gain: new Decimal(0), loss: new Decimal(0),
        fmv31Jan2018: null, gfCost: new Decimal(0),
        shortTerm: new Decimal(0), longTerm: new Decimal(0), speculation: new Decimal(0),
      };
      byScript.set(name, b);
    }
    return b;
  };

  for (const t of txs) {
    const b = getB(t.assetName ?? '—', t.isin);
    const inWindow = t.tradeDate.getTime() >= fromDate.getTime() && t.tradeDate.getTime() <= toDate.getTime();
    const q = new Decimal(t.quantity.toString());
    const net = new Decimal(t.netAmount.toString());
    if (BUY_TXN_TYPES.has(t.transactionType)) {
      if (!inWindow) {
        b.openQty = b.openQty.plus(q);
        b.openValue = b.openValue.plus(net);
      } else {
        b.buyQty = b.buyQty.plus(q);
        b.buyValue = b.buyValue.plus(net);
      }
    } else if (SELL_TXN_TYPES.has(t.transactionType) && inWindow) {
      b.sellQty = b.sellQty.plus(q);
      b.sellValue = b.sellValue.plus(net);
    }
  }

  // FMV on 31-Jan-2018 for grandfathering.
  const isins = Array.from(new Set(
    Array.from(byScript.values()).map((b) => b.isin).filter((i): i is string => !!i),
  ));
  const fmvByIsin = await fetchFmvOn31Jan2018(isins);

  // CG rows in FY window.
  for (const r of cgRows) {
    if (r.sellDate.getTime() < fromDate.getTime() || r.sellDate.getTime() > toDate.getTime()) continue;
    const b = getB(r.assetName, r.isin);
    const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
    const adjusted = adjustGainForGrandfathering(
      r.buyDate, r.quantity, r.buyAmount, r.sellAmount, r.gainLoss, fmv,
    );
    b.gainLoss = b.gainLoss.plus(adjusted);
    if (adjusted.greaterThanOrEqualTo(0)) b.gain = b.gain.plus(adjusted);
    else b.loss = b.loss.plus(adjusted.abs());
    if (fmv && r.buyDate.getTime() <= new Date('2018-01-31T23:59:59.999Z').getTime()) {
      b.fmv31Jan2018 = fmv;
      b.gfCost = b.gfCost.plus(fmv.times(r.quantity));
    }
    if (r.capitalGainType === 'INTRADAY') b.speculation = b.speculation.plus(adjusted);
    else if (r.capitalGainType === 'SHORT_TERM') b.shortTerm = b.shortTerm.plus(adjusted);
    else if (r.capitalGainType === 'LONG_TERM') b.longTerm = b.longTerm.plus(adjusted);
  }

  const list = Array.from(byScript.values()).sort((a, b) => a.name.localeCompare(b.name));
  const tot = list.reduce((acc, b) => ({
    openQty: acc.openQty.plus(b.openQty), openValue: acc.openValue.plus(b.openValue),
    buyQty: acc.buyQty.plus(b.buyQty), buyValue: acc.buyValue.plus(b.buyValue),
    sellQty: acc.sellQty.plus(b.sellQty), sellValue: acc.sellValue.plus(b.sellValue),
    gainLoss: acc.gainLoss.plus(b.gainLoss), gain: acc.gain.plus(b.gain), loss: acc.loss.plus(b.loss),
    gfCost: acc.gfCost.plus(b.gfCost),
    shortTerm: acc.shortTerm.plus(b.shortTerm), longTerm: acc.longTerm.plus(b.longTerm),
    speculation: acc.speculation.plus(b.speculation),
  }), {
    openQty: new Decimal(0), openValue: new Decimal(0),
    buyQty: new Decimal(0), buyValue: new Decimal(0),
    sellQty: new Decimal(0), sellValue: new Decimal(0),
    gainLoss: new Decimal(0), gain: new Decimal(0), loss: new Decimal(0),
    gfCost: new Decimal(0),
    shortTerm: new Decimal(0), longTerm: new Decimal(0), speculation: new Decimal(0),
  });

  // Period-wise stock profit summary (advance-tax instalments).
  const periods = [
    { label: `01/04/${fyStartYear} TO 15/06/${fyStartYear}`, from: new Date(`${fyStartYear}-04-01`), to: new Date(`${fyStartYear}-06-15T23:59:59.999Z`) },
    { label: `16/06/${fyStartYear} TO 15/09/${fyStartYear}`, from: new Date(`${fyStartYear}-06-16`), to: new Date(`${fyStartYear}-09-15T23:59:59.999Z`) },
    { label: `16/09/${fyStartYear} TO 15/12/${fyStartYear}`, from: new Date(`${fyStartYear}-09-16`), to: new Date(`${fyStartYear}-12-15T23:59:59.999Z`) },
    { label: `16/12/${fyStartYear} TO 15/03/${fyStartYear + 1}`, from: new Date(`${fyStartYear}-12-16`), to: new Date(`${fyStartYear + 1}-03-15T23:59:59.999Z`) },
    { label: `16/03/${fyStartYear + 1} TO 31/03/${fyStartYear + 1}`, from: new Date(`${fyStartYear + 1}-03-16`), to: new Date(`${fyStartYear + 1}-03-31T23:59:59.999Z`) },
    { label: `01/04/${fyStartYear} TO 31/03/${fyStartYear + 1}`, from: fromDate, to: toDate },
  ];
  const periodRows: BodyRowLite[] = periods.map((p) => {
    let gainLoss = new Decimal(0);
    let gain = new Decimal(0);
    let loss = new Decimal(0);
    let gfCost = new Decimal(0);
    let shortTerm = new Decimal(0);
    let longTerm = new Decimal(0);
    let speculation = new Decimal(0);
    for (const r of cgRows) {
      if (r.sellDate.getTime() < p.from.getTime() || r.sellDate.getTime() > p.to.getTime()) continue;
      const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
      const adj = adjustGainForGrandfathering(r.buyDate, r.quantity, r.buyAmount, r.sellAmount, r.gainLoss, fmv);
      gainLoss = gainLoss.plus(adj);
      if (adj.greaterThanOrEqualTo(0)) gain = gain.plus(adj);
      else loss = loss.plus(adj.abs());
      if (fmv) gfCost = gfCost.plus(fmv.times(r.quantity));
      if (r.capitalGainType === 'INTRADAY') speculation = speculation.plus(adj);
      else if (r.capitalGainType === 'SHORT_TERM') shortTerm = shortTerm.plus(adj);
      else if (r.capitalGainType === 'LONG_TERM') longTerm = longTerm.plus(adj);
    }
    return {
      cells: {
        scriptName: p.label,
        gainLoss: gainLoss.toString(),
        gain: gain.toString(),
        loss: loss.greaterThan(0) ? loss.negated().toString() : '',
        gfCost: gfCost.toString(),
        shortTerm: shortTerm.toString(),
        longTerm: longTerm.toString(),
        speculation: speculation.toString(),
      },
    };
  });

  const columns: ColumnDef[] = [
    { key: 'scriptName', label: 'Script Name', width: 18, align: 'left' },
    { key: 'openQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'openValue', label: 'Amount', width: 7, align: 'right', formatter: MONEY },
    { key: 'buyQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'buyValue', label: 'Amount', width: 7, align: 'right', formatter: MONEY },
    { key: 'sellQty', label: 'Qty', width: 5, align: 'right', formatter: INT },
    { key: 'sellValue', label: 'Amount', width: 7, align: 'right', formatter: MONEY },
    { key: 'gainLoss', label: 'Gain/Loss', width: 7, align: 'right', formatter: MONEY, signed: true },
    { key: 'gain', label: 'Gain', width: 6, align: 'right', formatter: MONEY },
    { key: 'loss', label: 'Loss', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'fmv31Jan2018', label: '31st January 2018', width: 7, align: 'right', formatter: (v) => v ? MONEY(v) : '' },
    { key: 'gfCost', label: 'Grandfathered Cost', width: 8, align: 'right', formatter: MONEY },
    { key: 'shortTerm', label: 'Short Term', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'longTerm', label: 'Long Term', width: 6, align: 'right', formatter: MONEY, signed: true },
    { key: 'speculation', label: 'Speculation', width: 6, align: 'right', formatter: MONEY, signed: true },
  ];

  return {
    reportTitle: `Advance Tax Calculation (Equity) As on ${fmtDateDDMMYYYY(toDate)}`,
    family: m.family,
    member: m.member,
    pan: m.pan,
    financialYear: fyLabel,
    headerRow1: [
      { label: 'Script Name', spanCols: 1 },
      { label: 'Opening', spanCols: 2 },
      { label: 'Purchase', spanCols: 2 },
      { label: 'Sale', spanCols: 2 },
      { label: 'Gain/Loss', spanCols: 8 },
    ],
    headerRow2: columns.map((c) => ({ label: c.label, align: c.align })),
    columns,
    sections: [
      {
        groups: [{
          rows: list.map((b) => ({
            cells: {
              scriptName: b.name,
              openQty: b.openQty.toString(),
              openValue: b.openValue.toString(),
              buyQty: b.buyQty.toString(),
              buyValue: b.buyValue.toString(),
              sellQty: b.sellQty.toString(),
              sellValue: b.sellValue.toString(),
              gainLoss: b.gainLoss.toString(),
              gain: b.gain.toString(),
              loss: b.loss.greaterThan(0) ? b.loss.negated().toString() : '',
              fmv31Jan2018: b.fmv31Jan2018?.toString() ?? '',
              gfCost: b.gfCost.toString(),
              shortTerm: b.shortTerm.toString(),
              longTerm: b.longTerm.toString(),
              speculation: b.speculation.toString(),
            },
          })),
        }],
      },
      {
        banner: 'Period Wise Stock Profit Summary',
        groups: [{ rows: periodRows }],
      },
    ],
    grandTotal: {
      label: 'Grand Total',
      values: {
        openQty: tot.openQty.toString(),
        openValue: tot.openValue.toString(),
        buyQty: tot.buyQty.toString(),
        buyValue: tot.buyValue.toString(),
        sellQty: tot.sellQty.toString(),
        sellValue: tot.sellValue.toString(),
        gainLoss: tot.gainLoss.toString(),
        gain: tot.gain.toString(),
        loss: tot.loss.greaterThan(0) ? tot.loss.negated().toString() : '',
        gfCost: tot.gfCost.toString(),
        shortTerm: tot.shortTerm.toString(),
        longTerm: tot.longTerm.toString(),
        speculation: tot.speculation.toString(),
      },
    },
    filenameStem: `advance-tax-summary${opts.fy ? `-${opts.fy}` : ''}`,
  };
}
