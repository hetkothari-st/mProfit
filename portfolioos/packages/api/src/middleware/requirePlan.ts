import type { Request, Response, NextFunction } from 'express';
import { FEATURE_MIN_TIER, hasFeature, type FeatureFlag, type PlanTierValue } from '@portfolioos/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

/**
 * Gate a route behind a minimum plan tier. ADMIN-role users always pass
 * regardless of their own `plan` value — this is the founder/QA bypass
 * relied on by the payments task that follows this one.
 */
export function requireFeature(feature: FeatureFlag) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (req.user.role === 'ADMIN') return next();
    if (!hasFeature(req.user.plan as PlanTierValue, feature)) {
      return next(
        new ForbiddenError(`This feature requires the ${FEATURE_MIN_TIER[feature]} plan or higher`),
      );
    }
    next();
  };
}
