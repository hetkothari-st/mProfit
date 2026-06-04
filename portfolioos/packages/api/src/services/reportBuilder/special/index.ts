/**
 * Tax / MIS report builders.
 *
 * Each function returns an ExportPayload the existing streamPdf /
 * streamExcel pipeline can serialise into a download. Layouts mirror
 * the legacy mProfit desktop reports the user shared.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import type { ExportPayload, ExportSection } from '../../export.service.js';
import { fmtNum, fmtDate } from '../../export.service.js';
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
  incomeReport,
  userIntradayReport,
  userStcgReport,
  userLtcgReport,
  userSchedule112AReport,
} from '../../reports.service.js';
import { computeUserCapitalGains } from '../../capitalGains.service.js';
import {
  getTrialBalance,
  getAccountLedger,
  getPnL,
  getBalanceSheet,
  listAccountsFlat,
} from '../../accounting.service.js';

const indianFmt = (v: unknown) => fmtNum(v);
const pctFmt = (v: unknown) =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(2)}%`;

// ─── 1. Grandfathering LTCG ───────────────────────────────────────

export async function buildGrandfatheringPayload(
  userId: string,
  fy?: string,
): Promise<ExportPayload> {
  const r = await grandfatheringReport(userId, fy);
  return {
    title: 'Grandfathering Report — Sec 112A',
    subtitle: fy ? `Financial Year ${fy}` : 'All financial years',
    filenameStem: `grandfathering-ltcg${fy ? `-${fy}` : ''}`,
    meta: { 'Financial Year': fy ?? 'All', Scope: 'All portfolios' },
    columns: [
      { key: 'scriptName', header: 'Script Name', width: 34 },
      { key: 'buyDate', header: 'Buy Date', width: 12, formatter: fmtDate },
      { key: 'buyQty', header: 'Buy Qty', width: 10, formatter: (v) => indianFmt(v) },
      { key: 'buyRate', header: 'Buy Rate', width: 12, formatter: (v) => indianFmt(v) },
      { key: 'buyAmount', header: 'Buy Amount', width: 14, formatter: (v) => indianFmt(v) },
      { key: 'fmvOn31Jan2018', header: 'FMV 31-Jan-2018', width: 14, formatter: (v) => v ? indianFmt(v) : '—' },
      { key: 'sellDate', header: 'Sell Date', width: 12, formatter: fmtDate },
      { key: 'sellQty', header: 'Sell Qty', width: 10, formatter: (v) => indianFmt(v) },
      { key: 'sellRate', header: 'Sell Rate', width: 12, formatter: (v) => indianFmt(v) },
      { key: 'sellAmount', header: 'Sell Amount', width: 14, formatter: (v) => indianFmt(v) },
      { key: 'gainLoss', header: 'Gain / Loss', width: 14, formatter: (v) => indianFmt(v) },
    ],
    rows: r.rows as unknown as Array<Record<string, unknown>>,
    footer: {
      'Total Buy Qty': indianFmt(r.totals.buyQty),
      'Total Buy Amount': indianFmt(r.totals.buyAmount),
      'Total Sell Amount': indianFmt(r.totals.sellAmount),
      'Net Gain / Loss': indianFmt(r.totals.net),
    },
  };
}

// ─── 2. Demat-wise holdings ───────────────────────────────────────

export async function buildDematHoldingsPayload(userId: string): Promise<ExportPayload> {
  const r = await dematHoldingReport(userId);
  return {
    title: 'Physical / Demat Accountwise Stock Report',
    subtitle: `As of ${new Date().toISOString().slice(0, 10)}`,
    filenameStem: 'demat-accountwise-holdings',
    columns: [
      { key: 'brokerName', header: 'Demat Account', width: 28 },
      { key: 'scriptName', header: 'Script Name', width: 32 },
      { key: 'isin', header: 'ISIN', width: 16 },
      { key: 'balanceQty', header: 'Balance Qty', width: 14, formatter: (v) => indianFmt(v) },
    ],
    rows: r.rows as unknown as Array<Record<string, unknown>>,
    footer: {
      'Brokers': String(new Set(r.rows.map((x) => x.brokerName)).size),
      'Open positions': String(r.rows.length),
      'Total balance qty': indianFmt(r.grandTotal),
    },
    additionalSections: r.movements.length > 0
      ? [
          {
            title: 'Dated movements',
            columns: [
              { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
              { key: 'brokerName', header: 'Demat Account', width: 22 },
              { key: 'scriptName', header: 'Script Name', width: 28 },
              { key: 'reason', header: 'Reason', width: 14 },
              { key: 'inQty', header: 'In', width: 10, formatter: (v) => indianFmt(v) },
              { key: 'outQty', header: 'Out', width: 10, formatter: (v) => indianFmt(v) },
              { key: 'balanceQty', header: 'Balance', width: 12, formatter: (v) => indianFmt(v) },
            ],
            rows: r.movements as unknown as Array<Record<string, unknown>>,
          },
        ]
      : undefined,
  };
}

// ─── 3. M2M Equity + F&O ──────────────────────────────────────────

export async function buildM2MPayload(userId: string, asOf?: Date): Promise<ExportPayload> {
  const r = await m2mReport(userId, asOf);
  const allRows = [...r.equityRows, ...r.fnoRows];
  return {
    title: 'M2M Report — Equity + F&O',
    subtitle: `As of ${r.asOfDate}`,
    filenameStem: `m2m-${r.asOfDate}`,
    meta: { 'As of': r.asOfDate, Scope: 'All portfolios' },
    columns: [
      { key: 'segment', header: 'Segment', width: 10 },
      { key: 'scriptName', header: 'Script Name', width: 32 },
      { key: 'closingDate', header: 'Closing Date', width: 12, formatter: fmtDate },
      { key: 'qty', header: 'Qty', width: 10, formatter: (v) => indianFmt(v) },
      { key: 'purRate', header: 'Pur Rate', width: 11, formatter: (v) => indianFmt(v) },
      { key: 'purValue', header: 'Pur Value', width: 13, formatter: (v) => indianFmt(v) },
      { key: 'bhavRate', header: 'Bhav Rate', width: 11, formatter: (v) => indianFmt(v) },
      { key: 'valuation', header: 'Valuation', width: 13, formatter: (v) => indianFmt(v) },
      { key: 'unrealisedPnL', header: 'Unrealised G/L', width: 14, formatter: (v) => indianFmt(v) },
      { key: 'noOfDays', header: 'Days', width: 8 },
      { key: 'actualRoiPct', header: 'Actual ROI %', width: 11, formatter: (v) => pctFmt(v) },
      { key: 'monthlyRoiPct', header: 'Monthly ROI %', width: 12, formatter: (v) => pctFmt(v) },
      { key: 'annualRoiPct', header: 'Annual ROI %', width: 12, formatter: (v) => pctFmt(v) },
      { key: 'cagrPct', header: 'CAGR %', width: 10, formatter: (v) => pctFmt(v) },
    ],
    rows: allRows as unknown as Array<Record<string, unknown>>,
    footer: {
      'Equity Value': indianFmt(r.equityTotals.valuation),
      'F&O Value': indianFmt(r.fnoTotals.valuation),
      'Total Cost': indianFmt(r.grandTotal.purValue),
      'Unrealised G/L': indianFmt(r.grandTotal.unrealisedPnL),
    },
  };
}

// ─── 4. Trial Balance ─────────────────────────────────────────────

export async function buildTrialBalancePayload(
  userId: string,
  asOf?: string,
): Promise<ExportPayload> {
  const rows = await getTrialBalance(userId, asOf);
  const totalDr = rows.reduce((s, r) => s.plus(r.totalDebit), new Decimal(0));
  const totalCr = rows.reduce((s, r) => s.plus(r.totalCredit), new Decimal(0));
  return {
    title: 'Trial Balance',
    subtitle: asOf ? `As of ${asOf}` : `As of ${new Date().toISOString().slice(0, 10)}`,
    filenameStem: `trial-balance${asOf ? `-${asOf}` : ''}`,
    columns: [
      { key: 'code', header: 'Code', width: 10 },
      { key: 'name', header: 'Particulars', width: 38 },
      { key: 'type', header: 'Type', width: 12 },
      { key: 'openingBalance', header: 'Opening', width: 14, formatter: indianFmt },
      { key: 'totalDebit', header: 'Debit', width: 14, formatter: indianFmt },
      { key: 'totalCredit', header: 'Credit', width: 14, formatter: indianFmt },
      { key: 'closingBalance', header: 'Closing', width: 14, formatter: indianFmt },
    ],
    rows: rows as unknown as Array<Record<string, unknown>>,
    footer: {
      'Total Debit': indianFmt(totalDr.toFixed(4)),
      'Total Credit': indianFmt(totalCr.toFixed(4)),
      Difference: indianFmt(totalDr.minus(totalCr).toFixed(4)),
    },
  };
}

// ─── 5. Account Ledger (all accounts as separate sections) ────────

export async function buildAccountLedgerPayload(
  userId: string,
  opts: { accountId?: string; from?: string; to?: string },
): Promise<ExportPayload> {
  // If accountId given → single ledger; else → all accounts as
  // additional sections.
  if (opts.accountId) {
    const ledger = await getAccountLedger(userId, opts.accountId, opts);
    return {
      title: `Account Ledger — ${ledger.account.code} ${ledger.account.name}`,
      subtitle: `${opts.from ?? 'beginning'} → ${opts.to ?? 'today'}`,
      filenameStem: `ledger-${ledger.account.code}`,
      columns: [
        { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
        { key: 'voucherNo', header: 'Voucher No.', width: 14 },
        { key: 'voucherType', header: 'Type', width: 12 },
        { key: 'narration', header: 'Narration', width: 38 },
        { key: 'debit', header: 'Debit', width: 14, formatter: indianFmt },
        { key: 'credit', header: 'Credit', width: 14, formatter: indianFmt },
        { key: 'balance', header: 'Balance', width: 14, formatter: indianFmt },
      ],
      rows: ledger.entries as unknown as Array<Record<string, unknown>>,
      footer: {
        Opening: indianFmt(ledger.openingBalance),
        Closing: indianFmt(ledger.closingBalance),
      },
    };
  }

  const accounts = await listAccountsFlat(userId);
  const sections: ExportSection[] = [];
  for (const a of accounts) {
    const l = await getAccountLedger(userId, a.id, opts);
    if (l.entries.length === 0) continue;
    sections.push({
      title: `${a.code} — ${a.name}`,
      columns: [
        { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
        { key: 'voucherNo', header: 'Voucher', width: 14 },
        { key: 'narration', header: 'Narration', width: 38 },
        { key: 'debit', header: 'Debit', width: 14, formatter: indianFmt },
        { key: 'credit', header: 'Credit', width: 14, formatter: indianFmt },
        { key: 'balance', header: 'Balance', width: 14, formatter: indianFmt },
      ],
      rows: l.entries as unknown as Array<Record<string, unknown>>,
    });
  }
  return {
    title: 'Account Ledger — All Accounts',
    subtitle: `${opts.from ?? 'beginning'} → ${opts.to ?? 'today'}`,
    filenameStem: 'account-ledger-all',
    columns: [
      { key: 'code', header: 'Code', width: 10 },
      { key: 'name', header: 'Account', width: 40 },
      { key: 'type', header: 'Type', width: 12 },
    ],
    rows: accounts,
    additionalSections: sections,
    mainSectionLabel: 'Chart of Accounts',
  };
}

// ─── 6. Profit & Loss ─────────────────────────────────────────────

export async function buildProfitLossPayload(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<ExportPayload> {
  const pl = await getPnL(userId, opts.from, opts.to);
  // Reshape income + expense into a Particulars / Debit / Credit table
  // styled like the legacy P&L statement.
  const rows: Array<{ debitParticulars: string; debit: string; creditParticulars: string; credit: string }> = [];
  const maxLen = Math.max(pl.income.length, pl.expense.length);
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      debitParticulars: pl.expense[i] ? `To ${pl.expense[i]!.name}` : '',
      debit: pl.expense[i] ? indianFmt(pl.expense[i]!.closingBalance) : '',
      creditParticulars: pl.income[i] ? `By ${pl.income[i]!.name}` : '',
      credit: pl.income[i] ? indianFmt(pl.income[i]!.closingBalance) : '',
    });
  }
  return {
    title: 'Profit & Loss Statement',
    subtitle: `${opts.from ?? 'beginning'} → ${opts.to ?? 'today'}`,
    filenameStem: `profit-loss${opts.from ? `-${opts.from}` : ''}`,
    columns: [
      { key: 'debitParticulars', header: 'Particulars (Debit)', width: 38 },
      { key: 'debit', header: 'Amount', width: 16 },
      { key: 'creditParticulars', header: 'Particulars (Credit)', width: 38 },
      { key: 'credit', header: 'Amount', width: 16 },
    ],
    rows,
    footer: {
      'Total Income': indianFmt(pl.totalIncome),
      'Total Expense': indianFmt(pl.totalExpense),
      [parseFloat(pl.netProfit) >= 0 ? 'Net Profit' : 'Net Loss']: indianFmt(pl.netProfit),
    },
  };
}

// ─── 7. Balance Sheet ─────────────────────────────────────────────

export async function buildBalanceSheetPayload(
  userId: string,
  asOf?: string,
): Promise<ExportPayload> {
  const bs = await getBalanceSheet(userId, asOf);
  // Two-column statement: Liabilities | Assets
  const rows: Array<{ liability: string; lAmount: string; asset: string; aAmount: string }> = [];
  const maxLen = Math.max(bs.liabilities.length + bs.equity.length + 1, bs.assets.length);
  const liabRows = [
    ...bs.liabilities.map((l) => ({ name: l.name, amount: l.closingBalance })),
    ...bs.equity.map((e) => ({ name: e.name, amount: e.closingBalance })),
    { name: 'Retained Earnings', amount: bs.retainedEarnings },
  ];
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      liability: liabRows[i]?.name ?? '',
      lAmount: liabRows[i] ? indianFmt(liabRows[i]!.amount) : '',
      asset: bs.assets[i]?.name ?? '',
      aAmount: bs.assets[i] ? indianFmt(bs.assets[i]!.closingBalance) : '',
    });
  }
  const totalLiab = new Decimal(bs.totalLiabilities).plus(bs.totalEquity).toString();
  return {
    title: 'Balance Sheet',
    subtitle: asOf ? `As of ${asOf}` : `As of ${new Date().toISOString().slice(0, 10)}`,
    filenameStem: `balance-sheet${asOf ? `-${asOf}` : ''}`,
    columns: [
      { key: 'liability', header: 'Liabilities', width: 38 },
      { key: 'lAmount', header: 'Amt in ₹', width: 16 },
      { key: 'asset', header: 'Assets', width: 38 },
      { key: 'aAmount', header: 'Amt in ₹', width: 16 },
    ],
    rows,
    footer: {
      'Total Liabilities + Equity': indianFmt(totalLiab),
      'Total Assets': indianFmt(bs.totalAssets),
    },
  };
}

// ─── 8. ITR Schedule 112A — exact ITR layout ──────────────────────

export async function buildSchedule112APayload(
  userId: string,
  fy?: string,
  portfolioId?: string,
): Promise<ExportPayload> {
  const r = portfolioId
    ? await schedule112AReport(portfolioId, fy)
    : await userSchedule112AReport(userId, fy);
  const ITR_ROWS = r.rows.map((row) => ({
    listed: 'Listed',
    category: 'Equity Shares',
    longShort: 'Long term',
    name: row.assetName,
    sale: row.sellAmount,
    cost: row.buyAmount,
    fmv: null,
    expenses: 0,
    transferDate: row.sellDate,
    acquisitionDate: row.buyDate,
    qty: row.quantity,
    sellRate: row.sellPrice,
    gain: row.gainLoss,
  }));
  return {
    title: 'Income Tax — Schedule 112A LTCG Submission',
    subtitle: fy ? `Financial Year ${fy}` : 'All financial years',
    filenameStem: `itr-schedule-112a${fy ? `-${fy}` : ''}`,
    meta: { 'Financial Year': fy ?? 'All', Section: '112A (LTCG on equity)' },
    columns: [
      { key: 'listed', header: 'Listed / Unlisted', width: 14 },
      { key: 'category', header: 'Category', width: 14 },
      { key: 'longShort', header: 'Long / Short', width: 12 },
      { key: 'name', header: 'Name of Company', width: 32 },
      { key: 'transferDate', header: 'Date of Transfer', width: 14, formatter: fmtDate },
      { key: 'acquisitionDate', header: 'Date of Acquisition', width: 14, formatter: fmtDate },
      { key: 'qty', header: 'Qty', width: 10, formatter: indianFmt },
      { key: 'sellRate', header: 'Sale Rate', width: 12, formatter: indianFmt },
      { key: 'sale', header: 'Sale Amount', width: 14, formatter: indianFmt },
      { key: 'cost', header: 'Cost of Acquisition', width: 14, formatter: indianFmt },
      { key: 'expenses', header: 'Expenses', width: 10, formatter: indianFmt },
      { key: 'gain', header: 'Gain / Loss', width: 14, formatter: indianFmt },
    ],
    rows: ITR_ROWS,
    footer: {
      'Total Sale': indianFmt(r.rows.reduce((s, x) => s.plus(x.sellAmount), new Decimal(0)).toFixed(2)),
      'Total Cost': indianFmt(r.rows.reduce((s, x) => s.plus(x.buyAmount), new Decimal(0)).toFixed(2)),
      'Total Gain': indianFmt(r.totalGain),
      'Exemption (₹1L)': indianFmt(r.exemptionLimit ?? '100000'),
      'Taxable': indianFmt(r.taxable ?? '0'),
    },
  };
}

// ─── 9. MF capital gain (short + long combined) ───────────────────

export async function buildMFCapitalGainPayload(
  userId: string,
  fy?: string,
): Promise<ExportPayload> {
  const { rows } = await computeUserCapitalGains(userId);
  const filtered = rows.filter(
    (r) =>
      (r.assetClass === 'MUTUAL_FUND' || r.assetClass === 'ETF') &&
      (!fy || r.financialYear === fy),
  );
  const totalGain = filtered.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
  const stcg = filtered
    .filter((r) => r.capitalGainType === 'SHORT_TERM')
    .reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
  const ltcg = filtered
    .filter((r) => r.capitalGainType === 'LONG_TERM')
    .reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));

  return {
    title: 'Mutual Fund Capital Gain — Short + Long Term',
    subtitle: fy ? `Financial Year ${fy}` : 'All financial years',
    filenameStem: `mf-capital-gain${fy ? `-${fy}` : ''}`,
    meta: { 'Financial Year': fy ?? 'All', 'Asset Class': 'MUTUAL_FUND + ETF' },
    columns: [
      { key: 'assetName', header: 'Script Name', width: 34 },
      { key: 'capitalGainType', header: 'Type', width: 12 },
      { key: 'buyDate', header: 'Buy Date', width: 12, formatter: fmtDate },
      { key: 'quantity', header: 'Qty', width: 10, formatter: indianFmt },
      { key: 'buyPrice', header: 'Buy Rate', width: 12, formatter: indianFmt },
      { key: 'buyAmount', header: 'Buy Amount', width: 14, formatter: indianFmt },
      { key: 'sellDate', header: 'Sell Date', width: 12, formatter: fmtDate },
      { key: 'sellPrice', header: 'Sell Rate', width: 12, formatter: indianFmt },
      { key: 'sellAmount', header: 'Sell Amount', width: 14, formatter: indianFmt },
      { key: 'gainLoss', header: 'Gain / Loss', width: 14, formatter: indianFmt },
    ],
    rows: filtered.map((r) => ({
      ...r,
      buyDate: r.buyDate.toISOString().slice(0, 10),
      sellDate: r.sellDate.toISOString().slice(0, 10),
      quantity: r.quantity.toString(),
      buyPrice: r.buyPrice.toString(),
      buyAmount: r.buyAmount.toString(),
      sellPrice: r.sellPrice.toString(),
      sellAmount: r.sellAmount.toString(),
      gainLoss: r.gainLoss.toString(),
    })),
    footer: {
      'STCG': indianFmt(stcg.toFixed(2)),
      'LTCG': indianFmt(ltcg.toFixed(2)),
      'Total': indianFmt(totalGain.toFixed(2)),
      Count: String(filtered.length),
    },
  };
}

// ─── 10. Daily transactions — broker bill register ───────────────

export async function buildDailyTransactionsPayload(
  userId: string,
  opts: { from?: string; to?: string },
): Promise<ExportPayload> {
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
  const rows = txs.map((t) => ({
    broker: t.broker ?? 'Self',
    tradeDate: t.tradeDate.toISOString().slice(0, 10),
    transactionType: t.transactionType,
    assetClass: t.assetClass,
    assetName: t.assetName ?? '—',
    isin: t.isin ?? '',
    quantity: t.quantity.toString(),
    price: t.price.toString(),
    netAmount: t.netAmount.toString(),
  }));
  const totalNet = rows.reduce(
    (s, r) => s.plus(r.netAmount),
    new Decimal(0),
  );

  return {
    title: 'Broker Bill Register — Daily Transactions',
    subtitle: `${opts.from ?? 'beginning'} → ${opts.to ?? 'today'}`,
    filenameStem: `broker-bill-register${opts.from ? `-${opts.from}` : ''}`,
    columns: [
      { key: 'broker', header: 'Broker', width: 22 },
      { key: 'tradeDate', header: 'Date', width: 12, formatter: fmtDate },
      { key: 'transactionType', header: 'Type', width: 12 },
      { key: 'assetClass', header: 'Class', width: 12 },
      { key: 'assetName', header: 'Script', width: 32 },
      { key: 'quantity', header: 'Qty', width: 10, formatter: indianFmt },
      { key: 'price', header: 'Rate', width: 12, formatter: indianFmt },
      { key: 'netAmount', header: 'Net Amount', width: 14, formatter: indianFmt },
    ],
    rows,
    footer: {
      'Transactions': String(rows.length),
      'Brokers': String(new Set(rows.map((r) => r.broker)).size),
      'Net flow': indianFmt(totalNet.toFixed(2)),
    },
  };
}

// ─── 11. Short / Long / Speculation — unified equity capital gain ─

export async function buildShortLongSpecPayload(
  userId: string,
  fy?: string,
  portfolioId?: string,
): Promise<ExportPayload> {
  const intraday = portfolioId
    ? await intradayReport(portfolioId, fy)
    : await userIntradayReport(userId, fy);
  const stcg = portfolioId ? await stcgReport(portfolioId, fy) : await userStcgReport(userId, fy);
  const ltcg = portfolioId ? await ltcgReport(portfolioId, fy) : await userLtcgReport(userId, fy);

  function mapRows(label: string, rows: typeof intraday.rows) {
    return rows.map((r) => ({
      kind: label,
      assetName: r.assetName,
      buyDate: r.buyDate.toISOString().slice(0, 10),
      sellDate: r.sellDate.toISOString().slice(0, 10),
      quantity: r.quantity.toString(),
      buyAmount: r.buyAmount.toString(),
      sellAmount: r.sellAmount.toString(),
      gainLoss: r.gainLoss.toString(),
    }));
  }
  const combined = [
    ...mapRows('Speculation (Intraday)', intraday.rows),
    ...mapRows('Short Term', stcg.rows),
    ...mapRows('Long Term', ltcg.rows),
  ];
  const totalIntra = new Decimal(intraday.totalGain);
  const totalST = new Decimal(stcg.totalGain);
  const totalLT = new Decimal(ltcg.totalGain);

  return {
    title: 'Short Term / Long Term / Speculation Report',
    subtitle: fy ? `Financial Year ${fy}` : 'All financial years',
    filenameStem: `short-long-speculation${fy ? `-${fy}` : ''}`,
    columns: [
      { key: 'kind', header: 'Bucket', width: 18 },
      { key: 'assetName', header: 'Script', width: 32 },
      { key: 'buyDate', header: 'Buy Date', width: 12, formatter: fmtDate },
      { key: 'sellDate', header: 'Sell Date', width: 12, formatter: fmtDate },
      { key: 'quantity', header: 'Qty', width: 10, formatter: indianFmt },
      { key: 'buyAmount', header: 'Buy Amount', width: 14, formatter: indianFmt },
      { key: 'sellAmount', header: 'Sell Amount', width: 14, formatter: indianFmt },
      { key: 'gainLoss', header: 'Gain / Loss', width: 14, formatter: indianFmt },
    ],
    rows: combined,
    footer: {
      Speculation: indianFmt(totalIntra.toFixed(2)),
      STCG: indianFmt(totalST.toFixed(2)),
      LTCG: indianFmt(totalLT.toFixed(2)),
      Total: indianFmt(totalIntra.plus(totalST).plus(totalLT).toFixed(2)),
    },
  };
}

// ─── 12. Income (dividends/interest/maturity) ─────────────────────

export async function buildIncomeReportPayload(
  userId: string,
  fy?: string,
  portfolioId?: string,
): Promise<ExportPayload> {
  const r = portfolioId
    ? await incomeReport(portfolioId, fy)
    : await import('../../reports.service.js').then((m) => m.userIncomeReport(userId, fy));
  return {
    title: 'Income Statement — Dividends · Interest · Maturity',
    subtitle: fy ? `Financial Year ${fy}` : 'All financial years',
    filenameStem: `income-report${fy ? `-${fy}` : ''}`,
    columns: [
      { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
      { key: 'type', header: 'Type', width: 14 },
      { key: 'assetName', header: 'Script', width: 32 },
      { key: 'amount', header: 'Amount', width: 14, formatter: indianFmt },
      { key: 'narration', header: 'Narration', width: 40 },
    ],
    rows: r.rows,
    footer: {
      Dividend: indianFmt(r.dividend),
      Interest: indianFmt(r.interest),
      Maturity: indianFmt(r.maturity),
      Total: indianFmt(r.total),
    },
  };
}
