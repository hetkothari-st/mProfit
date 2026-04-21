import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/jwt.service.js';
import { UnauthorizedError } from '../lib/errors.js';
import { userContext } from '../lib/requestContext.js';
import type { UserRole } from '@prisma/client';

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
      plan: payload.plan as never,
    };
    // Run the rest of the request chain inside the ambient user context so
    // Prisma's $allOperations hook can set Postgres session variable
    // `app.current_user_id` before each user-scoped query — matching the RLS
    // policies from migration 20260421140000_phase_4_5_rls.
    userContext.run({ userId: payload.sub }, () => next());
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new UnauthorizedError('Insufficient role'));
    }
    next();
  };
}
