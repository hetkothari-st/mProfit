import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/jwt.service.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { enterUserContext } from '../lib/requestContext.js';
import type { UserRole, PlanTier } from '@prisma/client';
import {
  ACT_AS_HEADER,
  isAccountRoute,
  resolveActAs,
} from '../services/family/managedProfile.service.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      plan: payload.plan as PlanTier,
    };
    // Bind the ambient user context to the current request's async resource so
    // Prisma's $allOperations hook sees the same userId for every downstream
    // query — including those scheduled by callback-based middleware like
    // multer's DiskStorage. Using `enterWith` (not `run(cb)`) is critical
    // because `run(fn)` unwinds once its synchronous callback returns, and
    // some downstream stream/callback chains don't propagate the ALS store.
    // `enterWith` sets the store on this async resource and every descendant,
    // which matches the lifetime of the HTTP request.
    enterUserContext(payload.sub);

    // Acting for a managed family profile (see managedProfile.service). The
    // header is checked against the database on every request — a revoked
    // membership ends the manager's access on their very next click.
    const actAs = req.header(ACT_AS_HEADER)?.trim();
    if (!actAs || actAs === payload.sub) {
      next();
      return;
    }
    if (isAccountRoute(req.originalUrl)) {
      throw new ForbiddenError('Switch back to your own account to do this.');
    }
    const manager = req.user;
    resolveActAs(manager, actAs)
      .then((profile) => {
        req.actor = manager;
        req.user = profile;
        // Rebinds RLS to the profile for everything downstream.
        enterUserContext(profile.id);
        next();
      })
      .catch(next);
  } catch (err) {
    next(err);
  }
}

/**
 * Roles a user can pick for themselves on the public signup form.
 *
 * These describe who someone says they are, not what they are allowed to do,
 * so they must never be used as an authorization grant. Today nothing gates
 * on them — the CA workspace, for example, is gated by the PRO_ADVISOR plan,
 * not the CA role — but `requireRole('CA')` would be an easy line to write,
 * and it would silently hand that capability to anyone who ticked the box at
 * registration. requireRole() refuses them outright so that mistake fails at
 * startup instead of in production.
 */
export const SELF_ASSIGNABLE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'INVESTOR',
  'HNI',
  'FAMILY_OFFICE',
  'ADVISOR',
  'CA',
]);

export function requireRole(...roles: UserRole[]) {
  const unsafe = roles.filter((r) => SELF_ASSIGNABLE_ROLES.has(r));
  if (unsafe.length > 0) {
    throw new Error(
      `requireRole(${unsafe.join(', ')}): these roles are self-assignable at signup ` +
        `and cannot be used for authorization. Gate on a plan or a verified attribute instead.`,
    );
  }
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new UnauthorizedError('Insufficient role'));
    }
    next();
  };
}
