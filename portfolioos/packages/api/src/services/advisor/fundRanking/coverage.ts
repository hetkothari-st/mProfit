/**
 * How much of the universe we can actually price and size.
 *
 * The release gate turns on named-fund advice only when TER and AUM coverage
 * clear a threshold. That number is only meaningful if the denominator is the
 * population the ranking would otherwise consider.
 *
 * The first version counted active + direct + growth. That is three of the
 * eligibility rules out of eight, so it measured coverage against a universe
 * containing NFOs with no NAV history, schemes whose NAV stopped updating
 * months ago, segregated side-pockets, close-ended schemes nobody can buy,
 * and schemes in categories the model portfolios never use. None of those can
 * be recommended whatever their TER is, so counting them as "missing cost
 * data" understated coverage against a population the ranking never sees.
 *
 * The rule here is the one the spec asks for: apply EVERY eligibility rule
 * EXCEPT the one that depends on the field being measured.
 *
 *   TER coverage → track record, NFO, segregated, closure, staleness, plan,
 *                  option, category and SIZE all applied; TER not applied.
 *   AUM coverage → everything above applied, except size.
 *
 * so each number answers "of the schemes we could otherwise recommend, how
 * many can we price / size?" rather than "of every row AMFI publishes".
 *
 * The excluded population is returned too, not just counted: a scheme with no
 * AAUM figure is a scheme the adviser cannot size, and knowing they are all
 * three-month-old NFOs is a different fact from knowing they are all debt
 * funds from one AMC.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { assessEligibility } from './eligibility.js';
import { bucketForScheme } from './categoryMap.js';
import { ADVISOR_ASSET_BUCKETS, type AdvisorAssetBucketValue } from '../types.js';
import type { ExclusionReason, FundCandidate, MethodologyConfig } from './types.js';

/** The exclusion reasons each measured field is responsible for. */
const TER_REASONS: ExclusionReason[] = [];
const AUM_REASONS: ExclusionReason[] = ['aum_unknown', 'aum_below_floor'];

export interface MissingAumScheme {
  schemeCode: string;
  schemeName: string;
  amcName: string;
  category: string;
  subCategory: string | null;
  /** First NAV we hold — the closest thing to a launch date we have. */
  firstNavDate: string | null;
  trackRecordYears: number | null;
  bucket: AdvisorAssetBucketValue | null;
}

export interface BucketDepth {
  bucket: AdvisorAssetBucketValue;
  /** Schemes passing every eligibility rule for this bucket. */
  eligible: number;
  /** Whether a ModelPortfolio actually allocates to this bucket. */
  used: boolean;
}

export interface FundDataCoverage {
  /** Schemes passing every rule except the measured one — the TER denominator. */
  eligibleSchemes: number;
  terCoveragePct: number;
  /** The AUM denominator, which excludes the size rule rather than the cost one. */
  aumEligibleSchemes: number;
  aumCoveragePct: number;
  /** Otherwise-eligible schemes we hold no AAUM for, with what we know. */
  missingAum: MissingAumScheme[];
  /** Per-bucket eligible counts, for the minimum-candidate check. */
  buckets: BucketDepth[];
}

/**
 * NAV history, reduced to what eligibility needs. Loading every observation
 * for every scheme to compute two dates would read tens of millions of rows
 * at boot; eligibility only ever asks for the first date, the last date, and
 * (through `readTraits`) a count of usable points.
 */
async function navSpans(): Promise<Map<string, { first: Date; last: Date }>> {
  const rows = await prisma.$queryRaw<
    { schemeCode: string; first: Date; last: Date }[]
  >`
    SELECT m."schemeCode" AS "schemeCode", MIN(n."date") AS first, MAX(n."date") AS last
    FROM "MFNav" n
    JOIN "MutualFundMaster" m ON m."id" = n."fundId"
    GROUP BY m."schemeCode"
  `;
  return new Map(rows.map((r) => [r.schemeCode, { first: r.first, last: r.last }]));
}

/**
 * Build the candidate rows eligibility reads, with a two-point NAV history
 * standing in for the full series.
 *
 * That substitution is safe for this purpose and only this purpose:
 * `readTraits` derives `trackRecordYears` from the first and last dates and
 * `navAgeDays` from the last, and no other eligibility rule touches the
 * series. Scoring, which does need every point, loads its own.
 */
async function loadEligibilityInputs(): Promise<FundCandidate[]> {
  const [funds, spans] = await Promise.all([
    prisma.mutualFundMaster.findMany({
      select: {
        schemeCode: true,
        schemeName: true,
        amcName: true,
        category: true,
        subCategory: true,
        isin: true,
        isActive: true,
        planType: true,
        optionType: true,
        terPct: true,
        terJoinStatus: true,
        aumInr: true,
      },
    }),
    navSpans(),
  ]);

  return funds.map((f) => {
    const span = spans.get(f.schemeCode);
    const navHistory = span
      ? [
          { date: span.first.toISOString().slice(0, 10), nav: 1 },
          { date: span.last.toISOString().slice(0, 10), nav: 1 },
        ]
      : [];
    return {
      schemeCode: f.schemeCode,
      schemeName: f.schemeName,
      amcName: f.amcName,
      category: f.category,
      subCategory: f.subCategory,
      isin: f.isin,
      isActive: f.isActive,
      planType: f.planType,
      optionType: f.optionType,
      navHistory,
      terPct: f.terPct == null ? null : Number.parseFloat(f.terPct.toString()),
      terJoinStatus: f.terJoinStatus,
      aumInr: f.aumInr == null ? null : new Decimal(f.aumInr.toString()),
      managerTenureYears: null,
      benchmarkTri: null,
    };
  });
}

/**
 * True when the only things standing between this scheme and eligibility are
 * the reasons the measured field is responsible for.
 *
 * `category_not_in_bucket` is always forgiven here because eligibility is
 * asked per bucket and coverage is a question about the whole universe: a
 * large-cap fund is not "ineligible", it simply is not a mid-cap fund. A
 * scheme whose category maps to no bucket at all IS excluded, because the
 * ranking genuinely never sees it.
 */
function passesExcept(reasons: ExclusionReason[], ignore: ExclusionReason[]): boolean {
  return reasons.every((r) => r === 'category_not_in_bucket' || ignore.includes(r));
}

export async function fundDataCoverage(
  config: MethodologyConfig,
  asOf: Date = new Date(),
): Promise<FundDataCoverage> {
  const candidates = await loadEligibilityInputs();

  // Which buckets the model portfolios actually allocate to. A bucket no
  // portfolio uses needs no candidates, and failing a deployment over an
  // empty one would be noise.
  const usedBuckets = await modelPortfolioBuckets();

  let terDenominator = 0;
  let terCovered = 0;
  let aumDenominator = 0;
  let aumCovered = 0;
  const missingAum: MissingAumScheme[] = [];
  const perBucket = new Map<AdvisorAssetBucketValue, number>(
    ADVISOR_ASSET_BUCKETS.map((b) => [b, 0]),
  );

  for (const candidate of candidates) {
    const bucket = bucketForScheme(candidate.category, candidate.subCategory, candidate.schemeName);
    // Assess against the scheme's own bucket where it has one, so that
    // `category_not_in_bucket` never fires for a scheme we do rank. A scheme
    // with no bucket is assessed against any bucket and will fail on
    // `category_unknown`, which is the honest outcome.
    const probe = bucket ?? ADVISOR_ASSET_BUCKETS[0]!;
    const { reasons } = assessEligibility(candidate, probe, config, asOf);

    if (passesExcept(reasons, TER_REASONS)) {
      terDenominator += 1;
      if (candidate.terPct != null) terCovered += 1;
    }

    if (passesExcept(reasons, AUM_REASONS)) {
      aumDenominator += 1;
      if (candidate.aumInr != null) aumCovered += 1;
      else {
        missingAum.push({
          schemeCode: candidate.schemeCode,
          schemeName: candidate.schemeName,
          amcName: candidate.amcName,
          category: candidate.category,
          subCategory: candidate.subCategory,
          firstNavDate: candidate.navHistory[0]?.date ?? null,
          trackRecordYears: trackRecordYearsOf(candidate),
          bucket,
        });
      }
    }

    if (reasons.length === 0 && bucket) {
      perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + 1);
    }
  }

  const pct = (n: number, total: number) =>
    total === 0 ? 0 : Math.round((n / total) * 1000) / 10;

  return {
    eligibleSchemes: terDenominator,
    terCoveragePct: pct(terCovered, terDenominator),
    aumEligibleSchemes: aumDenominator,
    aumCoveragePct: pct(aumCovered, aumDenominator),
    missingAum,
    buckets: ADVISOR_ASSET_BUCKETS.map((b) => ({
      bucket: b,
      eligible: perBucket.get(b) ?? 0,
      used: usedBuckets.has(b),
    })),
  };
}

function trackRecordYearsOf(c: FundCandidate): number | null {
  const first = c.navHistory[0];
  const last = c.navHistory[c.navHistory.length - 1];
  if (!first || !last) return null;
  const ms = new Date(last.date).getTime() - new Date(first.date).getTime();
  return Math.round((ms / 86_400_000 / 365.25) * 10) / 10;
}

/**
 * Every bucket any active ModelPortfolio currently allocates to.
 *
 * Target weights are versioned and immutable, so this reads the NEWEST
 * version of each active portfolio: a bucket dropped in version 3 is not in
 * use just because version 2 named it. A zero weight is not use either.
 */
export async function modelPortfolioBuckets(): Promise<Set<AdvisorAssetBucketValue>> {
  const portfolios = await prisma.modelPortfolio.findMany({
    where: { isActive: true },
    select: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { targetWeights: true },
      },
    },
  });

  const used = new Set<AdvisorAssetBucketValue>();
  for (const p of portfolios) {
    const weights = p.versions[0]?.targetWeights;
    if (!Array.isArray(weights)) continue;
    for (const entry of weights as Array<{ bucket?: unknown; targetPct?: unknown }>) {
      const bucket = typeof entry?.bucket === 'string' ? entry.bucket : null;
      const pct = typeof entry?.targetPct === 'number' ? entry.targetPct : Number.NaN;
      if (!bucket || !Number.isFinite(pct) || pct <= 0) continue;
      if ((ADVISOR_ASSET_BUCKETS as readonly string[]).includes(bucket)) {
        used.add(bucket as AdvisorAssetBucketValue);
      }
    }
  }
  return used;
}
