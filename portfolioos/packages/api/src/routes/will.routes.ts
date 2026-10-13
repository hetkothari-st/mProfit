import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import { costlyOperationLimiter, importLimiter } from '../middleware/rateLimit.js';
import { AppError, ForbiddenError } from '../lib/errors.js';
import { uploadWillSignedCopy } from '../middleware/willUpload.js';
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

/** The signed-copy upload (step 9) is multipart; multer's own limit (WILL_SIGNED_COPY_MAX_MB) governs it. */
const SIGNED_COPY_UPLOAD_PATH = /^\/wills\/[^/]+\/execution\/?$/;

export function limitWillBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'POST' && SIGNED_COPY_UPLOAD_PATH.test(req.path) && req.is('multipart/form-data')) {
    next();
    return;
  }
  const length = Number.parseInt(req.headers['content-length'] ?? '0', 10);
  if ((req.method === 'PUT' || req.method === 'POST') && length > WILL_MAX_BODY_BYTES) {
    next(new AppError('This request is too large.', 413, 'WILL_BODY_TOO_LARGE'));
    return;
  }
  next();
}

export const willRouter = Router();

// A user always reaches their own existing will documents, whatever their plan
// (a downgraded user keeps their will). Owner-scoped and audited in the service
// and controller; everything below the gate needs WILL_MAKER.
willRouter.get('/documents', authenticate, rejectActAs, asyncHandler(will.liveDocuments));
willRouter.get('/versions/:vid/pdf', authenticate, rejectActAs, asyncHandler(will.downloadPdf));
willRouter.get('/wills/:id/signed-copy', authenticate, rejectActAs, asyncHandler(will.downloadSignedCopy));

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

// Step 9 (Part 2): signing record and signed copy of a generated will.
willRouter.get('/wills/:id/execution', asyncHandler(will.getExecution));
willRouter.post('/wills/:id/execution', importLimiter, uploadWillSignedCopy, asyncHandler(will.recordExecution));
willRouter.post('/wills/:id/reviewed', asyncHandler(will.reviewed));
