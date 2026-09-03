/**
 * CASH_DEPLOYMENT — put idle cash above the emergency fund to work.
 *
 * The gate that matters most here is the one that stops the rule firing:
 * `emergencyFundTarget === null`. Without known monthly expenses there is no
 * emergency-fund target, and without a target there is no such thing as
 * "surplus" cash. Calling someone's entire bank balance idle because we cannot
 * see their expenses is the single most damaging thing this engine could say —
 * it is the advice that ends with a person having to sell equity in a bad month
 * to cover rent. Unknown expenses therefore means silence, not an assumption.
 *
 * CASH_EQUIVALENT is excluded as a destination even when it is the most
 * underweight bucket: deploying surplus cash into more cash is a no-op dressed
 * up as a recommendation.
 */

import { Decimal } from 'decimal.js';
import { formatINR } from '@portfolioos/shared';
import { INVESTABLE_BUCKETS } from '../assetBuckets.js';
import {
  CATEGORY_BASE_PRIORITY,
  EMERGENCY_FUND_MONTHS,
  MAX_SINGLE_TRADE_PCT,
  MIN_CASH_SURPLUS_INR,
} from '../constants.js';
import { computeDrift, unitsFor, type DriftRow } from '../allocationMath.js';
import { resolveProduct } from '../productResolution.js';
import type {
  AdvisorAssetBucketValue,
  AdvisorFacts,
  AdvisorRule,
  RecommendationDraft,
  TradeAction,
} from '../types.js';

const ZERO = new Decimal(0);
const BASE_PRIORITY = CATEGORY_BASE_PRIORITY.CASH_DEPLOYMENT;

const money = (d: Decimal): string => d.abs().toFixed(2);
const inr = (d: Decimal): string => formatINR(money(d));

/** Bigger rupee impact sorts first inside the category's band (0 = largest).
 *  Duplicated per rule file on purpose — see rebalanceDrift.rule.ts. */
function materialityOffset(amount: Decimal, totalValue: Decimal): number {
  if (!totalValue || totalValue.lessThanOrEqualTo(ZERO)) return 4;
  const share = amount.abs().dividedBy(totalValue).toNumber();
  if (share >= 0.1) return 0;
  if (share >= 0.05) return 1;
  if (share >= 0.02) return 2;
  if (share >= 0.01) return 3;
  return 4;
}

const BUCKET_LABEL: Record<AdvisorAssetBucketValue, string> = {
  EQUITY_DOMESTIC: 'Indian equity',
  EQUITY_INTERNATIONAL: 'international equity',
  DEBT: 'debt',
  GOLD: 'gold',
  REAL_ASSETS: 'real assets',
  CASH_EQUIVALENT: 'cash and deposits',
  OTHER_ALT: 'alternatives',
};

/** Buckets surplus cash may be deployed into: investable, and not cash itself. */
const DEPLOYABLE_BUCKETS: AdvisorAssetBucketValue[] = INVESTABLE_BUCKETS.filter(
  (b) => b !== 'CASH_EQUIVALENT',
);

function mostUnderweightDeployableBucket(facts: AdvisorFacts): DriftRow | null {
  const targets = facts.modelPortfolio?.targets ?? [];
  if (targets.length === 0) return null;
  const rows = computeDrift(
    facts.currentAllocation ?? [],
    targets,
    facts.totalPortfolioValue ?? ZERO,
  ).filter((r) => DEPLOYABLE_BUCKETS.includes(r.bucket) && r.driftPp < 0);
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    if (a.driftPp !== b.driftPp) return a.driftPp - b.driftPp;
    return a.bucket.localeCompare(b.bucket);
  })[0]!;
}

export const cashDeploymentRule: AdvisorRule = {
  id: 'CASH_DEPLOYMENT',
  version: 1,
  description:
    'Deploys liquid cash held above the emergency-fund target into the most underweight investable bucket. Silent whenever the emergency-fund target is unknown.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    if (!facts) return [];
    const liquidity = facts.liquidity;
    if (!liquidity) return [];

    // No known expenses means no target means no surplus. Say nothing.
    if (liquidity.emergencyFundTarget == null) return [];

    const surplus = liquidity.surplusOverTarget;
    if (surplus == null || !surplus.isFinite()) return [];
    if (surplus.lessThanOrEqualTo(MIN_CASH_SURPLUS_INR)) return [];

    const total = facts.totalPortfolioValue ?? ZERO;

    // One instruction never moves more than a quarter of the portfolio, which
    // is what keeps an all-cash new user from getting a single monolithic
    // "invest ₹42,00,000" card and nothing else.
    const cap = total.greaterThan(ZERO)
      ? total.times(MAX_SINGLE_TRADE_PCT).dividedBy(100)
      : surplus;
    const amount = Decimal.min(surplus, cap);
    if (amount.lessThanOrEqualTo(MIN_CASH_SURPLUS_INR)) return [];

    const target = mostUnderweightDeployableBucket(facts);
    const resolved = target ? resolveProduct(target.bucket, facts) : null;

    const action: TradeAction[] = [];
    if (target && resolved) {
      action.push({
        direction: 'BUY',
        bucket: target.bucket,
        portfolioId: facts.defaultPortfolioId,
        instrumentName: resolved.product.label,
        fundId: resolved.product.fundId,
        stockId: resolved.product.stockId,
        isin: null,
        holdingKey: null,
        units: unitsFor(amount, null, false),
        amountInr: money(amount),
      });
    }

    const capped = amount.lessThan(surplus);
    const destinationClause =
      target && resolved
        ? `Move ${inr(amount)} into ${resolved.product.label}: your ${BUCKET_LABEL[target.bucket]} allocation is ` +
          `${Math.abs(target.driftPp).toFixed(1)}pp below its ${target.targetPct.toFixed(0)}% target, so that is where ` +
          `the money does the most work.`
        : `That ${inr(amount)} should be invested, but we cannot name a fund for it yet — complete your risk profile ` +
          'so we can set target weights and pick one.';

    const cappedClause = capped
      ? ` We have sized this at ${inr(amount)} rather than the full surplus because no single instruction moves more than ` +
        `${MAX_SINGLE_TRADE_PCT}% of your portfolio at once; the remaining ${inr(surplus.minus(amount))} follows next.`
      : '';

    const expensesClause =
      liquidity.monthlyExpenses != null
        ? `${inr(liquidity.monthlyExpenses)} a month in expenses puts your ${EMERGENCY_FUND_MONTHS}-month emergency fund at ${inr(liquidity.emergencyFundTarget!)}`
        : `Your ${EMERGENCY_FUND_MONTHS}-month emergency fund target is ${inr(liquidity.emergencyFundTarget!)}`;

    const rationale =
      `${expensesClause}, and you are holding ${inr(liquidity.liquidAssets)} in liquid assets — ` +
      `${inr(surplus)} more than that buffer needs. Cash earning nothing is the quietest drag on a portfolio. ` +
      `${destinationClause}${cappedClause}`;

    return [
      {
        ruleId: cashDeploymentRule.id,
        ruleVersion: cashDeploymentRule.version,
        category: 'CASH_DEPLOYMENT',
        priority: BASE_PRIORITY + materialityOffset(amount, total),
        action,
        rationale,
        inputsUsed: {
          asOf: facts.asOf?.toISOString() ?? null,
          minCashSurplusInr: MIN_CASH_SURPLUS_INR.toString(),
          maxSingleTradePct: MAX_SINGLE_TRADE_PCT,
          emergencyFundMonths: EMERGENCY_FUND_MONTHS,
          totalPortfolioValue: total.toString(),
          defaultPortfolioId: facts.defaultPortfolioId ?? null,
          liquidity: {
            liquidAssets: liquidity.liquidAssets.toString(),
            monthlyExpenses: liquidity.monthlyExpenses ? liquidity.monthlyExpenses.toString() : null,
            emergencyFundTarget: liquidity.emergencyFundTarget.toString(),
            surplusOverTarget: surplus.toString(),
          },
          deployedAmountInr: amount.toString(),
          cappedByMaxSingleTrade: capped,
          targetBucket: target
            ? {
                bucket: target.bucket,
                currentPct: target.currentPct,
                targetPct: target.targetPct,
                driftPp: target.driftPp,
                driftValue: target.driftValue.toString(),
              }
            : null,
          resolvedProduct: resolved
            ? { label: resolved.product.label, provenance: resolved.provenance.kind }
            : null,
        },
        provenance: target && resolved ? resolved.provenance : { kind: 'NONE' },
        dedupeKey: `CASH_DEPLOYMENT:${target ? target.bucket : 'UNRESOLVED'}`,
      },
    ];
  },
};

export default cashDeploymentRule;
