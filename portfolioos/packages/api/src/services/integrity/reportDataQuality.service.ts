/**
 * Can the numbers in a report be trusted right now — and if not, why not?
 *
 * Reports are computed live from what is stored, so they are exactly as good
 * as the stored data. They used to print totals whatever state that data was
 * in: a sale with no purchase behind it, a holding with no price, a statement
 * that disagreed with the transactions, an import still waiting for review —
 * all produced a confident-looking figure. This check runs before (or beside)
 * a report and lists every such gap, so the report can say so instead.
 *
 * Severity:
 *   error   — a figure in the report is wrong or incomplete because of this.
 *   warning — figures are computed, but on data that may be out of date or
 *             not yet complete.
 *
 * Nothing here repairs anything; it only reads. Must run in the subject
 * user's request context (RLS).
 */

import { Decimal } from 'decimal.js';
import type { AssetClass, Transaction } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  computePortfolioCapitalGains,
  computeUserCapitalGains,
  type CapitalGainRow,
} from '../tax/capitalGains.service.js';
import { expectedProjections } from '../holdings/holdingsProjection.js';
import { hasMarketPrice, isPriceStale } from '../holdings/priceStaleness.js';
import { compareHoldings, type HoldingDrift } from './storedDataIntegrity.service.js';
import { findStatementMismatches } from './statementReconciliation.service.js';

export type DataQualityCode =
  | 'OVERSOLD'
  | 'GAINS_NEED_REVIEW'
  | 'MISSING_PRICE'
  | 'STALE_PRICE'
  | 'SUSPICIOUS_PRICE'
  | 'TRADE_PRICE_OFF_MARKET'
  | 'HOLDINGS_OUT_OF_SYNC'
  | 'STATEMENT_MISMATCH'
  | 'IMPORTS_NOT_FINISHED'
  | 'EVENTS_AWAITING_REVIEW'
  | 'UNRESOLVED_FAILURES';

/**
 * What the user can do about one item. The app never invents the missing
 * data: it points at the real source when one exists (an email purchase
 * awaiting review), and otherwise opens the entry form with everything it
 * already knows filled in.
 */
export type DataQualityAction =
  | {
      kind: 'ADD_PURCHASE';
      portfolioId: string;
      assetClass: string;
      assetName: string;
      symbol: string | null;
      isin: string | null;
      quantity: string;
      /** The purchase must be on or before this date (the sale's). */
      onOrBefore: string;
    }
  | { kind: 'REVIEW_EVENTS'; count: number };

export interface DataQualityItem {
  label: string;
  detail?: string;
  action?: DataQualityAction;
}

export interface DataQualityIssue {
  code: DataQualityCode;
  severity: 'error' | 'warning';
  /** 'portfolio' issues follow the portfolio filter; 'account' ones are user-wide. */
  scope: 'portfolio' | 'account';
  count: number;
  message: string;
  /** Up to MAX_ITEMS examples, so the user can find and fix them. */
  items: DataQualityItem[];
  /** Examples left out of `items` by the MAX_ITEMS cap. */
  moreItems: number;
}

export interface DataAsOf {
  /** Most recent trade date in scope, YYYY-MM-DD. */
  lastTransactionDate: string | null;
  /** When the most recent import finished. ISO timestamp. */
  lastImportAt: string | null;
  /** Oldest and newest market-price dates among the holdings in scope. */
  oldestPriceDate: string | null;
  newestPriceDate: string | null;
}

export interface DataQualityReport {
  ok: boolean;
  checkedAt: string;
  dataAsOf: DataAsOf;
  errorCount: number;
  warningCount: number;
  issues: DataQualityIssue[];
}

const MAX_ITEMS = 20;

/**
 * Failures logged by reference-data jobs (AMFI scheme master, MF analytics,
 * benchmark and risk-free rates, loan rates). They share the IngestionFailure
 * table and are attributed to an admin, but they are not the user's data:
 * counting them told an admin that tens of thousands of their own rows were
 * missing. A new reference-data job must use one of these prefixes —
 * test/integrity/pureChecks.test.ts holds every existing job id to it.
 */
export const REFERENCE_DATA_ADAPTER_PREFIXES = ['amfi.', 'mf.', 'mfapi.', 'fbil.', 'loanrates.'];

export function isReferenceDataAdapter(sourceAdapter: string): boolean {
  return REFERENCE_DATA_ADAPTER_PREFIXES.some((p) => sourceAdapter.startsWith(p));
}

function driftDetail(d: HoldingDrift): string {
  if (d.kind === 'COST') {
    return `transactions say cost ${d.expected?.totalCost}, saved holding says ${d.stored?.totalCost}`;
  }
  if (d.kind === 'MISSING') return `transactions say ${d.expected?.quantity} units, but no holding is saved`;
  if (d.kind === 'UNEXPECTED') return `a holding of ${d.stored?.quantity} units is saved, but the transactions add up to none`;
  return `transactions say ${d.expected?.quantity} units, saved holding says ${d.stored?.quantity}`;
}
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function checkReportDataQuality(
  userId: string,
  portfolioId?: string,
): Promise<DataQualityReport> {
  const txWhere = portfolioId ? { portfolioId } : { portfolio: { userId } };

  const [gains, txs, holdings, statementGaps, openImports, lastImport, awaitingEvents, failures] =
    await Promise.all([
      portfolioId ? computePortfolioCapitalGains(portfolioId) : computeUserCapitalGains(userId),
      prisma.transaction.findMany({ where: txWhere, orderBy: { tradeDate: 'asc' } }),
      prisma.holdingProjection.findMany({
        where: portfolioId ? { portfolioId } : { portfolio: { userId } },
        select: {
          portfolioId: true,
          assetKey: true,
          assetClass: true,
          assetName: true,
          stockId: true,
          fundId: true,
          quantity: true,
          totalCost: true,
          currentValue: true,
          priceAsOf: true,
        },
      }),
      findStatementMismatches(userId),
      prisma.importJob.findMany({
        where: { userId, status: { in: ['PENDING', 'PROCESSING', 'NEEDS_PASSWORD', 'FAILED'] } },
        select: { fileName: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.importJob.findFirst({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
      prisma.canonicalEvent.count({
        where: { userId, status: { in: ['PARSED', 'PENDING_REVIEW', 'CONFIRMED', 'ARCHIVED'] } },
      }),
      prisma.ingestionFailure.groupBy({
        by: ['sourceAdapter'],
        where: {
          userId,
          resolvedAt: null,
          NOT: REFERENCE_DATA_ADAPTER_PREFIXES.map((p) => ({ sourceAdapter: { startsWith: p } })),
        },
        _count: { _all: true },
      }),
    ]);

  const issues: DataQualityIssue[] = [];
  const push = (issue: Omit<DataQualityIssue, 'moreItems'>) => {
    if (issue.count > 0) {
      issues.push({
        ...issue,
        items: issue.items.slice(0, MAX_ITEMS),
        moreItems: Math.max(0, issue.items.length - MAX_ITEMS),
      });
    }
  };

  // 1. Sales with no purchase behind them. The engine books these at nil cost
  //    (so tax is not understated) and marks the row with buy === sell.
  const oversold = gains.rows.filter((r) => r.buyTransactionId === r.sellTransactionId);
  const oversoldActions = await oversoldActionsFor(userId, oversold, txs);
  push({
    code: 'OVERSOLD',
    severity: 'error',
    scope: 'portfolio',
    count: oversold.length,
    message:
      'Some sales are for more units than were ever bought. They are shown at zero cost, so gains are overstated until the missing purchases are added.',
    items: oversold.map((r, i) => ({
      label: r.assetName,
      detail: `${r.quantity.toString()} units sold on ${day(r.sellDate)} with no matching purchase`,
      action: oversoldActions[i],
    })),
  });

  // 2. Other gain rows the engine itself is unsure of (missing CII year,
  //    missing FX rate, …). Exclude the oversold rows already reported.
  const review = gains.rows.filter((r) => r.needsReview && r.buyTransactionId !== r.sellTransactionId);
  push({
    code: 'GAINS_NEED_REVIEW',
    severity: 'warning',
    scope: 'portfolio',
    count: review.length,
    message: 'Some capital-gain figures were computed with a missing input and should be checked.',
    items: review.map((r) => ({ label: r.assetName, detail: r.reviewReason ?? undefined })),
  });

  // 3 & 4. Prices: none at all, or out of date.
  const now = new Date();
  const market = holdings.filter((h) => hasMarketPrice(h.assetClass as AssetClass));
  const unpriced = market.filter((h) => h.currentValue === null);
  push({
    code: 'MISSING_PRICE',
    severity: 'error',
    scope: 'portfolio',
    count: unpriced.length,
    message: 'Some holdings have no price. They are valued at what you paid for them, so current value and unrealised gain are not real figures for them.',
    items: unpriced.map((h) => ({ label: h.assetName ?? h.assetKey })),
  });
  const stale = market.filter(
    (h) => h.currentValue !== null && isPriceStale(h.assetClass as AssetClass, h.priceAsOf, now),
  );
  push({
    code: 'STALE_PRICE',
    severity: 'warning',
    scope: 'portfolio',
    count: stale.length,
    message: 'Some holdings are valued at an old price.',
    items: stale.map((h) => ({
      label: h.assetName ?? h.assetKey,
      detail: h.priceAsOf ? `price from ${day(h.priceAsOf)}` : 'price date unknown',
    })),
  });

  // 4b. Price feed sanity: the latest price far from the one before it, with
  //     no split or bonus to explain it — a feed error values the holding
  //     wrong in every report. 4c. A trade far from that day's market price
  //     — usually a typo or a misread figure.
  const priceChecks = await priceSanity(holdings, txs, now);
  push({
    code: 'SUSPICIOUS_PRICE',
    severity: 'warning',
    scope: 'portfolio',
    count: priceChecks.suspicious.length,
    message:
      'Some holdings are valued at a price that moved sharply from the day before, with no split or bonus to explain it. The price feed may be wrong.',
    items: priceChecks.suspicious,
  });
  push({
    code: 'TRADE_PRICE_OFF_MARKET',
    severity: 'warning',
    scope: 'portfolio',
    count: priceChecks.offMarket.length,
    message:
      "Some trades are at a price far from that day's market price. Check them for a typing or reading mistake.",
    items: priceChecks.offMarket,
  });

  // 5. Stored holdings that no longer follow from the transactions.
  const byPortfolio = new Map<string, typeof txs>();
  for (const tx of txs) {
    const list = byPortfolio.get(tx.portfolioId);
    if (list) list.push(tx);
    else byPortfolio.set(tx.portfolioId, [tx]);
  }
  const drifts = [];
  const portfolioIds = new Set([...byPortfolio.keys(), ...holdings.map((h) => h.portfolioId)]);
  for (const pid of portfolioIds) {
    drifts.push(
      ...compareHoldings(
        expectedProjections(byPortfolio.get(pid) ?? []),
        holdings.filter((h) => h.portfolioId === pid),
      ),
    );
  }
  const nameOf = new Map(holdings.map((h) => [h.assetKey, h.assetName]));
  push({
    code: 'HOLDINGS_OUT_OF_SYNC',
    severity: 'error',
    scope: 'portfolio',
    count: drifts.length,
    message:
      'Some saved holdings do not match the transactions they come from. They are rebuilt automatically every night, or use Fix now to rebuild them immediately.',
    items: drifts.map((d) => ({
      label: nameOf.get(d.assetKey) ?? d.assetKey,
      detail: driftDetail(d),
    })),
  });

  // 6. The investor's own statement disagrees with the transactions.
  push({
    code: 'STATEMENT_MISMATCH',
    severity: 'error',
    scope: 'account',
    count: statementGaps.length,
    message:
      'Your latest statement shows a different number of units than your transactions add up to. Some transactions are missing or were added twice.',
    items: statementGaps.map((g) => ({
      label: g.schemeName ?? g.isin,
      detail: `statement (${g.statementDate}): ${g.statementUnits} units, transactions: ${g.appUnits} units`,
    })),
  });

  // 7–9. Data that has not arrived yet.
  push({
    code: 'IMPORTS_NOT_FINISHED',
    severity: 'warning',
    scope: 'account',
    count: openImports.length,
    message: 'Some uploaded files have not been imported (still running, need a password, or failed).',
    items: openImports.map((j) => ({ label: j.fileName, detail: j.status.replace(/_/g, ' ').toLowerCase() })),
  });
  push({
    code: 'EVENTS_AWAITING_REVIEW',
    severity: 'warning',
    scope: 'account',
    count: awaitingEvents,
    message: 'Some transactions found in your email are waiting for your review and are not in reports yet.',
    items: [],
  });
  const failureGroups = [...failures].sort((a, b) => b._count._all - a._count._all);
  push({
    code: 'UNRESOLVED_FAILURES',
    severity: 'warning',
    scope: 'account',
    count: failureGroups.reduce((s, g) => s + g._count._all, 0),
    message: 'Some imported files, emails or rows could not be processed and were left out.',
    items: failureGroups.map((g) => ({ label: g.sourceAdapter, detail: `${g._count._all} unresolved` })),
  });

  const priceDates = market
    .map((h) => h.priceAsOf)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return {
    ok: issues.length === 0,
    checkedAt: now.toISOString(),
    dataAsOf: {
      lastTransactionDate: txs.length ? day(txs[txs.length - 1]!.tradeDate) : null,
      lastImportAt: lastImport?.completedAt?.toISOString() ?? null,
      oldestPriceDate: priceDates.length ? day(new Date(Math.min(...priceDates))) : null,
      newestPriceDate: priceDates.length ? day(new Date(Math.max(...priceDates))) : null,
    },
    errorCount,
    warningCount: issues.length - errorCount,
    issues,
  };
}

/**
 * Two lines for the header of a downloaded report: when the data is from,
 * and whether it passed the checks. A file outlives the screen it was made
 * on, so it has to carry its own caveats.
 */
export function dataQualityMetaLines(q: DataQualityReport): Array<{ label: string; value: string }> {
  const asOf = [
    q.dataAsOf.lastTransactionDate ? `transactions to ${q.dataAsOf.lastTransactionDate}` : null,
    q.dataAsOf.newestPriceDate ? `prices to ${q.dataAsOf.newestPriceDate}` : null,
  ].filter(Boolean);
  const checks = q.ok
    ? 'All checks passed'
    : [
        q.errorCount ? `${q.errorCount} problem(s) affect these figures` : null,
        q.warningCount ? `${q.warningCount} warning(s)` : null,
      ]
        .filter(Boolean)
        .join(', ') + ' — see Reports page';
  return [
    { label: 'Data as of', value: asOf.length ? asOf.join(', ') : 'no data' },
    { label: 'Data checks', value: checks },
  ];
}

/**
 * For each sale with no purchase behind it: is the purchase already in the
 * app, waiting? An email-parsed BUY of the same instrument on or before the
 * sale, not yet turned into a transaction, is the real data — point at it.
 * Otherwise offer the entry form, pre-filled.
 */
async function oversoldActionsFor(
  userId: string,
  rows: CapitalGainRow[],
  txs: Transaction[],
): Promise<DataQualityAction[]> {
  if (rows.length === 0) return [];
  const byId = new Map(txs.map((t) => [t.id, t]));
  const sells = rows.map((r) => byId.get(r.sellTransactionId));
  const stockIds = [...new Set(sells.map((t) => t?.stockId).filter((s): s is string => Boolean(s)))];
  const isins = [...new Set(rows.map((r) => r.isin).filter((s): s is string => Boolean(s)))];
  const [stocks, waiting] = await Promise.all([
    stockIds.length
      ? prisma.stockMaster.findMany({ where: { id: { in: stockIds } }, select: { id: true, symbol: true } })
      : Promise.resolve([]),
    isins.length
      ? prisma.canonicalEvent.findMany({
          where: {
            userId,
            eventType: 'BUY',
            instrumentIsin: { in: isins },
            status: { in: ['PARSED', 'PENDING_REVIEW', 'CONFIRMED'] },
          },
          select: { instrumentIsin: true, eventDate: true },
        })
      : Promise.resolve([]),
  ]);
  const symbolOf = new Map(stocks.map((s) => [s.id, s.symbol]));

  return rows.map((r, i) => {
    const matching = waiting.filter(
      (e) => e.instrumentIsin === r.isin && e.eventDate.getTime() <= r.sellDate.getTime(),
    ).length;
    if (matching > 0) return { kind: 'REVIEW_EVENTS', count: matching };
    const sell = sells[i];
    return {
      kind: 'ADD_PURCHASE',
      portfolioId: r.portfolioId,
      assetClass: r.assetClass,
      assetName: r.assetName,
      symbol: sell?.stockId ? symbolOf.get(sell.stockId) ?? null : null,
      isin: r.isin,
      quantity: r.quantity.toString(),
      onOrBefore: day(r.sellDate)!,
    };
  });
}

/** A move this large in one step, with no corporate action, is suspect. */
const STOCK_JUMP = new Decimal('0.40');
const NAV_JUMP = new Decimal('0.20');
/** A trade this far from the day's close / NAV is probably mistyped or misread. */
const OFF_MARKET = new Decimal('0.25');
const TRADE_TYPES = new Set(['BUY', 'SELL']);
const CORPORATE_TYPES = new Set(['SPLIT', 'BONUS', 'MERGER_IN', 'MERGER_OUT', 'DEMERGER_IN', 'DEMERGER_OUT']);
const DAY_MS = 24 * 60 * 60 * 1000;

function relDiff(a: Decimal, b: Decimal): Decimal {
  return b.isZero() ? new Decimal(0) : a.minus(b).abs().dividedBy(b);
}

async function priceSanity(
  holdings: Array<{ assetKey: string; assetName: string | null; stockId?: string | null; fundId?: string | null }>,
  txs: Transaction[],
  now: Date,
): Promise<{ suspicious: DataQualityItem[]; offMarket: DataQualityItem[] }> {
  // Assets with a split/bonus/merger: their price history is adjusted around
  // it, so a jump there, and any older trade price, are expected to differ.
  const corporateDates = new Map<string, Date[]>();
  for (const tx of txs) {
    if (!CORPORATE_TYPES.has(tx.transactionType)) continue;
    const id = tx.stockId ?? tx.fundId;
    if (!id) continue;
    corporateDates.set(id, [...(corporateDates.get(id) ?? []), tx.tradeDate]);
  }
  const nearAction = (id: string, d: Date) =>
    (corporateDates.get(id) ?? []).some((c) => Math.abs(c.getTime() - d.getTime()) <= 5 * DAY_MS);
  const actionAfter = (id: string, d: Date) =>
    (corporateDates.get(id) ?? []).some((c) => c.getTime() >= d.getTime());

  const suspicious: DataQualityItem[] = [];
  for (const h of holdings) {
    const rows = h.stockId
      ? (await prisma.stockPrice.findMany({ where: { stockId: h.stockId }, orderBy: { date: 'desc' }, take: 2, select: { date: true, close: true } })).map((r) => ({ date: r.date, v: new Decimal(r.close.toString()) }))
      : h.fundId
        ? (await prisma.mFNav.findMany({ where: { fundId: h.fundId }, orderBy: { date: 'desc' }, take: 2, select: { date: true, nav: true } })).map((r) => ({ date: r.date, v: new Decimal(r.nav.toString()) }))
        : [];
    if (rows.length < 2) continue;
    const [latest, prev] = rows as [{ date: Date; v: Decimal }, { date: Date; v: Decimal }];
    const id = (h.stockId ?? h.fundId)!;
    const limit = h.stockId ? STOCK_JUMP : NAV_JUMP;
    if (relDiff(latest.v, prev.v).greaterThan(limit) && !nearAction(id, latest.date)) {
      suspicious.push({
        label: h.assetName ?? h.assetKey,
        detail: `${prev.v.toString()} on ${day(prev.date)} → ${latest.v.toString()} on ${day(latest.date)}`,
      });
    }
  }

  // Trades in the last year with a known market price that day.
  const since = new Date(now.getTime() - 365 * DAY_MS);
  const recent = txs.filter(
    (t) => TRADE_TYPES.has(t.transactionType) && t.tradeDate >= since && (t.stockId || t.fundId),
  );
  const offMarket: DataQualityItem[] = [];
  if (recent.length > 0) {
    const stockIds = [...new Set(recent.map((t) => t.stockId).filter((s): s is string => Boolean(s)))];
    const fundIds = [...new Set(recent.map((t) => t.fundId).filter((s): s is string => Boolean(s)))];
    const [closes, navs] = await Promise.all([
      stockIds.length
        ? prisma.stockPrice.findMany({ where: { stockId: { in: stockIds }, date: { gte: since } }, select: { stockId: true, date: true, close: true } })
        : Promise.resolve([]),
      fundIds.length
        ? prisma.mFNav.findMany({ where: { fundId: { in: fundIds }, date: { gte: since } }, select: { fundId: true, date: true, nav: true } })
        : Promise.resolve([]),
    ]);
    const market = new Map<string, Decimal>();
    for (const c of closes) market.set(`${c.stockId}|${day(c.date)}`, new Decimal(c.close.toString()));
    for (const n of navs) market.set(`${n.fundId}|${day(n.date)}`, new Decimal(n.nav.toString()));
    for (const t of recent) {
      const id = (t.stockId ?? t.fundId)!;
      if (actionAfter(id, t.tradeDate)) continue; // history adjusted since
      const m = market.get(`${id}|${day(t.tradeDate)}`);
      const p = new Decimal(t.price.toString());
      if (!m || p.isZero()) continue;
      if (relDiff(p, m).greaterThan(OFF_MARKET)) {
        offMarket.push({
          label: t.assetName ?? id,
          detail: `${t.transactionType.toLowerCase()} on ${day(t.tradeDate)} at ${p.toString()}; market price that day ${m.toString()}`,
        });
      }
    }
  }
  return { suspicious, offMarket };
}

/** Combine per-member checks for a household download into one verdict. */
export function mergeDataQuality(reports: DataQualityReport[]): DataQualityReport {
  if (reports.length === 1) return reports[0]!;
  const maxOf = (vals: Array<string | null>) =>
    vals.filter((v): v is string => v !== null).sort().at(-1) ?? null;
  const minOf = (vals: Array<string | null>) =>
    vals.filter((v): v is string => v !== null).sort()[0] ?? null;
  const issues = reports.flatMap((r) => r.issues);
  const errorCount = reports.reduce((s, r) => s + r.errorCount, 0);
  const warningCount = reports.reduce((s, r) => s + r.warningCount, 0);
  return {
    ok: reports.every((r) => r.ok),
    checkedAt: new Date().toISOString(),
    dataAsOf: {
      lastTransactionDate: maxOf(reports.map((r) => r.dataAsOf.lastTransactionDate)),
      lastImportAt: maxOf(reports.map((r) => r.dataAsOf.lastImportAt)),
      oldestPriceDate: minOf(reports.map((r) => r.dataAsOf.oldestPriceDate)),
      newestPriceDate: maxOf(reports.map((r) => r.dataAsOf.newestPriceDate)),
    },
    errorCount,
    warningCount,
    issues,
  };
}
