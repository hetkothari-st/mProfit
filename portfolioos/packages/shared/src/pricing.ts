import type { PlanTierValue } from './entitlements.js';

export type BillingCycle = 'MONTHLY' | 'ANNUAL';

export interface PlanPrice {
  /** Amount in paise (smallest INR unit) — what actually gets charged. */
  amountPaise: number;
  cycle: BillingCycle;
}

/**
 * Placeholder prices pending real business-side confirmation (see
 * TASK_09_pricing_tiers_gating.md). Single source of truth for both the
 * pricing page's display and the amount Razorpay actually charges — never
 * duplicate these numbers elsewhere. FREE has no price; it's never sent to
 * Razorpay.
 */
export const PLAN_PRICING: Partial<Record<PlanTierValue, PlanPrice[]>> = {
  PLUS: [
    { cycle: 'MONTHLY', amountPaise: 49_900 },
    { cycle: 'ANNUAL', amountPaise: 4_999_00 },
  ],
  FAMILY: [{ cycle: 'MONTHLY', amountPaise: 89_900 }],
  PRO_ADVISOR: [{ cycle: 'MONTHLY', amountPaise: 199_900 }],
};

export function planPriceFor(tier: PlanTierValue, cycle: BillingCycle): PlanPrice | null {
  return PLAN_PRICING[tier]?.find((p) => p.cycle === cycle) ?? null;
}

export function formatPaiseAsRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
