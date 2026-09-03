/**
 * RISK_PROFILE_REVIEW — the profile every other rule is steering by has gone
 * stale, or was never set.
 *
 * This is the only non-trade draft in the engine: `action` is always empty
 * because the instruction is "answer seven questions", not "move money". It
 * sits at the bottom of the priority order for the same reason — nothing is
 * mis-positioned this minute — but it is the upstream fix for most of the
 * silences elsewhere. REBALANCE_DRIFT, CASH_DEPLOYMENT and GOAL_SHORTFALL_SIP
 * all degrade or go quiet without a model portfolio, and a model portfolio
 * comes from a risk assessment.
 *
 * Firing on `assessmentId == null` matters as much as firing on age: a user
 * who has never been profiled sees an otherwise empty advice page, and this is
 * the draft that tells them why.
 */

import { Decimal } from 'decimal.js';
import { formatINR } from '@portfolioos/shared';
import { CATEGORY_BASE_PRIORITY, RISK_PROFILE_REVIEW_MONTHS } from '../constants.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft } from '../types.js';

const ZERO = new Decimal(0);
const BASE_PRIORITY = CATEGORY_BASE_PRIORITY.RISK_PROFILE_REVIEW;

const money = (d: Decimal): string => d.abs().toFixed(2);
const inr = (d: Decimal): string => formatINR(money(d));

/**
 * Whole calendar months between two dates, from `facts.asOf` rather than a
 * clock. Day-of-month aware, so 1 Jan → 31 Jan is 0 months, not 1 — a review
 * that is one day short of due should not be called due.
 */
function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthYear(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const riskProfileReviewRule: AdvisorRule = {
  id: 'RISK_PROFILE_REVIEW',
  version: 1,
  description:
    'Prompts a risk-profile reassessment when the questionnaire has never been completed or its answers are older than the review interval.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    if (!facts || !facts.asOf) return [];
    const profile = facts.riskProfile;
    if (!profile) return [];

    const neverAssessed = profile.assessmentId == null || profile.assessedAt == null;
    const monthsOld =
      profile.assessedAt != null ? monthsBetween(profile.assessedAt, facts.asOf) : null;
    const stale = monthsOld != null && monthsOld >= RISK_PROFILE_REVIEW_MONTHS;

    if (!neverAssessed && !stale) return [];

    const total = facts.totalPortfolioValue ?? ZERO;

    const rationale = neverAssessed
      ? `We have no risk profile on file for you, so the ${inr(total)} in your portfolio is being read against no target ` +
        `allocation at all — that is why the rebalancing and cash-deployment advice on this page is thin. The ` +
        `questionnaire is 7 questions, sets your target weights, and is due for review every ` +
        `${RISK_PROFILE_REVIEW_MONTHS} months after that.`
      : `Your risk profile was last set in ${monthYear(profile.assessedAt!)}, ${monthsOld} months ago, and reviews are due ` +
        `every ${RISK_PROFILE_REVIEW_MONTHS} months. Every rebalancing instruction on this page is measured against the ` +
        `${profile.category ?? 'target'} weights those answers produced, and they are now steering ${inr(total)}. ` +
        'Retake the 7-question assessment so the targets match your circumstances rather than your circumstances then.';

    return [
      {
        ruleId: riskProfileReviewRule.id,
        ruleVersion: riskProfileReviewRule.version,
        category: 'RISK_PROFILE_REVIEW',
        // No rupee leg to rank by, and at most one such draft exists per run,
        // so materiality reduces to a single distinction: never assessed is
        // more urgent than merely out of date.
        priority: BASE_PRIORITY + (neverAssessed ? 0 : 1),
        action: [],
        rationale,
        inputsUsed: {
          asOf: facts.asOf.toISOString(),
          riskProfileReviewMonths: RISK_PROFILE_REVIEW_MONTHS,
          totalPortfolioValue: total.toString(),
          riskProfile: {
            assessmentId: profile.assessmentId,
            category: profile.category,
            age: profile.age,
            taxSlabPct: profile.taxSlabPct,
            assessedAt: profile.assessedAt ? profile.assessedAt.toISOString() : null,
          },
          monthsSinceAssessment: monthsOld,
          trigger: neverAssessed ? 'NEVER_ASSESSED' : 'STALE',
          modelPortfolioVersionId: facts.modelPortfolio?.versionId ?? null,
        },
        // Advisory only — nothing is bought, so nothing is attributed.
        provenance: { kind: 'NONE' },
        dedupeKey: `RISK_PROFILE_REVIEW:${profile.assessmentId ?? 'NONE'}`,
      },
    ];
  },
};

export default riskProfileReviewRule;
