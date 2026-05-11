import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportColumn } from '../export.service.js';
import type { BarDatum } from '../charts/pdfCharts.js';

const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: 'Equity', MUTUAL_FUND: 'Mutual Fund', ETF: 'ETF',
  FUTURES: 'Futures', OPTIONS: 'Options',
  BOND: 'Bond', GOVT_BOND: 'Govt Bond', CORPORATE_BOND: 'Corp Bond',
  FIXED_DEPOSIT: 'Fixed Deposit', RECURRING_DEPOSIT: 'Recurring Deposit',
  NPS: 'NPS', PPF: 'PPF', EPF: 'EPF', PMS: 'PMS', AIF: 'AIF',
  REIT: 'REIT', INVIT: 'InvIT',
  GOLD_BOND: 'Gold Bond', GOLD_ETF: 'Gold ETF',
  PHYSICAL_GOLD: 'Physical Gold', PHYSICAL_SILVER: 'Silver',
  ULIP: 'ULIP', INSURANCE: 'Insurance',
  REAL_ESTATE: 'Real Estate',
  CRYPTOCURRENCY: 'Crypto', ART_COLLECTIBLES: 'Art', CASH: 'Cash', OTHER: 'Other',
  NSC: 'NSC', KVP: 'KVP', SCSS: 'SCSS', SSY: 'SSY',
  POST_OFFICE_MIS: 'PO MIS', POST_OFFICE_RD: 'PO RD',
  POST_OFFICE_TD: 'PO TD', POST_OFFICE_SAVINGS: 'PO Savings',
  FOREIGN_EQUITY: 'Foreign Equity', FOREX_PAIR: 'FX Pair',
};

function labelClass(ac: string): string {
  return ASSET_CLASS_LABELS[ac] ?? ac;
}

// Friendly section title — what the user thinks of the page as
function sectionLabel(classes: AssetClass[] | undefined): string {
  if (!classes || classes.length === 0) return 'All Holdings';
  if (classes.length === 1) return labelClass(classes[0]!);
  // Common groupings:
  const set = new Set(classes);
  if (set.size === 2 && set.has('FUTURES' as AssetClass) && set.has('OPTIONS' as AssetClass)) return 'Futures & Options';
  if (set.size === 2 && set.has('FIXED_DEPOSIT' as AssetClass) && set.has('RECURRING_DEPOSIT' as AssetClass)) return 'Fixed & Recurring Deposits';
  if (set.has('PHYSICAL_GOLD' as AssetClass) || set.has('GOLD_BOND' as AssetClass) || set.has('GOLD_ETF' as AssetClass) || set.has('PHYSICAL_SILVER' as AssetClass)) return 'Gold & Silver';
  return classes.map(labelClass).join(' + ');
}

function filenameStem(classes: AssetClass[] | undefined): string {
  if (!classes || classes.length === 0) return 'portfolioos-all-holdings';
  if (classes.length === 1) return `portfolioos-${classes[0]!.toLowerCase().replace(/_/g, '-')}`;
  return `portfolioos-${classes.map(c => c.toLowerCase().replace(/_/g, '-')).join('_')}`;
}

// ─── Holdings sheet payload ──────────────────────────────────────────────────

export interface HoldingsExportParams {
  userId: string;
  portfolioIds: string[];    // empty = all portfolios owned by user
  assetClasses?: AssetClass[]; // empty = all
}

export async function buildHoldingsExport(params: HoldingsExportParams): Promise<{
  holdingsPayload: ExportPayload;
  transactionsPayload: ExportPayload;
  summaryTitle: string;
  summaryMeta: Record<string, string>;
}> {
  const { userId, portfolioIds, assetClasses } = params;

  // Resolve portfolio IDs for this user
  const allPortfolios = await prisma.portfolio.findMany({ where: { userId } });
  const resolvedIds = portfolioIds.length > 0
    ? allPortfolios.filter(p => portfolioIds.includes(p.id)).map(p => p.id)
    : allPortfolios.map(p => p.id);

  const portfolioNameMap = Object.fromEntries(allPortfolios.map(p => [p.id, p.name]));
  const portfolioLabel = resolvedIds.length === 1
    ? (portfolioNameMap[resolvedIds[0]!] ?? 'Portfolio')
    : resolvedIds.length === allPortfolios.length
      ? 'All Portfolios'
      : resolvedIds.map(id => portfolioNameMap[id] ?? id).join(', ');

  const classFilter = assetClasses && assetClasses.length > 0 ? assetClasses : undefined;
  const section     = sectionLabel(classFilter);
  const fileStem    = filenameStem(classFilter);

  // ── Holdings ────────────────────────────────────────────────────────────────
  // For FUTURES/OPTIONS: HoldingProjection is empty (F&O isn't a traditional
  // holding). Pull live derivative positions from DerivativePosition instead.
  const isFoOnly = classFilter != null
    && classFilter.length > 0
    && classFilter.every(c => c === 'FUTURES' || c === 'OPTIONS');

  let holdings: Array<{
    portfolioId:  string;
    assetClass:   string;
    assetName:    string | null;
    isin:         string | null;
    quantity:     { toString(): string };
    avgCostPrice: { toString(): string };
    currentPrice: { toString(): string } | null;
    totalCost:    { toString(): string };
    currentValue: { toString(): string } | null;
  }> = [];

  if (isFoOnly) {
    const positions = await prisma.derivativePosition.findMany({
      where: {
        portfolioId: { in: resolvedIds },
        status: 'OPEN',
        ...(classFilter.length === 1 ? { instrumentType: classFilter[0] === 'FUTURES' ? 'FUTURES' : { in: ['CALL', 'PUT'] } } : {}),
      },
      orderBy: [{ expiryDate: 'asc' }, { underlying: 'asc' }],
    });
    holdings = positions.map(p => {
      const qty   = new Decimal(p.netQuantity.toString());
      const cost  = new Decimal(p.totalCost.toString());
      const price = p.mtmPrice ? new Decimal(p.mtmPrice.toString()) : null;
      const value = price ? qty.times(price).times(p.lotSize) : null;
      const optTag = p.instrumentType === 'FUTURES'
        ? 'FUT'
        : `${p.instrumentType === 'CALL' ? 'CE' : 'PE'} ${p.strikePrice?.toString() ?? ''}`;
      const expiry = p.expiryDate.toISOString().slice(0, 10);
      return {
        portfolioId:  p.portfolioId,
        assetClass:   p.instrumentType === 'FUTURES' ? 'FUTURES' : 'OPTIONS',
        assetName:    `${p.underlying} ${optTag} ${expiry}`,
        isin:         null,
        quantity:     { toString: () => qty.toString() },
        avgCostPrice: { toString: () => p.avgEntryPrice.toString() },
        currentPrice: price ? { toString: () => price.toString() } : null,
        totalCost:    { toString: () => cost.toString() },
        currentValue: value ? { toString: () => value.toString() } : null,
      };
    });
  } else {
    holdings = await prisma.holdingProjection.findMany({
      where: {
        portfolioId: { in: resolvedIds },
        ...(classFilter ? { assetClass: { in: classFilter } } : {}),
      },
      orderBy: [{ assetClass: 'asc' }, { assetName: 'asc' }],
    });
  }

  let totalCost  = new Decimal(0);
  let totalValue = new Decimal(0);

  const holdingRows = holdings.map(h => {
    const cost  = new Decimal(h.totalCost.toString());
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : cost;
    const pnl   = value.minus(cost);
    const pct   = cost.isZero() ? '0.00' : pnl.dividedBy(cost).times(100).toFixed(2);
    totalCost  = totalCost.plus(cost);
    totalValue = totalValue.plus(value);
    return {
      portfolioName: portfolioNameMap[h.portfolioId] ?? h.portfolioId,
      assetClass:    labelClass(h.assetClass),
      assetName:     h.assetName ?? h.isin ?? '—',
      isin:          h.isin ?? '',
      quantity:      h.quantity.toString(),
      avgCostPrice:  h.avgCostPrice.toString(),
      currentPrice:  h.currentPrice?.toString() ?? '',
      totalCost:     cost.toString(),
      currentValue:  value.toString(),
      unrealisedPnL: pnl.toString(),
      pctReturn:     pct,
    };
  });

  // Money formatter for TABLE cells — no "Rs. " prefix (header gives currency).
  // Keeps cells narrow; we add Rs. back in metric cards / footers where space exists.
  const fmtMoney = (v: unknown) => v == null || v === '' ? '' : fmtNum(v);

  const holdingColumns: ExportColumn[] = [
    { key: 'portfolioName',  header: 'Portfolio',    width: 14 },
    { key: 'assetClass',     header: 'Class',        width: 10 },
    { key: 'assetName',      header: 'Name',         width: 26 },
    { key: 'isin',           header: 'ISIN',         width: 12 },
    { key: 'quantity',       header: 'Qty',          width: 10, formatter: v => fmtNum(v, 4) },
    { key: 'avgCostPrice',   header: 'Avg Cost (Rs.)', width: 12, formatter: fmtMoney },
    { key: 'currentPrice',   header: 'CMP (Rs.)',      width: 12, formatter: fmtMoney },
    { key: 'totalCost',      header: 'Invested (Rs.)', width: 16, formatter: fmtMoney },
    { key: 'currentValue',   header: 'Value (Rs.)',    width: 16, formatter: fmtMoney },
    { key: 'unrealisedPnL',  header: 'P&L (Rs.)',      width: 14, formatter: fmtMoney },
    { key: 'pctReturn',      header: '% Rtn',          width: 8,  formatter: v => `${v}%` },
  ];

  const totalPnl = totalValue.minus(totalCost);

  // Top-10 holdings by current value — for bar chart
  const chartRows: BarDatum[] = holdingRows
    .map(r => ({ label: r.assetName, value: parseFloat(r.currentValue) }))
    .filter(r => isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const todayStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  // ── Transactions ─────────────────────────────────────────────────────────────
  const txns = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: resolvedIds },
      ...(classFilter ? { assetClass: { in: classFilter } } : {}),
    },
    orderBy: { tradeDate: 'desc' },
    take: 2000,
  });

  const txnColumns: ExportColumn[] = [
    { key: 'portfolioName',     header: 'Portfolio',   width: 14 },
    { key: 'tradeDate',         header: 'Date',        width: 12, formatter: fmtDate },
    { key: 'assetClass',        header: 'Class',       width: 12 },
    { key: 'assetName',         header: 'Asset',       width: 28 },
    { key: 'transactionType',   header: 'Type',        width: 12 },
    { key: 'quantity',          header: 'Qty',         width: 10, formatter: v => fmtNum(v, 4) },
    { key: 'price',             header: 'Price (Rs.)',     width: 12, formatter: fmtMoney },
    { key: 'netAmount',         header: 'Net Amount (Rs.)', width: 18, formatter: fmtMoney },
    { key: 'broker',            header: 'Broker',      width: 14 },
    { key: 'narration',         header: 'Narration',   width: 22 },
  ];

  const txnRows = txns.map(t => ({
    portfolioName:   portfolioNameMap[t.portfolioId] ?? t.portfolioId,
    tradeDate:       t.tradeDate,
    assetClass:      labelClass(t.assetClass),
    assetName:       t.assetName ?? t.isin ?? '—',
    transactionType: t.transactionType,
    quantity:        t.quantity.toString(),
    price:           t.price?.toString() ?? '',
    netAmount:       t.netAmount.toString(),
    broker:          t.broker ?? '',
    narration:       t.narration ?? '',
  }));

  const additionalSections: NonNullable<ExportPayload['additionalSections']> = [];
  let footerOverride: Record<string, string> | null = null;
  let metaOverride: Record<string, string> = {
    Portfolio: portfolioLabel,
    Section: section,
    Holdings: String(holdings.length),
    Transactions: String(txns.length),
  };

  // ────────────────────────────────────────────────────────────────────
  // F&O-SPECIFIC SECTIONS: closed positions, realised P&L by FY, tax buckets
  // ────────────────────────────────────────────────────────────────────
  if (isFoOnly && resolvedIds.length > 0) {
    // Closed positions
    const closedPositions = await prisma.derivativePosition.findMany({
      where: { portfolioId: { in: resolvedIds }, status: 'CLOSED' },
      orderBy: [{ closedAt: 'desc' }],
    });

    const closedRows = closedPositions.map(p => {
      const tag = p.instrumentType === 'FUTURES'
        ? 'FUT'
        : `${p.instrumentType === 'CALL' ? 'CE' : 'PE'} ${p.strikePrice?.toString() ?? ''}`;
      return {
        portfolioName: portfolioNameMap[p.portfolioId] ?? p.portfolioId,
        instrument:    `${p.underlying} ${tag}`,
        expiryDate:    p.expiryDate.toISOString().slice(0, 10),
        closedAt:      p.closedAt?.toISOString().slice(0, 10) ?? '',
        closeReason:   p.closeReason ?? '',
        avgEntryPrice: p.avgEntryPrice.toString(),
        settlementPrice: p.settlementPrice?.toString() ?? '',
        realizedPnl:   p.realizedPnl.toString(),
      };
    });

    if (closedRows.length > 0) {
      additionalSections.push({
        title: `Closed Positions (${closedRows.length})`,
        columns: [
          { key: 'portfolioName',   header: 'Portfolio',     width: 14 },
          { key: 'instrument',      header: 'Instrument',    width: 22 },
          { key: 'expiryDate',      header: 'Expiry',        width: 12 },
          { key: 'closedAt',        header: 'Closed On',     width: 12 },
          { key: 'closeReason',     header: 'Close Reason',  width: 14 },
          { key: 'avgEntryPrice',   header: 'Avg Entry (Rs.)',    width: 14, formatter: fmtMoney },
          { key: 'settlementPrice', header: 'Settlement (Rs.)',   width: 14, formatter: fmtMoney },
          { key: 'realizedPnl',     header: 'Realised P&L (Rs.)', width: 16, formatter: fmtMoney },
        ],
        rows: closedRows,
        emptyMessage: 'No closed positions.',
      });
    }

    // Realised P&L per asset key by FY + Tax bucket summary
    const { computePortfolioFoPnl } = await import('../foPnl.service.js');
    const foRows: Array<Record<string, unknown>> = [];
    let totalRealised = new Decimal(0);
    let specPnl = new Decimal(0);
    let nonSpecPnl = new Decimal(0);
    let totalTurnover = new Decimal(0);
    const fySummary = new Map<string, { spec: Decimal; nonSpec: Decimal; total: Decimal; turnover: Decimal; trades: number }>();

    for (const pid of resolvedIds) {
      try {
        const fo = await computePortfolioFoPnl(pid);
        const pName = portfolioNameMap[pid] ?? pid;
        fo.rows.forEach(r => {
          foRows.push({ portfolioName: pName, ...r });
          const pnl = new Decimal(r.realizedPnl);
          totalRealised = totalRealised.plus(pnl);
          if (r.taxBucket === 'SPECULATIVE') specPnl = specPnl.plus(pnl);
          else nonSpecPnl = nonSpecPnl.plus(pnl);
          totalTurnover = totalTurnover.plus(new Decimal(r.turnover));

          const exist = fySummary.get(r.financialYear) ?? { spec: new Decimal(0), nonSpec: new Decimal(0), total: new Decimal(0), turnover: new Decimal(0), trades: 0 };
          if (r.taxBucket === 'SPECULATIVE') exist.spec = exist.spec.plus(pnl);
          else exist.nonSpec = exist.nonSpec.plus(pnl);
          exist.total = exist.total.plus(pnl);
          exist.turnover = exist.turnover.plus(new Decimal(r.turnover));
          exist.trades += r.closedTradeCount;
          fySummary.set(r.financialYear, exist);
        });
      } catch { /* portfolio may have no F&O */ }
    }

    if (foRows.length > 0) {
      additionalSections.push({
        title: 'Realised F&O P&L (per instrument, per FY)',
        columns: [
          { key: 'portfolioName',    header: 'Portfolio',     width: 14 },
          { key: 'financialYear',    header: 'FY',            width: 8 },
          { key: 'underlying',       header: 'Underlying',    width: 14 },
          { key: 'instrumentType',   header: 'Type',          width: 8 },
          { key: 'strikePrice',      header: 'Strike',        width: 10, formatter: v => v ? fmtNum(v) : '' },
          { key: 'expiryDate',       header: 'Expiry',        width: 12 },
          { key: 'taxBucket',        header: 'Tax Bucket',    width: 14 },
          { key: 'closedTradeCount', header: 'Trades',        width: 8 },
          { key: 'turnover',         header: 'Turnover (Rs.)',      width: 16, formatter: fmtMoney },
          { key: 'realizedPnl',      header: 'Realised P&L (Rs.)',  width: 16, formatter: fmtMoney },
        ],
        rows: foRows,
        emptyMessage: 'No closed F&O trades.',
      });

      // Tax bucket summary by FY
      const taxRows = Array.from(fySummary.entries())
        .sort(([a], [b]) => a > b ? -1 : 1)
        .map(([fy, v]) => ({
          fy,
          speculative:    v.spec.toString(),
          nonSpeculative: v.nonSpec.toString(),
          total:          v.total.toString(),
          turnover:       v.turnover.toString(),
          trades:         v.trades,
        }));
      additionalSections.push({
        title: 'Tax Summary by Financial Year (§43(5) classification)',
        columns: [
          { key: 'fy',             header: 'FY',                     width: 10 },
          { key: 'trades',         header: 'Closed Trades',          width: 12 },
          { key: 'turnover',       header: 'Turnover ICAI (Rs.)',        width: 18, formatter: fmtMoney },
          { key: 'speculative',    header: 'Speculative P&L (Rs.)',      width: 18, formatter: fmtMoney },
          { key: 'nonSpeculative', header: 'Non-Spec. P&L (Rs.)',        width: 18, formatter: fmtMoney },
          { key: 'total',          header: 'Total Realised (Rs.)',       width: 16, formatter: fmtMoney },
        ],
        rows: taxRows,
        emptyMessage: 'No tax data.',
      });
    }

    // Override F&O footer with realized P&L (matches app's KPI cards)
    metaOverride['Closed Positions'] = String(closedPositions.length);
    metaOverride['Closed Trades']    = String(foRows.length);
    footerOverride = {
      'Open Positions':   String(holdings.length),
      'Realised P&L':     `${totalRealised.isNegative() ? '' : '+'}Rs. ${fmtNum(totalRealised.toString())}`,
      'Unrealised P&L':   `${totalPnl.isNegative() ? '' : '+'}Rs. ${fmtNum(totalPnl.toString())}`,
      'Total Turnover':   `Rs. ${fmtNum(totalTurnover.toString())}`,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // CAPITAL GAINS section — for non-F&O classes (equity, MF, ETF, bonds...)
  // ────────────────────────────────────────────────────────────────────
  if (!isFoOnly && resolvedIds.length > 0) {
    try {
      const { computePortfolioCapitalGains } = await import('../capitalGains.service.js');
      const cgRows: Array<Record<string, unknown>> = [];
      for (const pid of resolvedIds) {
        try {
          const { rows } = await computePortfolioCapitalGains(pid);
          const filtered = classFilter
            ? rows.filter(r => classFilter.includes(r.assetClass as AssetClass))
            : rows;
          filtered.forEach(r => cgRows.push({
            portfolioName: portfolioNameMap[pid] ?? pid,
            assetName:     r.assetName ?? r.isin ?? '—',
            buyDate:       r.buyDate,
            sellDate:      r.sellDate,
            quantity:      r.quantity.toString(),
            buyAmount:     r.buyAmount.toString(),
            sellAmount:    r.sellAmount.toString(),
            type:          r.capitalGainType,
            gainLoss:      r.gainLoss.toString(),
            taxableGain:   r.taxableGain.toString(),
            financialYear: r.financialYear,
          }));
        } catch { /* no CG for this portfolio */ }
      }
      if (cgRows.length > 0) {
        additionalSections.push({
          title: `Realised Capital Gains (${cgRows.length} matched trades)`,
          columns: [
            { key: 'portfolioName', header: 'Portfolio',   width: 14 },
            { key: 'financialYear', header: 'FY',          width: 8 },
            { key: 'type',          header: 'Type',        width: 10 },
            { key: 'assetName',     header: 'Asset',       width: 24 },
            { key: 'buyDate',       header: 'Buy Date',    width: 12, formatter: fmtDate },
            { key: 'sellDate',      header: 'Sell Date',   width: 12, formatter: fmtDate },
            { key: 'quantity',      header: 'Qty',         width: 10, formatter: v => fmtNum(v, 4) },
            { key: 'buyAmount',     header: 'Cost (Rs.)',        width: 14, formatter: fmtMoney },
            { key: 'sellAmount',    header: 'Proceeds (Rs.)',    width: 14, formatter: fmtMoney },
            { key: 'gainLoss',      header: 'Gain/Loss (Rs.)',   width: 14, formatter: fmtMoney },
            { key: 'taxableGain',   header: 'Taxable (Rs.)',     width: 14, formatter: fmtMoney },
          ],
          rows: cgRows,
          emptyMessage: 'No realised gains.',
        });
      }
    } catch { /* CG service may fail for non-applicable asset classes */ }
  }

  // ────────────────────────────────────────────────────────────────────
  // INCOME section — dividends, interest, maturity for this asset class
  // ────────────────────────────────────────────────────────────────────
  const incomeTypes = ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY'] as const;
  const incomeTxns = txns.filter(t => (incomeTypes as readonly string[]).includes(t.transactionType));
  if (incomeTxns.length > 0) {
    const incomeRows = incomeTxns.map(t => ({
      portfolioName: portfolioNameMap[t.portfolioId] ?? t.portfolioId,
      tradeDate:     t.tradeDate,
      type:          t.transactionType,
      assetName:     t.assetName ?? t.isin ?? '—',
      amount:        t.netAmount.toString(),
      narration:     t.narration ?? '',
    }));
    additionalSections.push({
      title: `Income Received (${incomeTxns.length} entries)`,
      columns: [
        { key: 'portfolioName', header: 'Portfolio', width: 14 },
        { key: 'tradeDate',     header: 'Date',      width: 12, formatter: fmtDate },
        { key: 'type',          header: 'Type',      width: 16 },
        { key: 'assetName',     header: 'Asset',     width: 28 },
        { key: 'amount',        header: 'Amount (Rs.)', width: 14, formatter: fmtMoney },
        { key: 'narration',     header: 'Narration', width: 24 },
      ],
      rows: incomeRows,
      emptyMessage: 'No income received.',
    });
  }

  // Transaction tape — always last, always full data
  additionalSections.push({
    title: `Transaction Tape (${txns.length} entries)`,
    columns: txnColumns,
    rows: txnRows,
    emptyMessage: 'No transactions recorded.',
  });

  const holdingsPayload: ExportPayload = {
    title: `${section} Report`,
    subtitle: `${portfolioLabel}  ·  ${todayStr}`,
    filenameStem: fileStem,
    meta: metaOverride,
    mainSectionLabel: isFoOnly ? `Open Positions (${holdings.length})` : `Current Holdings (${holdings.length})`,
    columns: holdingColumns,
    rows: holdingRows,
    footer: footerOverride ?? {
      'Total Invested': `Rs. ${fmtNum(totalCost.toString())}`,
      'Current Value':  `Rs. ${fmtNum(totalValue.toString())}`,
      'Unrealised P&L': `${totalPnl.isNegative() ? '' : '+'}Rs. ${fmtNum(totalPnl.toString())}`,
      'Return %':       totalCost.isZero() ? '—' : `${totalPnl.dividedBy(totalCost).times(100).toFixed(2)}%`,
    },
    chartRows,
    chartTitle: `Top ${chartRows.length} holdings by current value`,
    additionalSections,
  };

  // Standalone transactions payload — still used by Excel export (2nd sheet)
  const transactionsPayload: ExportPayload = {
    title: `${section} Transactions`,
    subtitle: `${portfolioLabel}  ·  ${todayStr}`,
    filenameStem: `${fileStem}-transactions`,
    meta: {
      Portfolio: portfolioLabel,
      Section: section,
      Transactions: String(txns.length),
    },
    columns: txnColumns,
    rows: txnRows,
  };

  return {
    holdingsPayload,
    transactionsPayload,
    summaryTitle: `${section} Report`,
    summaryMeta: {
      Portfolio: portfolioLabel,
      'Total Holdings': String(holdings.length),
      'Total Transactions': String(txns.length),
      'Invested': `Rs. ${fmtNum(totalCost.toString())}`,
      'Current Value': `Rs. ${fmtNum(totalValue.toString())}`,
      'Unrealised P&L': `Rs. ${fmtNum(totalValue.minus(totalCost).toString())}`,
    },
  };
}
