/**
 * The fallback buy-side universe: what the engine names when the adviser has
 * approved nothing for a bucket.
 *
 * Deliberately narrow in what it reads. MutualFundMaster + MFNav only — no
 * price-feed call, no analytics.priceBackfill, nothing that reaches the
 * internet. Advice generation must be reproducible from data already in the
 * database: a ranking that depends on whether a third-party API answered today
 * is a ranking nobody can defend afterwards, and a nightly engine run must
 * never turn into a fan-out of outbound HTTP.
 *
 * Scoring itself is pure and lives in fallbackRankingMath.scoreNavSeries.
 */

import type { MFCategory } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { bucketForHolding } from './assetBuckets.js';
import { scoreNavSeries } from './fallbackRankingMath.js';
import type { AdvisorAssetBucketValue, AdvisorProductFact } from './types.js';

/** Every MFCategory the schema knows. Kept explicit so adding an enum value
 *  upstream shows up here as a compile error rather than a silently empty
 *  bucket. */
const ALL_MF_CATEGORIES: MFCategory[] = [
  'EQUITY',
  'DEBT',
  'HYBRID',
  'SOLUTION_ORIENTED',
  'OTHER',
  'ETF',
  'INDEX_FUND',
  'ELSS',
  'FMP',
  'LIQUID',
];

/**
 * Which fund categories land in which advisor bucket, derived from the single
 * bucketing function the facts builder uses. Deriving rather than declaring
 * matters: a fund that the facts builder counts as DEBT must be ranked as a
 * DEBT candidate, or the engine would recommend buying into the very bucket it
 * just measured the holding out of.
 */
const CATEGORIES_BY_BUCKET: Partial<Record<AdvisorAssetBucketValue, MFCategory[]>> = (() => {
  const map: Partial<Record<AdvisorAssetBucketValue, MFCategory[]>> = {};
  for (const category of ALL_MF_CATEGORIES) {
    const bucket = bucketForHolding({ assetClass: 'MUTUAL_FUND', mfCategory: category });
    (map[bucket] ??= []).push(category);
  }
  return map;
})();

/** How many candidates the caller gets back. */
const TOP_N = 5;

/** Years of NAV history handed to the scorer. */
const LOOKBACK_YEARS = 3;

/** Hard ceiling on funds scored in one call. A bucket with thousands of
 *  schemes must not turn a single advisor run into a full NAV table scan. */
const MAX_CANDIDATES = 250;

/** Cheap prefilter before the scorer is called at all. The real minimum is
 *  enforced inside scoreNavSeries, which needs month-end observations, not raw
 *  rows — this just avoids the call for schemes with barely any history. */
const MIN_NAV_POINTS = 24;

/** Freshness window for "this scheme is still being priced". A fund whose last
 *  NAV is months old is not something to recommend buying. */
const RECENT_NAV_DAYS = 30;

function daysBefore(asOf: Date, days: number): Date {
  return new Date(asOf.getTime() - days * 24 * 60 * 60 * 1000);
}

function yearsBefore(asOf: Date, years: number): Date {
  const d = new Date(asOf.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

/**
 * Top-5 NAV-ranked funds for a bucket, rank-ordered best first.
 *
 * Returns `[]` — not an error and not a guess — for a bucket no mutual fund
 * category maps into (EQUITY_INTERNATIONAL, GOLD, REAL_ASSETS, OTHER_ALT
 * today) or when nothing in the bucket has enough NAV history to judge.
 */
export async function getFallbackRanking(
  bucket: AdvisorAssetBucketValue,
  asOf: Date,
): Promise<AdvisorProductFact[]> {
  const categories = CATEGORIES_BY_BUCKET[bucket];
  if (!categories || categories.length === 0) return [];

  const seriesStart = yearsBefore(asOf, LOOKBACK_YEARS);
  const recentSince = daysBefore(asOf, RECENT_NAV_DAYS);

  // Candidates are funds priced recently — that single condition also does the
  // work of "still exists" and "still being reported" without a second query.
  const recent = await prisma.mFNav.findMany({
    where: {
      date: { gte: recentSince, lte: asOf },
      fund: { isActive: true, category: { in: categories } },
    },
    select: { fundId: true },
    distinct: ['fundId'],
    take: MAX_CANDIDATES,
  });
  const fundIds = recent.map((r) => r.fundId);
  if (fundIds.length === 0) return [];

  const [funds, navs] = await Promise.all([
    prisma.mutualFundMaster.findMany({
      where: { id: { in: fundIds } },
      select: { id: true, schemeName: true, amcName: true },
    }),
    prisma.mFNav.findMany({
      where: { fundId: { in: fundIds }, date: { gte: seriesStart, lte: asOf } },
      select: { fundId: true, date: true, nav: true },
      orderBy: [{ fundId: 'asc' }, { date: 'asc' }],
    }),
  ]);

  const seriesByFund = new Map<string, Array<{ date: string; nav: number }>>();
  for (const row of navs) {
    const nav = Number(row.nav.toString());
    if (!Number.isFinite(nav) || nav <= 0) continue;
    const list = seriesByFund.get(row.fundId) ?? [];
    list.push({ date: row.date.toISOString().slice(0, 10), nav });
    seriesByFund.set(row.fundId, list);
  }

  const labelById = new Map(funds.map((f) => [f.id, `${f.schemeName} (${f.amcName})`]));

  const scored: Array<{ fundId: string; label: string; score: number }> = [];
  for (const [fundId, series] of seriesByFund) {
    if (series.length < MIN_NAV_POINTS) continue;
    const result = scoreNavSeries(series, asOf, LOOKBACK_YEARS);
    if (!result || !Number.isFinite(result.score)) continue;
    scored.push({ fundId, label: labelById.get(fundId) ?? fundId, score: result.score });
  }

  // Ties broken by label so the ranking is stable across runs — an unstable
  // order would make identical advice look like it changed.
  scored.sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label));

  return scored.slice(0, TOP_N).map((s) => ({
    approvedProductId: null,
    fundId: s.fundId,
    stockId: null,
    label: s.label,
    score: s.score,
  }));
}
