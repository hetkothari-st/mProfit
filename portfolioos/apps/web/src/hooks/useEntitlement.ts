import { FEATURE_MIN_TIER, hasFeature, type FeatureFlag, type PlanTierValue } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';

export interface EntitlementResult {
  allowed: boolean;
  requiredTier: PlanTierValue;
}

/**
 * Reads the current user's plan from auth state and checks it against
 * the single source of truth in `@portfolioos/shared`'s `FEATURE_MIN_TIER`.
 * ADMIN-role users always pass, mirroring the backend `requireFeature`
 * bypass.
 */
export function useEntitlement(feature: FeatureFlag): EntitlementResult {
  const user = useAuthStore((s) => s.user);
  const requiredTier = FEATURE_MIN_TIER[feature];
  if (!user) return { allowed: false, requiredTier };
  if (user.role === 'ADMIN') return { allowed: true, requiredTier };
  return { allowed: hasFeature(user.plan as PlanTierValue, feature), requiredTier };
}
