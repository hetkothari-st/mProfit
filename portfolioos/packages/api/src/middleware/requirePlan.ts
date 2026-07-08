import type { Request, Response, NextFunction } from 'express';
import { FEATURE_MIN_TIER, hasFeature, type FeatureFlag, type PlanTierValue } from '@portfolioos/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

/**
 * Gate a route behind a minimum plan tier. Gated purely on `plan`, same
 * as any user — ADMIN no longer auto-bypasses (it used to, but that
 * made it impossible to QA tier gating from an admin account: switching
 * plan via the dev-set-plan endpoint had no visible effect since every
 * feature check short-circuited on role first). An admin who wants full
 * access can still just set their own plan to PRO_ADVISOR.
 */
export function requireFeature(feature: FeatureFlag) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!hasFeature(req.user.plan as PlanTierValue, feature)) {
      return next(
        new ForbiddenError(`This feature requires the ${FEATURE_MIN_TIER[feature]} plan or higher`),
      );
    }
    next();
  };
}
