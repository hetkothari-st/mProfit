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

import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  computePortfolioCapitalGains,
  computeUserCapitalGains,
} from '../tax/capitalGains.service.js';
import { expectedProjections } from '../holdings/holdingsProjection.js';
import { hasMarketPrice, isPriceStale } from '../holdings/priceStaleness.js';
import { compareHoldings } from './storedDataIntegrity.service.js';
import { findStatementMismatches } from './statementReconciliation.service.js';

export type DataQualityCode =
  | 'OVERSOLD'
  | 'GAINS_NEED_REVIEW'
  | 'MISSING_PRICE'
  | 'STALE_PRICE'
  | 'HOLDINGS_OUT_OF_SYNC'
  | 'STATEMENT_MISMATCH'
  | 'IMPORTS_NOT_FINISHED'
  | 'EVENTS_AWAITING_REVIEW'
  | 'UNRESOLVED_FAILURES';

export interface DataQualityIssue {
  code: DataQualityCode;
  severity: 'error' | 'warning';
  /** 'portfolio' issues follow the portfolio filter; 'account' ones are user-wide. */
  scope: 'portfolio' | 'account';
  count: number;
  message: string;
  /** Up to MAX_ITEMS examples, so the user can find and fix them. */
  items: Array<{ label: string; detail?: string }>;
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
      prisma.ingestionFailure.count({ where: { userId, resolvedAt: null } }),
    ]);

  const issues: DataQualityIssue[] = [];
  const push = (issue: Omit<DataQualityIssue, 'items'> & { items: DataQualityIssue['items'] }) => {
    if (issue.count > 0) issues.push({ ...issue, items: issue.items.slice(0, MAX_ITEMS) });
  };

  // 1. Sales with no purchase behind them. The engine books these at nil cost
  //    (so tax is not understated) and marks the row with buy === sell.
  const oversold = gains.rows.filter((r) => r.buyTransactionId === r.sellTransactionId);
  push({
    code: 'OVERSOLD',
    severity: 'error',
    scope: 'portfolio',
    count: oversold.length,
    message:
      'Some sales are for more units than were ever bought. They are shown at zero cost, so gains are overstated until the missing purchases are added.',
    items: oversold.map((r) => ({
      label: r.assetName,
      detail: `${r.quantity.toString()} units sold on ${day(r.sellDate)} with no matching purchase`,
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
      detail: `transactions say ${d.expected?.quantity ?? '0'} units, saved holding says ${d.stored?.quantity ?? '0'}`,
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
  push({
    code: 'UNRESOLVED_FAILURES',
    severity: 'warning',
    scope: 'account',
    count: failures,
    message: 'Some rows could not be read during import and were left out.',
    items: [],
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
