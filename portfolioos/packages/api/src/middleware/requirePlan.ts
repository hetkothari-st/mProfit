import type { Request, Response, NextFunction } from 'express';
import { FEATURE_MIN_TIER, hasFeature, type FeatureFlag, type PlanTierValue } from '@everypaisa/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import type { PlanTier } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { hasEffectiveFeature } from '../lib/effectivePlan.js';
import { parseClientId } from '../lib/clientHeader.js';
import { getCaScope } from '../services/ca/caAccess.service.js';

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

type PlanHolder = { plan: PlanTier; planExpiresAt: Date | null };

/**
 * The plan that pays for a family: its creator's. Read as system because the
 * caller may not be allowed to read the creator's user row; the select is
 * bounded to the two plan columns. Membership is still checked by the route
 * (getEffectiveScope), so this only answers "is the family on a paid plan".
 */
async function familyPayer(familyId: string): Promise<PlanHolder | null> {
  const family = await runAsSystem(() =>
    prisma.family.findUnique({
      where: { id: familyId },
      select: { createdBy: { select: { plan: true, planExpiresAt: true } } },
    }),
  );
  return family?.createdBy ?? null;
}

/**
 * Gate a family route on the family's plan: the caller's own plan, or the
 * plan of whoever created the family (`:familyId`). Invited members on FREE
 * or PLUS see the household views their family pays for.
 */
export function requireFamilyFeature(
  feature: FeatureFlag,
  lookupPayer: (familyId: string) => Promise<PlanHolder | null> = familyPayer,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (hasFeature(req.user.plan as PlanTierValue, feature)) return next();
    const refuse = new ForbiddenError(`This feature requires the ${FEATURE_MIN_TIER[feature]} plan or higher`);
    const familyId = req.params.familyId;
    if (!familyId) return next(refuse);
    lookupPayer(familyId).then(
      (payer) => next(hasEffectiveFeature(payer, feature) ? undefined : refuse),
      next,
    );
  };
}

/**
 * The plan of the client a professional is acting for — after `getCaScope`
 * has confirmed the grant. A missing, revoked, pending or out-of-window grant
 * throws (403) here, so no plan is ever read for a client the caller may not
 * act for. Read as system for the same reason as `familyPayer`: the CA may not
 * read the client's user row, and only the two plan columns are selected.
 */
async function clientPayer(callerId: string, clientId: string): Promise<PlanHolder | null> {
  const scope = await getCaScope(callerId, clientId);
  return runAsSystem(() =>
    prisma.user.findUnique({
      where: { id: scope.subjectUserId },
      select: { plan: true, planExpiresAt: true },
    }),
  );
}

/**
 * Gate a report route on the plan of whoever the report is FOR.
 *
 * Normally that is the caller, and this behaves exactly like `requireFeature`.
 * When the request carries a client (`X-Acting-As-Client` / `?clientId=`), the
 * professional is acting under a client's grant, and the CA workspace's rule
 * applies (see the comment on `requireAdvisorPlan` in ca.routes.ts): acting
 * for a client who invited you is free — the account holder is the customer.
 * So the CLIENT's plan decides, not the professional's. The caller's own plan
 * still counts too, so an advisor on Pro/Advisor keeps producing every report
 * for the clients of their own practice.
 *
 * Deliberately a separate middleware, not a change to `requireFeature`: the
 * client header must never satisfy a gate on the professional's OWN features
 * (onboarding clients, the CA workspace itself).
 */
export function requireFeatureForSubject(
  feature: FeatureFlag,
  lookupClientPlan: (callerId: string, clientId: string) => Promise<PlanHolder | null> = clientPayer,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (hasFeature(req.user.plan as PlanTierValue, feature)) return next();
    const refuse = new ForbiddenError(`This feature requires the ${FEATURE_MIN_TIER[feature]} plan or higher`);
    const clientId = parseClientId(req);
    if (!clientId) return next(refuse);
    lookupClientPlan(req.user.id, clientId).then(
      (payer) => next(hasEffectiveFeature(payer, feature) ? undefined : refuse),
      next,
    );
  };
}
