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
  type ColumnDef,
  type MprofitLayout,
  type SubGroup,
  type ReportSection,
} from '../mprofitStyle.js';
import {
  grandfatheringReport,
  dematHoldingReport,
  m2mReport,
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
    reportTitle: `Physical/Demat Accountwise Stock Report As On ${new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `M2M (ALL) report as on ${r.asOfDate}`,
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
    reportTitle: `Trial Balance As On ${asOf ?? new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `Account Ledger From ${opts.from ?? '—'} To ${opts.to ?? new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `Profit & Loss Report As On ${opts.to ?? new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `Balance Sheet Report As On ${asOf ?? new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `Capital Gain - Loss Mutual Fund As on ${new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `BrokerBill Register As On ${new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `Portfolio Holdings Summary As On ${new Date().toLocaleDateString('en-IN')}`,
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
    reportTitle: `XIRR / Performance Report As On ${new Date().toLocaleDateString('en-IN')}`,
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

  const fromStamp = opts.from ?? (flows[0] ? flows[0].date.toISOString().slice(0, 10) : 'inception');
  const toStamp = opts.to ?? new Date().toLocaleDateString('en-IN');

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
