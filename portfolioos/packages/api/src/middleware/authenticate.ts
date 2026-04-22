import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/jwt.service.js';
import { UnauthorizedError } from '../lib/errors.js';
import { enterUserContext } from '../lib/requestContext.js';
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
    // Bind the ambient user context to the current request's async resource so
    // Prisma's $allOperations hook sees the same userId for every downstream
    // query — including those scheduled by callback-based middleware like
    // multer's DiskStorage. Using `enterWith` (not `run(cb)`) is critical
    // because `run(fn)` unwinds once its synchronous callback returns, and
    // some downstream stream/callback chains don't propagate the ALS store.
    // `enterWith` sets the store on this async resource and every descendant,
    // which matches the lifetime of the HTTP request.
    enterUserContext(payload.sub);
    next();
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
