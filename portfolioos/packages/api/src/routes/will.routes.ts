import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import { costlyOperationLimiter } from '../middleware/rateLimit.js';
import { AppError, ForbiddenError } from '../lib/errors.js';
import * as will from '../controllers/will.controller.js';

/**
 * Will Maker is for the signed-in person's own will only (v1). A manager
 * acting for a managed family profile (X-Act-As, see authenticate) is refused
 * before any data is read.
 */
export function rejectActAs(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor) {
    next(new ForbiddenError('Will Maker works on your own account only. Switch back to your own account.'));
    return;
  }
  next();
}

/** A whole will payload is far smaller than this; anything bigger is refused before any will code runs. */
export const WILL_MAX_BODY_BYTES = 512 * 1024;

export function limitWillBody(req: Request, _res: Response, next: NextFunction): void {
  const length = Number(req.headers['content-length'] ?? 0);
  if ((req.method === 'PUT' || req.method === 'POST') && length > WILL_MAX_BODY_BYTES) {
    next(new AppError('This request is too large.', 413, 'WILL_BODY_TOO_LARGE'));
    return;
  }
  next();
}

export const willRouter = Router();
willRouter.use(authenticate, rejectActAs, requireFeature('WILL_MAKER'), limitWillBody);
willRouter.get('/', asyncHandler(will.overview));
willRouter.post('/drafts', asyncHandler(will.createDraft));
willRouter.get('/drafts/:id', asyncHandler(will.getDraft));
willRouter.put('/drafts/:id/sections/:section', asyncHandler(will.saveSection));
willRouter.post('/drafts/:id/estate/refresh', asyncHandler(will.refreshEstate));
willRouter.delete('/drafts/:id', asyncHandler(will.discardDraft));
willRouter.get('/people/suggestions', asyncHandler(will.suggestions));
willRouter.get('/drafts/:id/preview', asyncHandler(will.preview));
willRouter.post('/drafts/:id/generate', costlyOperationLimiter, asyncHandler(will.generate));
willRouter.get('/versions/:vid/pdf', asyncHandler(will.downloadPdf));
