import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { serializeMoney, formatINR, financialYearFromDate } from '@portfolioos/shared';
import { taxHarvestReport } from './tax.service.js';
import { actionForCategory, type InsightAction } from './insightActions.js';
import { classifyFdMaturity, isTaxLossHarvestWindow } from './deterministicInsightsRules.js';

/**
 * Deterministic, non-LLM insight cards — a small, cheap, always-correct
 * complement to the LLM-generated cards in analytics.insights.ts. These are
 * facts derived directly from the user's own data (no model call, no cost,
 * no cache staleness), so they're computed on demand rather than persisted.
 * See PortfolioInsight in schema.prisma for why persistence doesn't fit:
 * that model is shaped around LLM cost/token tracking and 24h caching,
 * neither of which applies here.
 *
 * SEBI constraint (matches insightActions.ts): every message below states a
 * fact about the user's own data and, at most, points to a neutral worksheet
 * — never a recommendation to buy/sell/switch/rebalance.
 */

export type DeterministicInsightType = 'FD_MATURITY' | 'TAX_LOSS_HARVEST';

export interface DeterministicInsight {
  id: string;
  type: DeterministicInsightType;
  message: string;
  impactAmountInr: string | null;
  action: InsightAction | null;
  generatedAt: Date;
}

// Capital-asset classes eligible for equity-style STCG/LTCG treatment — the
// only classes a tax-loss-harvest card should sum over. FDs, insurance, real
// estate etc. are accrual/slab-taxed and don't belong in this figure.
const CAPITAL_ASSET_CLASSES = new Set(['EQUITY', 'MUTUAL_FUND', 'ETF']);

// Exported (in addition to the public generateDeterministicInsights below)
// so tests can inject `now` directly rather than depending on the real
// system clock — needed for the tax-loss-harvest Oct–Mar window in
// particular. See deterministicInsights.test.ts.
export async function generateFdMaturityInsights(userId: string, now: Date): Promise<DeterministicInsight[]> {
  // HoldingProjection is the source of truth for "is this FD still open"
  // (§3.1 — holdings are derived, never separately re-derived here). A
  // fully withdrawn/matured FD's assetKey has no HoldingProjection row
  // (holdingsProjection.ts deletes the row once quantity hits zero).
  const openFdHoldings = await prisma.holdingProjection.findMany({
    where: { assetClass: 'FIXED_DEPOSIT', portfolio: { userId } },
    select: { portfolioId: true, assetKey: true },
  });
  if (openFdHoldings.length === 0) return [];
  const openKeys = new Set(openFdHoldings.map((h) => `${h.portfolioId}|${h.assetKey}`));

  const fdTxs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      assetClass: 'FIXED_DEPOSIT',
      transactionType: { in: ['DEPOSIT', 'BUY'] },
      maturityDate: { not: null },
      assetKey: { not: null },
    },
    select: {
      id: true,
      portfolioId: true,
      assetKey: true,
      assetName: true,
      maturityDate: true,
      netAmount: true,
      tradeDate: true,
    },
    orderBy: { tradeDate: 'desc' },
  });

  const insights: DeterministicInsight[] = [];
  const seenKeys = new Set<string>();
  for (const tx of fdTxs) {
    const key = `${tx.portfolioId}|${tx.assetKey}`;
    // Multiple deposit rows can share an assetKey (top-ups); the most recent
    // one (rows arrive newest-first) governs the live maturity date.
    if (seenKeys.has(key) || !openKeys.has(key) || !tx.maturityDate) continue;
    seenKeys.add(key);

    if (!classifyFdMaturity(tx.maturityDate, now)) continue;

    const amount = new Decimal(tx.netAmount.toString());
    const issuer = tx.assetName?.trim() || 'your bank';
    const maturity = tx.maturityDate.toISOString().slice(0, 10);
    insights.push({
      id: `FD_MATURITY:${tx.id}`,
      type: 'FD_MATURITY',
      message: `Your ${formatINR(amount.toString())} FD with ${issuer} matures on ${maturity}`,
      impactAmountInr: serializeMoney(amount),
      action: null,
      generatedAt: now,
    });
  }
  return insights;
}

export async function generateTaxLossHarvestInsight(userId: string, now: Date): Promise<DeterministicInsight[]> {
  if (!isTaxLossHarvestWindow(now)) return [];

  const fy = financialYearFromDate(now);
  const report = await taxHarvestReport(userId, fy);

  let totalLoss = new Decimal(0);
  for (const row of report.rows) {
    if (!CAPITAL_ASSET_CLASSES.has(row.assetClass)) continue;
    const pnl = new Decimal(row.unrealisedPnL);
    if (pnl.isNegative()) totalLoss = totalLoss.plus(pnl.abs());
  }
  if (totalLoss.isZero()) return [];

  return [
    {
      id: `TAX_LOSS_HARVEST:${userId}:${fy}`,
      type: 'TAX_LOSS_HARVEST',
      message: `You have ${formatINR(totalLoss.toString())} in unrealised losses that could offset gains before March 31`,
      impactAmountInr: serializeMoney(totalLoss),
      action: actionForCategory('tax_optimisation'),
      generatedAt: now,
    },
  ];
}

export async function generateDeterministicInsights(userId: string): Promise<DeterministicInsight[]> {
  const now = new Date();
  const [fdInsights, taxLossInsights] = await Promise.all([
    generateFdMaturityInsights(userId, now),
    generateTaxLossHarvestInsight(userId, now),
  ]);
  return [...fdInsights, ...taxLossInsights];
}
