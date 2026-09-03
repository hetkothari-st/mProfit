/**
 * GOAL_SHORTFALL_SIP — a goal the current contribution will not reach.
 *
 * For every goal the goals service has already judged off-track, this works
 * out the monthly SIP the remaining gap actually requires, subtracts what is
 * already going in, and prescribes the top-up. The destination is the most
 * underweight investable bucket, so closing a goal shortfall also nudges the
 * allocation back toward the model rather than fighting it.
 *
 * Two deliberate degradations, both of which keep the advice honest instead of
 * dropping it:
 *   • No model portfolio, or nothing approved in the target bucket, means we
 *     cannot name a fund. The draft is still emitted with the rupee figure and
 *     an empty action list rather than a BUY leg pointing at nothing —
 *     "increase by ₹4,200/month" is useful; "increase by ₹4,200/month into
 *     <blank>" is not.
 *   • A goal whose required SIP cannot be computed (no horizon, no return
 *     assumption) is skipped entirely. There is no honest number to print.
 */

import { Decimal } from 'decimal.js';
import { formatINR } from '@portfolioos/shared';
import { INVESTABLE_BUCKETS } from '../assetBuckets.js';
import { CATEGORY_BASE_PRIORITY, MIN_SIP_TOPUP_INR } from '../constants.js';
import { computeDrift, unitsFor, type DriftRow } from '../allocationMath.js';
import { resolveProduct } from '../productResolution.js';
import { requiredMonthlySip } from '../../goalMath.js';
import type {
  AdvisorAssetBucketValue,
  AdvisorFacts,
  AdvisorGoalFact,
  AdvisorRule,
  RecommendationDraft,
  TradeAction,
} from '../types.js';

const ZERO = new Decimal(0);
const BASE_PRIORITY = CATEGORY_BASE_PRIORITY.GOAL_SHORTFALL_SIP;

const money = (d: Decimal): string => d.abs().toFixed(2);
const inr = (d: Decimal): string => formatINR(money(d));

/** Bigger rupee impact sorts first inside the category's band (0 = largest).
 *  Duplicated per rule file on purpose — see rebalanceDrift.rule.ts. The
 *  monthly top-up is annualised first so a ₹5,000/month gap is not judged
 *  against a portfolio as though it were a one-off ₹5,000 trade. */
function materialityOffset(amount: Decimal, totalValue: Decimal): number {
  if (!totalValue || totalValue.lessThanOrEqualTo(ZERO)) return 4;
  const share = amount.abs().times(12).dividedBy(totalValue).toNumber();
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

/** The investable bucket furthest below its target, or null when there is no
 *  model portfolio to be below. Ties broken by bucket name for determinism. */
function mostUnderweightBucket(facts: AdvisorFacts): DriftRow | null {
  const targets = facts.modelPortfolio?.targets ?? [];
  if (targets.length === 0) return null;
  const rows = computeDrift(
    facts.currentAllocation ?? [],
    targets,
    facts.totalPortfolioValue ?? ZERO,
  ).filter((r) => INVESTABLE_BUCKETS.includes(r.bucket) && r.driftPp < 0);
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    if (a.driftPp !== b.driftPp) return a.driftPp - b.driftPp;
    return a.bucket.localeCompare(b.bucket);
  })[0]!;
}

export const goalShortfallSipRule: AdvisorRule = {
  id: 'GOAL_SHORTFALL_SIP',
  version: 1,
  description:
    'For each off-track goal, prescribes the monthly SIP top-up its remaining gap requires and routes it into the most underweight investable bucket.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    if (!facts) return [];
    const goals = facts.goals ?? [];
    if (goals.length === 0) return [];

    // Resolved once: the destination is a property of the portfolio, not of
    // any one goal, and recomputing it per goal would only cost time.
    const target = mostUnderweightBucket(facts);
    const resolved = target ? resolveProduct(target.bucket, facts) : null;

    const drafts: RecommendationDraft[] = [];

    for (const goal of goals) {
      if (!goal) continue;
      // Only an explicit false. null means the goals service could not judge
      // it, and "we don't know" is not a shortfall.
      if (goal.isOnTrack !== false) continue;

      const remaining = goal.remaining ?? ZERO;
      if (!remaining.isFinite() || remaining.lessThanOrEqualTo(ZERO)) continue;

      const required = requiredMonthlySip(remaining, goal.yearsRemaining, goal.expectedReturnPct);
      if (required == null || !required.isFinite() || required.lessThanOrEqualTo(ZERO)) continue;

      const existing = goal.currentMonthlyContribution ?? ZERO;
      const gap = required.minus(existing);
      if (gap.lessThanOrEqualTo(ZERO)) continue;
      if (gap.lessThan(MIN_SIP_TOPUP_INR)) continue;

      drafts.push(buildDraft(facts, goal, { required, existing, gap, target, resolved }));
    }

    return drafts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.dedupeKey.localeCompare(b.dedupeKey);
    });
  },
};

interface SipMath {
  required: Decimal;
  existing: Decimal;
  gap: Decimal;
  target: DriftRow | null;
  resolved: ReturnType<typeof resolveProduct>;
}

function buildDraft(
  facts: AdvisorFacts,
  goal: AdvisorGoalFact,
  m: SipMath,
): RecommendationDraft {
  const action: TradeAction[] = [];
  if (m.target && m.resolved) {
    action.push({
      direction: 'BUY',
      bucket: m.target.bucket,
      portfolioId: facts.defaultPortfolioId,
      instrumentName: m.resolved.product.label,
      fundId: m.resolved.product.fundId,
      stockId: m.resolved.product.stockId,
      isin: null,
      holdingKey: null,
      units: unitsFor(m.gap, null, false),
      amountInr: money(m.gap),
    });
  }

  const contributionClause = m.existing.greaterThan(ZERO)
    ? `You are putting in ${inr(m.existing)} a month, so raise it by ${inr(m.gap)} to ${inr(m.required)}.`
    : `Nothing is going in monthly right now, so start a ${inr(m.gap)} monthly SIP.`;

  const destinationClause =
    m.target && m.resolved
      ? `Direct that ${inr(m.gap)} into ${m.resolved.product.label} — your ${BUCKET_LABEL[m.target.bucket]} allocation ` +
        `is ${Math.abs(m.target.driftPp).toFixed(1)}pp below its ${m.target.targetPct.toFixed(0)}% target, so this ` +
        `closes the goal gap and the allocation gap at the same time.`
      : 'We cannot name a fund for it yet — complete your risk profile so we can set target weights and pick one.';

  const years = Number.isFinite(goal.yearsRemaining) ? goal.yearsRemaining : 0;
  const rationale =
    `"${goal.name}" is off track: ${inr(goal.remaining)} of the ${inr(goal.targetAmount)} target is still to be funded ` +
    `over ${years.toFixed(1)} years, which needs ${inr(m.required)} a month at the ` +
    `${goal.expectedReturnPct != null ? `${goal.expectedReturnPct}% return assumed for this goal` : 'return assumed for this goal'}. ` +
    `${contributionClause} ${destinationClause}`;

  return {
    ruleId: goalShortfallSipRule.id,
    ruleVersion: goalShortfallSipRule.version,
    category: 'GOAL_SHORTFALL_SIP',
    priority: BASE_PRIORITY + materialityOffset(m.gap, facts.totalPortfolioValue ?? ZERO),
    action,
    rationale,
    inputsUsed: {
      asOf: facts.asOf?.toISOString() ?? null,
      minSipTopupInr: MIN_SIP_TOPUP_INR.toString(),
      totalPortfolioValue: (facts.totalPortfolioValue ?? ZERO).toString(),
      defaultPortfolioId: facts.defaultPortfolioId ?? null,
      goal: {
        goalId: goal.goalId,
        name: goal.name,
        category: goal.category,
        priority: goal.priority,
        targetAmount: goal.targetAmount.toString(),
        currentValue: goal.currentValue.toString(),
        remaining: goal.remaining.toString(),
        yearsRemaining: goal.yearsRemaining,
        expectedReturnPct: goal.expectedReturnPct,
        requiredCagr: goal.requiredCagr,
        isOnTrack: goal.isOnTrack,
        currentMonthlyContribution: goal.currentMonthlyContribution
          ? goal.currentMonthlyContribution.toString()
          : null,
      },
      requiredMonthlySipInr: m.required.toString(),
      monthlyTopUpInr: m.gap.toString(),
      targetBucket: m.target
        ? {
            bucket: m.target.bucket,
            currentPct: m.target.currentPct,
            targetPct: m.target.targetPct,
            driftPp: m.target.driftPp,
            driftValue: m.target.driftValue.toString(),
          }
        : null,
      resolvedProduct: m.resolved
        ? { label: m.resolved.product.label, provenance: m.resolved.provenance.kind }
        : null,
    },
    provenance: m.target && m.resolved ? m.resolved.provenance : { kind: 'NONE' },
    dedupeKey: `GOAL_SHORTFALL_SIP:${goal.goalId}`,
  };
}

export default goalShortfallSipRule;
