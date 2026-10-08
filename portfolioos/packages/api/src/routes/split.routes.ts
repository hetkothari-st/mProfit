import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import * as c from '../controllers/split.controller.js';

export const splitRouter = Router();
splitRouter.use(authenticate);

splitRouter.get('/contacts', asyncHandler(c.listContactsHandler));
splitRouter.post('/contacts', asyncHandler(c.createContactHandler));
splitRouter.patch('/contacts/:id', asyncHandler(c.updateContactHandler));
splitRouter.delete('/contacts/:id', asyncHandler(c.deleteContactHandler));

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
