/**
 * Phase 2g — Mutual fund overlap detection.
 *
 * Detects two patterns:
 *   1. Direct vs Regular duplication — the same scheme held in both
 *      direct and regular variants (a common, costly mistake).
 *   2. Multi-scheme overlap on the same underlying portfolio — flagged
 *      heuristically by canonicalizing scheme names (strip "Direct /
 *      Regular / Growth / IDCW" variants). A future iteration can
 *      use a real portfolio-disclosure feed for ISIN-level overlap.
 *
 * Pure read aggregation — no mutations.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { serializeMoney } from '@portfolioos/shared';

const ZERO = new Decimal(0);

export type PlanType = 'DIRECT' | 'REGULAR' | 'UNKNOWN';

export interface SchemeRow {
  fundId: string;
  schemeCode: string;
  schemeName: string;
  amcName: string;
  category: string;
  planType: PlanType;
  totalValue: string;
  totalCost: string;
  holdingCount: number; // how many portfolios hold this scheme
}

export interface OverlapGroup {
  canonicalName: string;
  schemes: SchemeRow[];
  totalValue: string;
  hasDirectAndRegular: boolean;
}

export interface MfOverlapResult {
  schemes: SchemeRow[];
  overlapGroups: OverlapGroup[];
  summary: {
    schemeCount: number;
    directCount: number;
    regularCount: number;
    overlapGroupCount: number;
    directRegularDuplicates: number;
    totalMfValue: string;
  };
}

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

export function detectPlanType(schemeName: string): PlanType {
  const s = schemeName.toLowerCase();
  if (/\bdirect\b/.test(s)) return 'DIRECT';
  if (/\bregular\b/.test(s)) return 'REGULAR';
  // Default heuristic — schemes without an explicit marker are usually
  // regular. Flagged separately so the UI can show ambiguity.
  return 'UNKNOWN';
}

/**
 * Strip plan / option markers to get a canonical name. Example:
 *   "HDFC Balanced Advantage Fund - Direct Plan - Growth"
 *   → "hdfc balanced advantage fund"
 */
export function canonicalSchemeName(schemeName: string): string {
  return schemeName
    .toLowerCase()
    .replace(/\b(direct|regular)\b/g, '')
    .replace(/\b(growth|dividend|idcw|payout|reinvestment|bonus)\b/g, '')
    .replace(/\b(plan|option|scheme|fund)\b/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getMfOverlap(userId: string): Promise<MfOverlapResult> {
  // Pull every MF holding owned by the user (across all portfolios).
  // HoldingProjection has no `fund` relation — fetch fund metadata in a
  // second query keyed by the fundIds we see.
  const rows = await prisma.holdingProjection.findMany({
    where: {
      portfolio: { userId },
      assetClass: { in: ['MUTUAL_FUND', 'ETF'] },
      fundId: { not: null },
    },
  });
  const fundIds = Array.from(
    new Set(rows.map((r) => r.fundId).filter((id): id is string => !!id)),
  );
  const funds = fundIds.length
    ? await prisma.mutualFundMaster.findMany({
        where: { id: { in: fundIds } },
        select: { id: true, schemeCode: true, schemeName: true, amcName: true, category: true },
      })
    : [];
  const fundById = new Map(funds.map((f) => [f.id, f]));

  // Group by fundId to produce one row per scheme.
  const byFund = new Map<string, {
    fundId: string;
    schemeCode: string;
    schemeName: string;
    amcName: string;
    category: string;
    totalValue: Decimal;
    totalCost: Decimal;
    holdingCount: number;
  }>();

  for (const r of rows) {
    if (!r.fundId) continue;
    const fund = fundById.get(r.fundId);
    if (!fund) continue;
    const existing = byFund.get(fund.id);
    const value = r.currentValue ? d(r.currentValue) : d(r.totalCost);
    if (existing) {
      existing.totalValue = existing.totalValue.plus(value);
      existing.totalCost = existing.totalCost.plus(d(r.totalCost));
      existing.holdingCount += 1;
    } else {
      byFund.set(fund.id, {
        fundId: fund.id,
        schemeCode: fund.schemeCode,
        schemeName: fund.schemeName,
        amcName: fund.amcName,
        category: fund.category,
        totalValue: value,
        totalCost: d(r.totalCost),
        holdingCount: 1,
      });
    }
  }

  const schemes: SchemeRow[] = Array.from(byFund.values()).map((s) => ({
    fundId: s.fundId,
    schemeCode: s.schemeCode,
    schemeName: s.schemeName,
    amcName: s.amcName,
    category: s.category,
    planType: detectPlanType(s.schemeName),
    totalValue: serializeMoney(s.totalValue),
    totalCost: serializeMoney(s.totalCost),
    holdingCount: s.holdingCount,
  }));

  // Group schemes by canonical name to detect overlap.
  const groupMap = new Map<string, SchemeRow[]>();
  for (const s of schemes) {
    const k = canonicalSchemeName(s.schemeName);
    if (!k) continue;
    const arr = groupMap.get(k) ?? [];
    arr.push(s);
    groupMap.set(k, arr);
  }

  const overlapGroups: OverlapGroup[] = [];
  let directRegularDuplicates = 0;
  for (const [k, arr] of groupMap) {
    if (arr.length < 2) continue;
    const planTypes = new Set(arr.map((s) => s.planType));
    const hasDirectAndRegular = planTypes.has('DIRECT') && planTypes.has('REGULAR');
    if (hasDirectAndRegular) directRegularDuplicates += 1;
    const totalValue = arr
      .reduce((acc, s) => acc.plus(d(s.totalValue)), ZERO);
    overlapGroups.push({
      canonicalName: k,
      schemes: arr.sort((a, b) => d(b.totalValue).comparedTo(d(a.totalValue))),
      totalValue: serializeMoney(totalValue),
      hasDirectAndRegular,
    });
  }
  overlapGroups.sort((a, b) => d(b.totalValue).comparedTo(d(a.totalValue)));

  const directCount = schemes.filter((s) => s.planType === 'DIRECT').length;
  const regularCount = schemes.filter((s) => s.planType === 'REGULAR').length;
  const totalMfValue = schemes.reduce((acc, s) => acc.plus(d(s.totalValue)), ZERO);

  return {
    schemes: schemes.sort((a, b) => d(b.totalValue).comparedTo(d(a.totalValue))),
    overlapGroups,
    summary: {
      schemeCount: schemes.length,
      directCount,
      regularCount,
      overlapGroupCount: overlapGroups.length,
      directRegularDuplicates,
      totalMfValue: serializeMoney(totalMfValue),
    },
  };
}

// ---------------------------------------------------------------------------
// Weight-overlap primitives (`docs/mf-analytics/04-PORTFOLIO-ANALYSIS.md §2`)
// ---------------------------------------------------------------------------
//
// Everything above this line is the Phase-2g *name-canonicalisation* heuristic:
// it answers "is the user holding the same scheme twice?" without any portfolio
// disclosure at all. What `04 §2` needs is the harder question — "how much of
// fund A's book is also inside fund B's?" — which needs `MfPortfolioSnapshot`
// weights.
//
// These live here rather than in a second overlap module because
// `07-IMPLEMENTATION-PLAN.md` Task 4.2 says to extend this file, and for the
// reason behind that instruction: two overlap implementations would eventually
// give the fund page and the portfolio page different answers about the same
// pair of funds, and neither page could explain the other.
//
// They are deliberately **pure and unit-agnostic**. The caller decides whether
// the weights are percent (`MfPortfolioHolding.weightPct`, 0-100) or fractions;
// every function below preserves whatever came in. That is what lets the same
// `weightOverlap` serve both the ISIN-keyed equity overlap and the issuer-keyed
// debt overlap `04 §2` asks to report separately — one formula, two keyings,
// rather than a second near-copy that drifts.

/**
 * A disclosed portfolio reduced to weight-by-key: ISIN for the equity overlap,
 * issuer for the debt overlap. Keys absent from the map are weight zero.
 */
export type WeightsByKey = ReadonlyMap<string, Decimal>;

/**
 * `overlap(A, B) = Σ_i min(w_A,i, w_B,i)` over the keys the two share.
 *
 * Iterates the smaller map so the cost is O(min(|A|,|B|)) rather than O(|A|)
 * — a pairwise matrix over a 15-fund portfolio is 105 calls, and a debt fund
 * can disclose several hundred lines.
 */
export function weightOverlap(a: WeightsByKey, b: WeightsByKey): Decimal {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let total = ZERO;
  for (const [key, weight] of small) {
    const other = large.get(key);
    if (other === undefined) continue;
    total = total.plus(Decimal.min(weight, other));
  }
  return total;
}

/** One security held by both funds of a pair, with its weight in each. */
export interface SharedWeight {
  key: string;
  weightInA: Decimal;
  weightInB: Decimal;
  /** `min(weightInA, weightInB)` — this security's contribution to the overlap. */
  contribution: Decimal;
}

/**
 * The shared securities behind a `weightOverlap`, ordered by how much each
 * contributes. Returned rather than derived at the call site so the headline
 * number and the "top shared stocks" list can never be computed from two
 * different intersections.
 */
export function sharedWeights(a: WeightsByKey, b: WeightsByKey, limit?: number): SharedWeight[] {
  const out: SharedWeight[] = [];
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const smallIsA = small === a;
  for (const [key, weight] of small) {
    const other = large.get(key);
    if (other === undefined) continue;
    const weightInA = smallIsA ? weight : other;
    const weightInB = smallIsA ? other : weight;
    out.push({ key, weightInA, weightInB, contribution: Decimal.min(weightInA, weightInB) });
  }
  out.sort((x, y) => y.contribution.comparedTo(x.contribution));
  return limit === undefined ? out : out.slice(0, limit);
}

/**
 * `effectiveFundCount = 1 / Σ (w_f)²` — the inverse Herfindahl index over the
 * fund weights, i.e. how many *equally-sized* funds the book behaves like.
 *
 * Ten funds where one holds 90% of the money behaves like ~1.2 funds, and
 * saying so is the point: `04 §2` uses this for diversification **across**
 * funds, which the raw count cannot express.
 *
 * `weights` must be fractions of the same book (they should sum to ~1).
 * Returns `null` for an empty book rather than `Infinity` or `0` — an
 * undefined count is not a count of zero.
 */
export function effectiveFundCount(weights: readonly Decimal[]): Decimal | null {
  let sumSq = ZERO;
  for (const w of weights) sumSq = sumSq.plus(w.times(w));
  if (sumSq.lessThanOrEqualTo(0)) return null;
  return new Decimal(1).dividedBy(sumSq);
}

/** One pair's contribution to the portfolio-level redundancy figure. */
export interface WeightedPairOverlap {
  /** Overlap between the pair, in whatever unit the caller is working in. */
  overlap: Decimal;
  /** Fund A's fractional weight in the book. */
  weightA: Decimal;
  /** Fund B's fractional weight in the book. */
  weightB: Decimal;
}

/**
 * `redundancyScore` — the weight-weighted mean pairwise overlap.
 *
 * Each pair is weighted by `w_A × w_B`, which is the share of the book that
 * the pair *jointly* accounts for. A plain unweighted mean would let two 1%
 * satellite funds that happen to be near-identical dominate the score for a
 * portfolio whose real money sits in three uncorrelated funds — the number
 * would be alarming and would describe 2% of the portfolio.
 *
 * Returns `null` when there is no pair to average (a single-fund book has no
 * redundancy, and zero would assert that it has none *measured*).
 */
export function weightedMeanPairOverlap(
  pairs: readonly WeightedPairOverlap[],
): Decimal | null {
  let weighted = ZERO;
  let totalWeight = ZERO;
  for (const p of pairs) {
    const w = p.weightA.times(p.weightB);
    weighted = weighted.plus(p.overlap.times(w));
    totalWeight = totalWeight.plus(w);
  }
  if (totalWeight.lessThanOrEqualTo(0)) return null;
  return weighted.dividedBy(totalWeight);
}
