import type { Request, Response, NextFunction } from 'express';
import { enterUserContext } from '../lib/requestContext.js';

/**
 * Re-enter the ALS user context on the current async resource.
 *
 * Why: `authenticate` calls `enterUserContext` on the request-root async
 * resource, which normally propagates to every descendant via AsyncLocalStorage.
 * Multer's streaming multipart parser, however, reads the request body through
 * busboy event emitters and setImmediate callbacks that don't always preserve
 * the store when the parser's final `next()` is called back into Express. The
 * symptom is that `getCurrentUserId()` returns null inside the upload
 * controller, the Prisma $allOperations hook skips the user-context set_config,
 * and Postgres RLS rejects the INSERT with code 42501 ("new row violates row-
 * level security policy").
 *
 * Register this middleware AFTER any multipart parser (multer) and BEFORE the
 * controller so the store is freshly attached to the controller's execution
 * chain. Safe to stack with the authenticate middleware — idempotent.
 */
export function rebindUserContext(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.id) enterUserContext(req.user.id);
  next();
}
