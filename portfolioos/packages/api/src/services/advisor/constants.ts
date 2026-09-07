/**
 * Every threshold the advisor engine reasons with, in one place.
 *
 * These are calibration, not implementation detail: each one decides whether a
 * real person is told to move real money. They live here rather than inline in
 * rules so the full set can be reviewed at a glance and changed deliberately,
 * following the convention healthScoreMath.WEIGHTS already sets.
 */

import { Decimal } from 'decimal.js';
import { REBALANCE_BAND_PP, EMERGENCY_FUND_MONTHS } from '@portfolioos/shared';
import type { AdvisorAssetBucketValue, AdvisorRecommendationCategoryValue } from './types.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';

/** Bumped when engine-wide behaviour changes in a way rule versions do not
 *  capture. Stamped on every AdvisorRun. */
export const ADVISOR_ENGINE_VERSION = '1.0.0';

/** Below this, an instruction costs more in friction than it earns. */
export const MIN_TRADE_INR = new Decimal(5_000);

/** Drift beyond this many percentage points is worth acting on. Tighter and
 *  the user is nagged by noise; looser and real drift sits uncorrected.
 *
 *  Defined in `@portfolioos/shared` (finance/planningBands.ts) and re-exported
 *  here so existing importers keep their path. It moved down into shared
 *  because the MF analytics ALLOCATION_DRIFT rule must use the same band
 *  (`docs/mf-analytics/04-PORTFOLIO-ANALYSIS.md §3`) — a portfolio called
 *  drifted on one page and not the other is worse than either answer alone,
 *  and shared cannot import from api, so a second copy was the only
 *  alternative. */
export { REBALANCE_BAND_PP };

/** No single instruction may move more than this share of the portfolio at
 *  once. Stops a freshly-onboarded, wildly-skewed portfolio from producing one
 *  enormous recommendation that dominates everything else.
 *
 *  In PERCENTAGE POINTS, like every other `_PCT` here — it was 0.25 meaning
 *  the same 25%, so the file held two conventions at once and callers had to
 *  know which applied to which constant. Anything named `_PCT` or `_PP` is
 *  percentage points; divide by 100 to get a multiplier. */
export const MAX_SINGLE_TRADE_PCT = 25;

/** A single holding above this share of the portfolio is a concentration
 *  risk. Deliberately tighter than the health score's 50% danger line: this
 *  page prescribes, so it should speak up well before the diagnostic does. */
export const CONCENTRATION_CAP_PCT = 15;

/** Losses smaller than this are not worth a taxable event. */
export const MIN_HARVEST_LOSS_INR = new Decimal(5_000);

/** Floor for a monthly SIP top-up. Deliberately far below MIN_TRADE_INR:
 *  that constant is a one-off-trade friction floor, and reusing it here would
 *  suppress the ₹1-3k/month increases that most real goal shortfalls need. */
export const MIN_SIP_TOPUP_INR = new Decimal(500);

/** Idle cash above the emergency-fund target must exceed this before it is
 *  worth deploying. */
export const MIN_CASH_SURPLUS_INR = new Decimal(25_000);

/** Months of expenses the emergency fund should cover. Now defined once in
 *  `@portfolioos/shared` and re-exported, so healthScoreMath, this engine and
 *  the MF analytics NO_LIQUID_BUFFER rule cannot disagree about the target. */
export { EMERGENCY_FUND_MONTHS };

/** A risk profile older than this should be revisited — circumstances move. */
export const RISK_PROFILE_REVIEW_MONTHS = 12;

/** How much a re-run's figures must move before a standing recommendation is
 *  superseded rather than left alone. Without a band, a rounding-level price
 *  tick would replace every recommendation nightly. */
export const MATERIALITY_TOLERANCE = 0.1;

/**
 * Priority bands. Lower sorts first.
 *   1-10  deadline-driven — a window closes and the chance is gone
 *   11-30 material — real money mis-positioned right now
 *   31-60 optimisation — worth doing, no clock on it
 */
export const CATEGORY_BASE_PRIORITY: Record<AdvisorRecommendationCategoryValue, number> = {
  TAX_HARVEST: 5,
  CONCENTRATION_TRIM: 15,
  REBALANCE: 20,
  CASH_DEPLOYMENT: 35,
  GOAL_SHORTFALL_SIP: 40,
  RISK_PROFILE_REVIEW: 55,
};

/**
 * Default target weights per risk category. Seeded once per user on first
 * questionnaire submission, then editable — each edit writes a new
 * ModelPortfolioVersion rather than mutating these.
 *
 * REAL_ASSETS and OTHER_ALT are targeted at 0: the engine reports what is held
 * there but will not tell anyone to buy property or crypto to hit a weight.
 * Each column sums to 100, asserted by a unit test rather than by eye.
 */
export const DEFAULT_TARGET_WEIGHTS: Record<
  RiskCategoryValue,
  Record<AdvisorAssetBucketValue, number>
> = {
  CONSERVATIVE: {
    EQUITY_DOMESTIC: 20,
    EQUITY_INTERNATIONAL: 0,
    DEBT: 50,
    GOLD: 10,
    REAL_ASSETS: 0,
    CASH_EQUIVALENT: 20,
    OTHER_ALT: 0,
  },
  BALANCED: {
    EQUITY_DOMESTIC: 40,
    EQUITY_INTERNATIONAL: 5,
    DEBT: 37,
    GOLD: 8,
    REAL_ASSETS: 0,
    CASH_EQUIVALENT: 10,
    OTHER_ALT: 0,
  },
  GROWTH: {
    EQUITY_DOMESTIC: 58,
    EQUITY_INTERNATIONAL: 10,
    DEBT: 22,
    GOLD: 5,
    REAL_ASSETS: 0,
    CASH_EQUIVALENT: 5,
    OTHER_ALT: 0,
  },
  AGGRESSIVE: {
    EQUITY_DOMESTIC: 72,
    EQUITY_INTERNATIONAL: 10,
    DEBT: 12,
    GOLD: 3,
    REAL_ASSETS: 0,
    CASH_EQUIVALENT: 3,
    OTHER_ALT: 0,
  },
};

export const MODEL_PORTFOLIO_NAMES: Record<RiskCategoryValue, string> = {
  CONSERVATIVE: 'Conservative',
  BALANCED: 'Balanced',
  GROWTH: 'Growth',
  AGGRESSIVE: 'Aggressive',
};
