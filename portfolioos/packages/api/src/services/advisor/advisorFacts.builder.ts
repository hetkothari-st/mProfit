/**
 * Assembles the single `AdvisorFacts` object every rule reasons over.
 *
 * This file is the *only* place in the advisor engine that touches the
 * database. Rules receive facts and return drafts; the engine persists them.
 * That split is what makes a rule unit-testable from a fixture, and an advice
 * engine whose rules cannot be tested is an advice engine whose output cannot
 * be defended.
 *
 * It also composes rather than re-queries. Allocation comes from
 * analytics.getAllocationByClass, the holding ranking from
 * analytics.getConcentrationRisk, harvest candidates from tax.taxHarvestReport,
 * goals from goals.listGoals, and the emergency-fund picture from
 * healthScore.getEmergencyFundInputs. The advisor must not be able to disagree
 * with the analytics page about how much equity someone owns, and the surest
 * way to guarantee that is to read the same function.
 */

import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { getAllocationByClass, getConcentrationRisk } from '../analytics.service.js';
import { taxHarvestReport, ratesForDate } from '../tax.service.js';
import { listGoals } from '../goals.service.js';
import { getEmergencyFundInputs } from '../healthScore.service.js';
import { isPriceStale } from '../priceStaleness.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';
import { bucketForHolding } from './assetBuckets.js';
import { ADVISOR_ASSET_BUCKETS } from './types.js';
import type {
  AdvisorAllocationFact,
  AdvisorAssetBucketValue,
  AdvisorFacts,
  AdvisorGoalFact,
  AdvisorHarvestCandidateFact,
  AdvisorHoldingFact,
  AdvisorProductFact,
  AdvisorTargetFact,
} from './types.js';
import { getCurrentRiskProfile, userAgeFromDob } from './riskProfile.service.js';
import { approvedProductFactsByBucket } from './approvedProducts.service.js';
import { getFallbackRanking } from './fallbackRanking.service.js';

const ZERO = new Decimal(0);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

function emptyBucketMap<T>(): Record<AdvisorAssetBucketValue, T[]> {
  const out = {} as Record<AdvisorAssetBucketValue, T[]>;
  for (const bucket of ADVISOR_ASSET_BUCKETS) out[bucket] = [];
  return out;
}

/**
 * The value a holding is measured at: the live mark when we have one, cost
 * otherwise. Identical to analytics.getAllocationByClass and
 * goals.withProgress, deliberately — three different fallbacks would produce
 * three different portfolio totals on three different screens.
 */
function holdingValue(h: { currentValue: unknown; totalCost: unknown }): Decimal {
  return h.currentValue != null
    ? d(h.currentValue as { toString(): string })
    : d(h.totalCost as { toString(): string });
}

/**
 * Build the immutable fact set for one user.
 *
 * `asOf` exists so a test can pin the clock: every time-dependent rule reads
 * `facts.asOf` rather than `Date.now()`, which is what makes rule output a
 * pure function of its input.
 */
export async function buildAdvisorFacts(userId: string, asOf: Date = new Date()): Promise<AdvisorFacts> {
  const [
    riskProfile,
    projections,
    allocationSlices,
    goalRows,
    harvest,
    liquidityInputs,
    portfolios,
    age,
  ] = await Promise.all([
    getCurrentRiskProfile(userId),
    prisma.holdingProjection.findMany({ where: { portfolio: { userId } } }),
    getAllocationByClass({ kind: 'user', userId }),
    listGoals(userId),
    taxHarvestReport(userId),
    getEmergencyFundInputs(userId),
    prisma.portfolio.findMany({
      where: { userId },
      select: { id: true, isDefault: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    userAgeFromDob(userId),
  ]);

  // ── Holdings, bucketed ────────────────────────────────────────
  //
  // MUTUAL_FUND is the case that matters. The AssetClass enum does not say
  // whether a scheme is equity or debt, so without the MutualFundMaster join a
  // liquid fund is counted as equity and the drift on any portfolio holding
  // one comes out inverted.
  const fundIds = Array.from(
    new Set(projections.map((p) => p.fundId).filter((id): id is string => id != null)),
  );
  const funds = fundIds.length
    ? await prisma.mutualFundMaster.findMany({
        where: { id: { in: fundIds } },
        select: { id: true, category: true },
      })
    : [];
  const categoryByFundId = new Map(funds.map((f) => [f.id, f.category as string]));

  const holdings: AdvisorHoldingFact[] = projections.map((h) => {
    const value = holdingValue(h);
    const cost = d(h.totalCost);
    return {
      holdingKey: h.assetKey,
      portfolioId: h.portfolioId,
      assetName: h.assetName ?? '',
      assetClass: h.assetClass,
      bucket: bucketForHolding({
        assetClass: h.assetClass,
        mfCategory: h.fundId ? categoryByFundId.get(h.fundId) ?? null : null,
      }),
      fundId: h.fundId,
      stockId: h.stockId,
      isin: h.isin,
      quantity: d(h.quantity),
      currentPrice: h.currentPrice != null ? d(h.currentPrice) : null,
      currentValue: value,
      totalCost: cost,
      unrealisedPnL: h.unrealisedPnL != null ? d(h.unrealisedPnL) : value.minus(cost),
      priceStale: isPriceStale(h.assetClass as AssetClass, h.priceAsOf, asOf),
    };
  });

  // ── Holding ordering ──────────────────────────────────────────
  //
  // getConcentrationRisk is the app's answer to "which positions dominate";
  // reuse its ordering so the advisor's idea of the biggest holding is the
  // same one the analytics page shows. Matching is by (assetClass, value)
  // because the concentration rows carry a display name, not an assetKey; any
  // holding that fails to match falls back to value-descending, which is the
  // same ordering by construction.
  const concentration = await getConcentrationRisk(
    { kind: 'user', userId },
    Math.max(1, projections.length),
  );
  const rankByKey = new Map<string, number>();
  concentration.forEach((row, index) => {
    const key = `${row.assetClass}|${new Decimal(row.value).toFixed(4)}`;
    if (!rankByKey.has(key)) rankByKey.set(key, index);
  });
  holdings.sort((a, b) => {
    const ra = rankByKey.get(`${a.assetClass}|${a.currentValue.toFixed(4)}`);
    const rb = rankByKey.get(`${b.assetClass}|${b.currentValue.toFixed(4)}`);
    if (ra != null && rb != null && ra !== rb) return ra - rb;
    return b.currentValue.comparedTo(a.currentValue);
  });

  // ── Totals and allocation ─────────────────────────────────────
  //
  // The total comes from getAllocationByClass so the advisor and the analytics
  // page cannot report different portfolio sizes. Bucket splits are then taken
  // from the (MF-refined) holdings, which sum to exactly the same figure since
  // both sides value a holding the same way.
  const totalPortfolioValue = allocationSlices.reduce((sum, s) => sum.plus(new Decimal(s.value)), ZERO);

  const valueByBucket = new Map<AdvisorAssetBucketValue, Decimal>();
  for (const h of holdings) {
    valueByBucket.set(h.bucket, (valueByBucket.get(h.bucket) ?? ZERO).plus(h.currentValue));
  }
  const currentAllocation: AdvisorAllocationFact[] = ADVISOR_ASSET_BUCKETS.map((bucket) => {
    const value = valueByBucket.get(bucket) ?? ZERO;
    return {
      bucket,
      currentValue: value,
      currentPct: totalPortfolioValue.greaterThan(0)
        ? value.dividedBy(totalPortfolioValue).times(100).toNumber()
        : 0,
    };
  });

  // ── Model portfolio ───────────────────────────────────────────
  //
  // No profile means no targets. Deliberately empty rather than defaulted to
  // BALANCED: a rebalance instruction against a target the user never chose is
  // advice nobody asked for.
  const modelPortfolio: AdvisorFacts['modelPortfolio'] = riskProfile?.modelPortfolio
    ? {
        id: riskProfile.modelPortfolio.id,
        versionId: riskProfile.modelPortfolio.versionId,
        version: riskProfile.modelPortfolio.version,
        targets: riskProfile.modelPortfolio.targets as AdvisorTargetFact[],
      }
    : { id: null, versionId: null, version: null, targets: [] };

  // ── Goals ─────────────────────────────────────────────────────
  //
  // Active goals only. A shortfall SIP for an abandoned or already-achieved
  // goal is noise.
  //
  // Unit note for rule authors: `expectedReturnPct` is percentage points
  // (12 = 12%) while `requiredCagr` is the fraction goalMath returns
  // (0.12 = 12%). Compare them via `isOnTrack`, which goals.service already
  // computes in consistent units, rather than against each other.
  const goals: AdvisorGoalFact[] = goalRows
    .filter((g) => g.status === 'ACTIVE')
    .map((g) => ({
      goalId: g.id,
      name: g.name,
      category: g.category,
      priority: g.priority,
      targetAmount: new Decimal(g.targetAmount),
      currentValue: new Decimal(g.currentValue),
      remaining: new Decimal(g.remaining),
      yearsRemaining: g.yearsRemaining,
      expectedReturnPct: g.expectedReturn != null ? new Decimal(g.expectedReturn).times(100).toNumber() : null,
      requiredCagr: g.requiredCagr,
      isOnTrack: g.isOnTrack,
      // SipPlan has no goalId yet (see goals.service header), so there is no
      // honest per-goal contribution figure to report. Null, not zero — "we
      // don't know" and "you contribute nothing" are different claims.
      currentMonthlyContribution: null,
    }));

  // ── Harvest candidates ────────────────────────────────────────
  //
  // taxHarvestReport already did the holding-period and classification work.
  // The only thing added here is price staleness, joined back from the
  // projections a rule must not size a trade against a stale mark.
  const priceAsOfByKey = new Map<string, Date | null>();
  for (const p of projections) {
    priceAsOfByKey.set(`${p.portfolioId}|${p.assetClass}|${p.assetName ?? ''}`, p.priceAsOf);
  }
  const harvestCandidates: AdvisorHarvestCandidateFact[] = harvest.rows.map((r) => {
    const priceAsOf = priceAsOfByKey.get(`${r.portfolioId}|${r.assetClass}|${r.assetName}`) ?? null;
    return {
      portfolioId: r.portfolioId,
      assetName: r.assetName,
      assetClass: r.assetClass,
      isin: r.isin,
      quantity: new Decimal(r.quantity),
      currentPrice: r.currentPrice != null ? new Decimal(r.currentPrice) : null,
      currentValue: new Decimal(r.currentValue),
      unrealisedPnL: new Decimal(r.unrealisedPnL),
      longTermEligible: r.longTermEligible,
      classification: r.classification,
      priceStale: isPriceStale(r.assetClass, priceAsOf, asOf),
    };
  });

  // ── Buy-side universe ─────────────────────────────────────────
  //
  // The adviser-curated list always wins. The NAV-derived fallback is only
  // consulted for buckets where nothing has been approved, and only for
  // buckets a market order can sensibly fund.
  const approvedProducts = emptyBucketMap<AdvisorProductFact>();
  if (modelPortfolio.id) {
    const approved = await approvedProductFactsByBucket(userId, modelPortfolio.id);
    for (const bucket of ADVISOR_ASSET_BUCKETS) {
      approvedProducts[bucket] = approved[bucket] ?? [];
    }
  }

  const fallbackRankings = emptyBucketMap<AdvisorProductFact>();
  const bucketsNeedingFallback = ADVISOR_ASSET_BUCKETS.filter(
    (b) => approvedProducts[b].length === 0,
  );
  const rankings = await Promise.all(
    bucketsNeedingFallback.map((b) => getFallbackRanking(b, asOf)),
  );
  bucketsNeedingFallback.forEach((bucket, i) => {
    fallbackRankings[bucket] = rankings[i] ?? [];
  });

  // ── Liquidity ─────────────────────────────────────────────────
  //
  // Straight from healthScore.getEmergencyFundInputs — the same numbers the
  // health-score card shows. With no expense signal the target is meaningless,
  // so it is reported as null rather than as a confident ₹0.
  const liquidity: AdvisorFacts['liquidity'] = liquidityInputs.hasExpenseSignal
    ? {
        liquidAssets: liquidityInputs.liquidAssets,
        monthlyExpenses: liquidityInputs.monthlyExpenses,
        emergencyFundTarget: liquidityInputs.target,
        surplusOverTarget: liquidityInputs.surplus,
      }
    : {
        liquidAssets: liquidityInputs.liquidAssets,
        monthlyExpenses: null,
        emergencyFundTarget: null,
        surplusOverTarget: null,
      };

  const statutoryRates = ratesForDate(asOf);
  const defaultPortfolioId =
    portfolios.find((p) => p.isDefault)?.id ?? portfolios[0]?.id ?? null;

  return {
    userId,
    asOf,
    riskProfile: {
      assessmentId: riskProfile?.assessmentId ?? null,
      category: (riskProfile?.category as RiskCategoryValue | undefined) ?? null,
      age: riskProfile?.answers?.age ?? age,
      taxSlabPct: riskProfile?.taxSlabPct ?? null,
      assessedAt: riskProfile ? new Date(riskProfile.assessedAt) : null,
    },
    modelPortfolio,
    totalPortfolioValue,
    currentAllocation,
    holdings,
    goals,
    harvestCandidates,
    approvedProducts,
    fallbackRankings,
    liquidity,
    capitalGainsRates: {
      stcgEquityPct: statutoryRates.stcgEquityPct,
      ltcgEquityPct: statutoryRates.ltcgEquityPct,
      ltcgOtherNonIndexedPct: statutoryRates.ltcgOtherNonIndexedPct,
      // ratesForDate hardcodes slabPct to the top bracket as a placeholder.
      // The advisor will not inherit that guess: an unknown slab stays null so
      // the advice can say it does not know rather than assume 30%.
      slabPct: riskProfile?.taxSlabPct ?? null,
    },
    defaultPortfolioId,
  };
}
