import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BadRequestError } from '../lib/errors.js';
import { rebindUserContext } from '../middleware/rebindUserContext.js';
import { receiptUploadLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import * as c from '../controllers/split.controller.js';

export const splitRouter = Router();
splitRouter.use(authenticate);

splitRouter.get('/contacts', asyncHandler(c.listContactsHandler));
splitRouter.post('/contacts', asyncHandler(c.createContactHandler));
splitRouter.patch('/contacts/:id', asyncHandler(c.updateContactHandler));
splitRouter.delete('/contacts/:id', asyncHandler(c.deleteContactHandler));
splitRouter.post('/contacts/:id/invite', asyncHandler(c.inviteContactHandler));

splitRouter.get('/groups', asyncHandler(c.listGroupsHandler));
splitRouter.post('/groups', asyncHandler(c.createGroupHandler));
// Before /groups/:id so "direct" is never read as a group id.
splitRouter.post('/groups/direct', asyncHandler(c.directGroupHandler));
splitRouter.get('/groups/:id', asyncHandler(c.getGroupHandler));
splitRouter.patch('/groups/:id', asyncHandler(c.updateGroupHandler));
splitRouter.post('/groups/:id/members', asyncHandler(c.addMemberHandler));
splitRouter.delete('/groups/:id/members/:memberId', asyncHandler(c.removeMemberHandler));
splitRouter.get('/groups/:id/expenses', asyncHandler(c.listExpensesHandler));
splitRouter.get('/groups/:id/settlements', asyncHandler(c.listSettlementsHandler));
splitRouter.get('/groups/:id/balances', asyncHandler(c.balancesHandler));
splitRouter.get('/groups/:id/activity', asyncHandler(c.groupActivityHandler));

splitRouter.post('/expenses', asyncHandler(c.createExpenseHandler));
splitRouter.get('/expenses/:id', asyncHandler(c.getExpenseHandler));
splitRouter.patch('/expenses/:id', asyncHandler(c.updateExpenseHandler));
splitRouter.delete('/expenses/:id', asyncHandler(c.deleteExpenseHandler));
splitRouter.post('/expenses/:id/restore', asyncHandler(c.restoreExpenseHandler));

splitRouter.post('/settlements', asyncHandler(c.createSettlementHandler));
splitRouter.patch('/settlements/:id', asyncHandler(c.updateSettlementHandler));
splitRouter.delete('/settlements/:id', asyncHandler(c.deleteSettlementHandler));

splitRouter.get('/friends', asyncHandler(c.friendsHandler));
splitRouter.get('/activity', asyncHandler(c.activityHandler));

splitRouter.get('/settings', asyncHandler(c.getSettingsHandler));
splitRouter.put('/settings', asyncHandler(c.updateSettingsHandler));
splitRouter.get('/groups/:id/upi-link', asyncHandler(c.upiLinkHandler));
splitRouter.get('/groups/:id/request-link', asyncHandler(c.requestLinkHandler));

splitRouter.get('/groups/:id/labels', asyncHandler(c.listLabelsHandler));
splitRouter.post('/groups/:id/labels', asyncHandler(c.createLabelHandler));
splitRouter.delete('/labels/:id', asyncHandler(c.deleteLabelHandler));
splitRouter.put('/expenses/:id/labels', asyncHandler(c.setExpenseLabelsHandler));
splitRouter.get('/expenses/:id/comments', asyncHandler(c.listCommentsHandler));
splitRouter.post('/expenses/:id/comments', asyncHandler(c.addCommentHandler));
splitRouter.delete('/comments/:id', asyncHandler(c.deleteCommentHandler));

// multer errors (e.g. LIMIT_FILE_SIZE) would otherwise surface as 500s.
const receiptMulter = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('file');
const receiptUpload = (req: Request, res: Response, next: NextFunction) =>
  receiptMulter(req, res, (err) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    next(new BadRequestError(code === 'LIMIT_FILE_SIZE' ? 'Receipts must be under 10 MB' : "Attach the receipt as a single file in the 'file' field"));
  });

splitRouter.put('/expenses/:id/receipt', receiptUploadLimiter, receiptUpload, rebindUserContext, asyncHandler(c.putReceiptHandler));
splitRouter.get('/expenses/:id/receipt', asyncHandler(c.getReceiptHandler));
splitRouter.delete('/expenses/:id/receipt', asyncHandler(c.deleteReceiptHandler));

splitRouter.get('/expenses/:id/share-link', asyncHandler(c.getShareLinkHandler));
splitRouter.put('/expenses/:id/share-link', asyncHandler(c.setShareLinkHandler));
splitRouter.post('/reminders', asyncHandler(c.remindHandler));
