import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import { resolveNomineeSession } from '../services/legacy/tokens.service.js';

/**
 * Nominee-only auth for /api/legacy-view. Deliberately separate from
 * `authenticate`: a nominee session is never a user JWT, so it can reach
 * nothing else in the API.
 */
export function legacySession(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.header('x-legacy-session');
  if (!raw) return next(new UnauthorizedError('Session expired. Open your link again.'));
  resolveNomineeSession(raw)
    .then((s) => {
      if (!s) return next(new UnauthorizedError('Session expired. Open your link again.'));
      req.legacyNominee = s;
      next();
    })
    .catch(next);
}
