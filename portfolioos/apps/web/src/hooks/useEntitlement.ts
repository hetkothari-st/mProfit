import { FEATURE_MIN_TIER, hasFeature, type FeatureFlag, type PlanTierValue } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';

export interface EntitlementResult {
  allowed: boolean;
  requiredTier: PlanTierValue;
}

/**
 * Reads the current user's plan from auth state and checks it against
 * the single source of truth in `@portfolioos/shared`'s `FEATURE_MIN_TIER`.
 * Gated purely on `plan`, mirroring the backend `requireFeature` — no
 * ADMIN bypass, so switching plan on an admin account actually changes
 * what's locked (needed to QA tier gating without a second account).
 */
export function useEntitlement(feature: FeatureFlag): EntitlementResult {
  const user = useAuthStore((s) => s.user);
  const requiredTier = FEATURE_MIN_TIER[feature];
  if (!user) return { allowed: false, requiredTier };
  return { allowed: hasFeature(user.plan as PlanTierValue, feature), requiredTier };
}
