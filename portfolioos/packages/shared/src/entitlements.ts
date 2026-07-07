/**
 * Single source of truth for tier ordering + feature gates. Both the
 * backend (`requireFeature` middleware) and the frontend (`useEntitlement`,
 * `<LockedFeature>`) import from this file — never duplicate a
 * feature-to-tier mapping anywhere else.
 *
 * Strict linear ladder: each tier includes everything in every tier below
 * it (FAMILY gets PLUS features too; PRO_ADVISOR gets FAMILY + PLUS too, in
 * addition to the accounting module).
 */
export const PLAN_TIER_ORDER = ['FREE', 'PLUS', 'FAMILY', 'PRO_ADVISOR'] as const;

export type PlanTierValue = (typeof PLAN_TIER_ORDER)[number];

export function planRank(tier: PlanTierValue): number {
  return PLAN_TIER_ORDER.indexOf(tier);
}

export function meetsMinTier(userTier: PlanTierValue, minTier: PlanTierValue): boolean {
  return planRank(userTier) >= planRank(minTier);
}

// Feature flags → minimum tier required. Extend this list as new gated
// features are added — this is the ONE place tier requirements live.
export const FEATURE_MIN_TIER = {
  MULTIPLE_PORTFOLIOS: 'PLUS',
  TAX_REPORT_CATALOG: 'PLUS', // the 30+ report download catalog beyond the Free basics
  AA_FINVU_AUTOIMPORT: 'PLUS',
  AI_INSIGHTS: 'PLUS',
  GOAL_PROJECTIONS: 'PLUS',
  FAMILY_SHARING: 'FAMILY',
  ACCOUNTING_MODULE: 'PRO_ADVISOR', // Trial Balance, P&L, Balance Sheet, Chart of Accounts, Tally export
  UNLIMITED_CLIENTS: 'PRO_ADVISOR',
  FNO_SCHEDULE_43: 'PRO_ADVISOR',
  PRIORITY_AA_REFRESH: 'PRO_ADVISOR',
} as const satisfies Record<string, PlanTierValue>;

export type FeatureFlag = keyof typeof FEATURE_MIN_TIER;

export function hasFeature(userTier: PlanTierValue, feature: FeatureFlag): boolean {
  return meetsMinTier(userTier, FEATURE_MIN_TIER[feature]);
}

// Numeric caps that aren't simple on/off flags. Placeholder values — flag
// clearly as defaults pending real business-side confirmation, and keep
// them in exactly this one object so they're trivial to tune later.
export const PLAN_LIMITS: Record<PlanTierValue, { maxPortfolios: number | null }> = {
  FREE: { maxPortfolios: 1 },
  PLUS: { maxPortfolios: 5 }, // placeholder — "multiple", exact number not specified upstream
  FAMILY: { maxPortfolios: 5 }, // placeholder
  PRO_ADVISOR: { maxPortfolios: null }, // null = unlimited
};
