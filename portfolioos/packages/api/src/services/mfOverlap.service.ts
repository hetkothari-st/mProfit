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
