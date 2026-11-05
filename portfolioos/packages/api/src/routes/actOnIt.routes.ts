import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { actionHandler, popupHandler, popupSeenHandler, viewHandler, whyHandler } from '../controllers/actOnIt.controller.js';

/** /api/act-on-it — advice to act on, the track record, and the pop-up feed. Same plan gate as /api/advisor. */
export const actOnItRouter = Router();
actOnItRouter.use(authenticate);
actOnItRouter.use(requireFeature('ADVICE_ENGINE'));

actOnItRouter.get('/', asyncHandler(viewHandler));
actOnItRouter.get('/popup', asyncHandler(popupHandler));
actOnItRouter.post('/popup/:promptId/seen', asyncHandler(popupSeenHandler));
actOnItRouter.get('/:id/why', asyncHandler(whyHandler));
actOnItRouter.post('/:id/accept', asyncHandler(actionHandler('accept')));
actOnItRouter.post('/:id/snooze', asyncHandler(actionHandler('snooze')));
actOnItRouter.post('/:id/dismiss', asyncHandler(actionHandler('dismiss')));
actOnItRouter.post('/:id/done-elsewhere', asyncHandler(actionHandler('done-elsewhere')));
