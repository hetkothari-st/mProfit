import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AssetClass, FamilyRole } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  acceptInvitation,
  cancelInvitation,
  createFamily,
  createFamilyPortfolio,
  inviteMember,
  leaveFamily,
  listMembers,
  listMyFamilies,
  listPendingInvitations,
  peekInvitation,
  revokeMember,
  updateFamily,
  updateMemberPermissions,
} from '../services/family.service.js';
import { NON_AC_CATEGORIES } from '../services/familyScope.service.js';

/**
 * Family / HOF HTTP surface. Mounted at `/api/families`.
 *
 * All routes except `/invitations/:token/peek` require authentication.
 * OWNER-level guards are enforced inside the service layer, not here —
 * so a CONTRIBUTOR calling `POST /:familyId/members/invite` gets a 403
 * from `assertOwnerOf` inside `inviteMember`.
 */
export const familiesRouter = Router();

// ─── Public invite preview (no auth required) ────────────────────────
// Placed BEFORE `familiesRouter.use(authenticate)` so an unauthenticated
// invitee can see the offer before signing up / logging in.
familiesRouter.get(
  '/invitations/:token/peek',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await peekInvitation(req.params.token!));
  }),
);

familiesRouter.use(authenticate);

function callerId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

const categoryEnum = z.enum(NON_AC_CATEGORIES);
const familyRoleEnum = z.nativeEnum(FamilyRole);
const assetClassEnum = z.nativeEnum(AssetClass);

const createFamilySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

const updateFamilySchema = createFamilySchema.partial();

const inviteSchema = z.object({
  invitedEmail: z.string().email(),
  invitedName: z.string().max(120).optional(),
  role: familyRoleEnum.optional(),
  visibleAssetClasses: z.array(assetClassEnum).optional(),
  visibleCategories: z.array(categoryEnum).optional(),
});

const permissionsSchema = z.object({
  role: familyRoleEnum.optional(),
  visibleAssetClasses: z.array(assetClassEnum).optional(),
  visibleCategories: z.array(categoryEnum).optional(),
});

const familyPortfolioSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  currency: z.string().length(3).default('INR'),
  type: z.enum(['INVESTMENT', 'TRADING', 'GOAL', 'STRATEGY']).optional(),
});

// ─── Family CRUD ─────────────────────────────────────────────────────

familiesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await listMyFamilies(callerId(req)));
  }),
);

familiesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const data = createFamilySchema.parse(req.body);
    created(res, await createFamily(callerId(req), data));
  }),
);

familiesRouter.patch(
  '/:familyId',
  asyncHandler(async (req: Request, res: Response) => {
    const patch = updateFamilySchema.parse(req.body);
    ok(res, await updateFamily(callerId(req), req.params.familyId!, patch));
  }),
);

// ─── Members ─────────────────────────────────────────────────────────

familiesRouter.get(
  '/:familyId/members',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await listMembers(callerId(req), req.params.familyId!));
  }),
);

familiesRouter.patch(
  '/:familyId/members/:memberUserId/permissions',
  asyncHandler(async (req: Request, res: Response) => {
    const patch = permissionsSchema.parse(req.body);
    ok(
      res,
      await updateMemberPermissions(
        callerId(req),
        req.params.familyId!,
        req.params.memberUserId!,
        patch,
      ),
    );
  }),
);

familiesRouter.delete(
  '/:familyId/members/:memberUserId',
  asyncHandler(async (req: Request, res: Response) => {
    await revokeMember(callerId(req), req.params.familyId!, req.params.memberUserId!);
    noContent(res);
  }),
);

familiesRouter.post(
  '/:familyId/leave',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await leaveFamily(callerId(req), req.params.familyId!));
  }),
);

// ─── Invitations ─────────────────────────────────────────────────────

familiesRouter.get(
  '/:familyId/invitations',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await listPendingInvitations(callerId(req), req.params.familyId!));
  }),
);

familiesRouter.post(
  '/:familyId/members/invite',
  asyncHandler(async (req: Request, res: Response) => {
    const data = inviteSchema.parse(req.body);
    created(res, await inviteMember(callerId(req), req.params.familyId!, data));
  }),
);

familiesRouter.delete(
  '/:familyId/invitations/:invitationId',
  asyncHandler(async (req: Request, res: Response) => {
    await cancelInvitation(
      callerId(req),
      req.params.familyId!,
      req.params.invitationId!,
    );
    noContent(res);
  }),
);

familiesRouter.post(
  '/invitations/:token/accept',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await acceptInvitation(callerId(req), req.params.token!));
  }),
);

// ─── Family portfolios ───────────────────────────────────────────────

familiesRouter.post(
  '/:familyId/portfolios',
  asyncHandler(async (req: Request, res: Response) => {
    const data = familyPortfolioSchema.parse(req.body);
    created(
      res,
      await createFamilyPortfolio(callerId(req), req.params.familyId!, data),
    );
  }),
);
