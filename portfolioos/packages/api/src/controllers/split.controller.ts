import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import { createContact, deleteContact, listContacts, updateContact } from '../services/split/contacts.service.js';
import {
  addMember, createGroup, getGroup, getOrCreateDirectGroup, listGroups, removeMember, updateGroup,
} from '../services/split/groups.service.js';
import {
  createExpense, deleteExpense, getExpense, listExpenses, restoreExpense, updateExpense,
} from '../services/split/expenses.service.js';
import { createSettlement, deleteSettlement, listSettlements, updateSettlement } from '../services/split/settlements.service.js';
import { listLabels, createLabel, deleteLabel, setExpenseLabels } from '../services/split/labels.service.js';
import { putReceipt, getReceipt, deleteReceipt } from '../services/split/receipts.service.js';
import { listComments, addComment, deleteComment } from '../services/split/comments.service.js';
import { getSettings, updateSettings, upiLink } from '../services/split/settings.service.js';
import { getShareLink, setShareLink } from '../services/split/shareLink.service.js';
import { groupBalances, listActivity, listFriends } from '../services/split/ledger.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a positive amount with at most 2 decimals');
const ccy = z.string().regex(/^[A-Za-z]{3}$/, 'Expected a 3-letter currency code');
const id = z.string().min(1).max(64);
const groupType = z.enum(['TRIP', 'HOME', 'COUPLE', 'OTHER']);

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().max(254).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  upiId: z.string().max(320).nullable().optional(),
});
const groupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: groupType.optional(),
  baseCurrency: ccy.optional(),
  simplifyDebts: z.boolean().optional(),
  myDisplayName: z.string().trim().min(1).max(120),
  contactIds: z.array(id).max(50).optional(),
});
const groupPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: groupType.optional(),
  simplifyDebts: z.boolean().optional(),
  archived: z.boolean().optional(),
});
const expenseBody = z.object({
  description: z.string().trim().min(1).max(200),
  date: isoDate,
  amount: money,
  currency: ccy,
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  splitMode: z.enum(['EQUAL', 'EXACT', 'PERCENT', 'SHARES']),
  payers: z.array(z.object({ memberId: id, amount: money })).min(1).max(50),
  shares: z.array(z.object({ memberId: id, value: z.string().max(32).optional() })).min(1).max(50),
});
const settlementBody = z.object({
  fromMemberId: id,
  toMemberId: id,
  amount: money,
  currency: ccy.optional(),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  method: z.enum(['CASH', 'UPI', 'OTHER']),
  date: isoDate,
});

function uid(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), r.error.issues);
  return r.data;
}
const p = (req: Request, k: string) => req.params[k]!;

export const listContactsHandler = async (req: Request, res: Response) => ok(res, await listContacts(uid(req)));
export const createContactHandler = async (req: Request, res: Response) => created(res, await createContact(uid(req), parse(contactSchema, req.body)));
export const updateContactHandler = async (req: Request, res: Response) => ok(res, await updateContact(uid(req), p(req, 'id'), parse(contactSchema.partial(), req.body)));
export const deleteContactHandler = async (req: Request, res: Response) => { await deleteContact(uid(req), p(req, 'id')); noContent(res); };

export const listGroupsHandler = async (req: Request, res: Response) => ok(res, await listGroups(uid(req), { includeArchived: req.query['includeArchived'] === '1' }));
export const createGroupHandler = async (req: Request, res: Response) => created(res, await createGroup(uid(req), parse(groupSchema, req.body)));
export const directGroupHandler = async (req: Request, res: Response) => {
  const b = parse(z.object({ contactId: id, myDisplayName: z.string().trim().min(1).max(120) }), req.body);
  ok(res, await getOrCreateDirectGroup(uid(req), b.myDisplayName, b.contactId));
};
export const getGroupHandler = async (req: Request, res: Response) => ok(res, await getGroup(uid(req), p(req, 'id')));
export const updateGroupHandler = async (req: Request, res: Response) => ok(res, await updateGroup(uid(req), p(req, 'id'), parse(groupPatch, req.body)));
export const addMemberHandler = async (req: Request, res: Response) => created(res, await addMember(uid(req), p(req, 'id'), parse(z.object({ contactId: id }), req.body).contactId));
export const removeMemberHandler = async (req: Request, res: Response) => { await removeMember(uid(req), p(req, 'id'), p(req, 'memberId')); noContent(res); };

export const listExpensesHandler = async (req: Request, res: Response) => ok(res, await listExpenses(uid(req), p(req, 'id'), { includeDeleted: req.query['includeDeleted'] === '1' }));
export const createExpenseHandler = async (req: Request, res: Response) => created(res, await createExpense(uid(req), parse(expenseBody.extend({ groupId: id }), req.body)));
export const getExpenseHandler = async (req: Request, res: Response) => ok(res, await getExpense(uid(req), p(req, 'id')));
export const updateExpenseHandler = async (req: Request, res: Response) => ok(res, await updateExpense(uid(req), p(req, 'id'), parse(expenseBody, req.body)));
export const deleteExpenseHandler = async (req: Request, res: Response) => { await deleteExpense(uid(req), p(req, 'id')); noContent(res); };
export const restoreExpenseHandler = async (req: Request, res: Response) => ok(res, await restoreExpense(uid(req), p(req, 'id')));

export const listSettlementsHandler = async (req: Request, res: Response) => ok(res, await listSettlements(uid(req), p(req, 'id')));
export const createSettlementHandler = async (req: Request, res: Response) => created(res, await createSettlement(uid(req), parse(settlementBody.extend({ groupId: id }), req.body)));
export const updateSettlementHandler = async (req: Request, res: Response) => ok(res, await updateSettlement(uid(req), p(req, 'id'), parse(settlementBody, req.body)));
export const deleteSettlementHandler = async (req: Request, res: Response) => { await deleteSettlement(uid(req), p(req, 'id')); noContent(res); };

export const balancesHandler = async (req: Request, res: Response) => ok(res, await groupBalances(uid(req), p(req, 'id')));
export const friendsHandler = async (req: Request, res: Response) => ok(res, await listFriends(uid(req)));
function activityOpts(req: Request) {
  const limit = Number.parseInt(String(req.query['limit'] ?? '50'), 10);
  const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;
  return { limit: Number.isFinite(limit) ? limit : 50, before };
}
export const groupActivityHandler = async (req: Request, res: Response) => ok(res, await listActivity(uid(req), { groupId: p(req, 'id'), ...activityOpts(req) }));
export const activityHandler = async (req: Request, res: Response) => ok(res, await listActivity(uid(req), activityOpts(req)));

const settingsPatch = z.object({
  upiId: z.string().max(320).nullable().optional(),
  homeCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  defaultPortfolioId: z.string().max(64).nullable().optional(),
  emailOnActivity: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});
export const getSettingsHandler = async (req: Request, res: Response) => ok(res, await getSettings(uid(req)));
export const updateSettingsHandler = async (req: Request, res: Response) => ok(res, await updateSettings(uid(req), parse(settingsPatch, req.body)));
export const upiLinkHandler = async (req: Request, res: Response) => {
  const to = typeof req.query['to'] === 'string' ? req.query['to'] : '';
  const amount = typeof req.query['amount'] === 'string' ? req.query['amount'] : undefined;
  if (!to) throw new BadRequestError('to is required');
  ok(res, await upiLink(uid(req), p(req, 'id'), to, amount));
};

const labelBody = z.object({ name: z.string().max(60), color: z.string().max(7) });
const labelIdsBody = z.object({ labelIds: z.array(z.string().min(1).max(64)).max(10) });
export const listLabelsHandler = async (req: Request, res: Response) => ok(res, await listLabels(uid(req), p(req, 'id')));
export const createLabelHandler = async (req: Request, res: Response) => created(res, await createLabel(uid(req), p(req, 'id'), parse(labelBody, req.body)));
export const deleteLabelHandler = async (req: Request, res: Response) => { await deleteLabel(uid(req), p(req, 'id')); noContent(res); };
export const setExpenseLabelsHandler = async (req: Request, res: Response) => ok(res, await setExpenseLabels(uid(req), p(req, 'id'), parse(labelIdsBody, req.body).labelIds));

const commentBody = z.object({ body: z.string().max(2000) });
export const listCommentsHandler = async (req: Request, res: Response) => ok(res, await listComments(uid(req), p(req, 'id')));
export const addCommentHandler = async (req: Request, res: Response) => created(res, await addComment(uid(req), p(req, 'id'), parse(commentBody, req.body).body));
export const deleteCommentHandler = async (req: Request, res: Response) => { await deleteComment(uid(req), p(req, 'id')); noContent(res); };

export const putReceiptHandler = async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('Attach a receipt file');
  ok(res, await putReceipt(uid(req), p(req, 'id'), { buffer: req.file.buffer, originalname: req.file.originalname }));
};
export const getReceiptHandler = async (req: Request, res: Response) => {
  const r = await getReceipt(uid(req), p(req, 'id'));
  const ext = r.mime === 'application/pdf' ? 'pdf' : r.mime.split('/')[1];
  res.setHeader('Content-Type', r.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="receipt.${ext}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(r.buffer);
};
export const deleteReceiptHandler = async (req: Request, res: Response) => { await deleteReceipt(uid(req), p(req, 'id')); noContent(res); };

const shareLinkBody = z.object({ enabled: z.boolean(), portfolioId: z.string().max(64).nullable().optional() });
export const getShareLinkHandler = async (req: Request, res: Response) => ok(res, await getShareLink(uid(req), p(req, 'id')));
export const setShareLinkHandler = async (req: Request, res: Response) => ok(res, await setShareLink(uid(req), p(req, 'id'), parse(shareLinkBody, req.body)));
