/**
 * Do the stored, derived tables still match the transactions they are derived
 * from?
 *
 * Two tables are kept as a cache of a calculation over `Transaction`:
 *
 *   - HoldingProjection — quantity and cost per asset (recomputeForAsset).
 *   - CapitalGain       — the FIFO sale/purchase matches (persistCapitalGains*).
 *
 * Every write path is supposed to refresh both. "Supposed to" is the problem:
 * one path that forgets — a new importer, a sync, a script — leaves a stored
 * figure that no longer follows from the user's own transactions, and nothing
 * notices until a dashboard and a report disagree. This module recomputes from
 * scratch, in memory, and compares. It never trusts the stored rows to check
 * themselves.
 *
 * The transactions are the source of truth. When the two disagree, the stored
 * rows are wrong by definition, so `repair` rebuilds them through the normal
 * recompute path — the same code a transaction edit runs.
 */

import { Decimal } from 'decimal.js';
import type { CapitalGainType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  expectedProjections,
  recomputeForAsset,
  type ExpectedProjection,
} from '../holdingsProjection.js';
import {
  computePortfolioCapitalGains,
  persistCapitalGainsForPortfolio,
  type CapitalGainRow,
} from '../capitalGains.service.js';

// Stored scale is Decimal(18,6) for quantity and (18,4) for money. Anything
// inside one unit of the last stored digit is rounding, not drift.
const QTY_TOLERANCE = new Decimal('0.000001');
const COST_TOLERANCE = new Decimal('0.0001');

export type HoldingDriftKind = 'MISSING' | 'UNEXPECTED' | 'QUANTITY' | 'COST';

export interface HoldingDrift {
  assetKey: string;
  kind: HoldingDriftKind;
  expected: { quantity: string; totalCost: string } | null;
  stored: { quantity: string; totalCost: string } | null;
}

export interface StoredHolding {
  assetKey: string;
  quantity: { toString(): string };
  totalCost: { toString(): string };
}

/** Pure: stored projection rows vs what the transactions say they should be. */
export function compareHoldings(
  expected: Map<string, ExpectedProjection>,
  stored: StoredHolding[],
): HoldingDrift[] {
  const drifts: HoldingDrift[] = [];
  const seen = new Set<string>();
  const fmt = (q: Decimal, c: Decimal) => ({ quantity: q.toString(), totalCost: c.toString() });

  for (const row of stored) {
    seen.add(row.assetKey);
    const qty = new Decimal(row.quantity.toString());
    const cost = new Decimal(row.totalCost.toString());
    const exp = expected.get(row.assetKey);
    if (!exp) {
      drifts.push({ assetKey: row.assetKey, kind: 'UNEXPECTED', expected: null, stored: fmt(qty, cost) });
      continue;
    }
    if (exp.quantity.minus(qty).abs().greaterThan(QTY_TOLERANCE)) {
      drifts.push({ assetKey: row.assetKey, kind: 'QUANTITY', expected: fmt(exp.quantity, exp.totalCost), stored: fmt(qty, cost) });
    } else if (exp.totalCost.minus(cost).abs().greaterThan(COST_TOLERANCE)) {
      drifts.push({ assetKey: row.assetKey, kind: 'COST', expected: fmt(exp.quantity, exp.totalCost), stored: fmt(qty, cost) });
    }
  }
  for (const [assetKey, exp] of expected) {
    if (!seen.has(assetKey)) {
      drifts.push({ assetKey, kind: 'MISSING', expected: fmt(exp.quantity, exp.totalCost), stored: null });
    }
  }
  return drifts;
}

export interface StoredGain {
  sellTransactionId: string;
  buyTransactionId: string;
  quantity: { toString(): string };
  gainLoss: { toString(): string };
  capitalGainType: CapitalGainType;
  financialYear: string;
}

/**
 * One line per FIFO match, at the stored precision. Two sets of rows are the
 * same when their signatures are the same multiset — order is irrelevant, a
 * duplicate is not.
 */
function gainSignature(r: StoredGain | CapitalGainRow): string {
  const q = new Decimal(r.quantity.toString()).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  const g = new Decimal(r.gainLoss.toString()).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return [r.sellTransactionId, r.buyTransactionId, q.toFixed(6), g.toFixed(4), r.capitalGainType, r.financialYear].join('|');
}

export interface GainDrift {
  /** Matches the engine produces that are not stored. */
  missing: number;
  /** Stored matches the engine no longer produces (stale or duplicated). */
  unexpected: number;
}

/** Pure: stored CapitalGain rows vs a fresh FIFO run. */
export function compareGains(expected: CapitalGainRow[], stored: StoredGain[]): GainDrift {
  const counts = new Map<string, number>();
  for (const r of expected) {
    const s = gainSignature(r);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let unexpected = 0;
  for (const r of stored) {
    const s = gainSignature(r);
    const n = counts.get(s) ?? 0;
    if (n > 0) counts.set(s, n - 1);
    else unexpected++;
  }
  let missing = 0;
  for (const n of counts.values()) missing += n;
  return { missing, unexpected };
}

export interface PortfolioIntegrityResult {
  portfolioId: string;
  holdingDrifts: HoldingDrift[];
  gainDrift: GainDrift;
  /** True when anything disagreed and `repair` rebuilt it. */
  repaired: boolean;
}

/**
 * Compare one portfolio's stored holdings and gains with a fresh calculation.
 * Must run inside the portfolio owner's request context (RLS).
 */
export async function checkPortfolioIntegrity(
  portfolioId: string,
  opts: { repair: boolean },
): Promise<PortfolioIntegrityResult> {
  const [txs, storedHoldings, storedGains, gains] = await Promise.all([
    prisma.transaction.findMany({ where: { portfolioId }, orderBy: { tradeDate: 'asc' } }),
    prisma.holdingProjection.findMany({
      where: { portfolioId },
      select: { assetKey: true, quantity: true, totalCost: true },
    }),
    prisma.capitalGain.findMany({
      where: { portfolioId },
      select: {
        sellTransactionId: true,
        buyTransactionId: true,
        quantity: true,
        gainLoss: true,
        capitalGainType: true,
        financialYear: true,
      },
    }),
    computePortfolioCapitalGains(portfolioId),
  ]);

  const holdingDrifts = compareHoldings(expectedProjections(txs), storedHoldings);
  const gainDrift = compareGains(gains.rows, storedGains);
  const gainsDrifted = gainDrift.missing > 0 || gainDrift.unexpected > 0;

  let repaired = false;
  if (opts.repair && (holdingDrifts.length > 0 || gainsDrifted)) {
    for (const d of holdingDrifts) await recomputeForAsset(portfolioId, d.assetKey);
    if (gainsDrifted) await persistCapitalGainsForPortfolio(portfolioId);
    repaired = true;
  }

  return { portfolioId, holdingDrifts, gainDrift, repaired };
}
