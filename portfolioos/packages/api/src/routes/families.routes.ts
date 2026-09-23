import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AssetClass, FamilyRole } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import {
  getWealth,
  getGoals,
  getProtection,
  getAttention,
  getMemberDetail,
} from '../controllers/familyDashboard.controller.js';
import { asyncHandler } from '../middleware/validate.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  acceptInvitation,
  cancelInvitation,
  createFamily,
  createFamilyPortfolio,
  inviteMember,
  verifySeatPaymentAndInvite,
  leaveFamily,
  listMembers,
  listMyFamilies,
  listPendingInvitations,
  peekInvitation,
  revokeMember,
  sharePortfolioWithFamily,
  unsharePortfolioFromFamily,
  updateFamily,
  updateMemberPermissions,
  getFamilyTreeLayout,
  updateFamilyTreeLayout,
  addManagedMember,
  addManagedMembersBulk,
  BULK_MANAGED_MAX,
  setManagedMemberManager,
} from '../services/family.service.js';
import { NON_AC_CATEGORIES } from '../services/familyScope.service.js';
import {
  buildFamilyInviteEmail,
  sendFamilyInviteEmail,
} from '../services/family/familyInviteEmail.service.js';
import {
  claimProfile,
  inviteProfileClaim,
  peekProfileClaim,
} from '../services/family/familyClaim.service.js';

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

// ─── Taking over a managed profile (no auth: they have no account yet) ──
//
// Placed BEFORE `authenticate` for the same reason as the invite preview: the
// person holding the link is exactly the person who cannot sign in yet.
familiesRouter.get(
  '/claims/:token/peek',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await peekProfileClaim(req.params.token!));
  }),
);

const claimSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

familiesRouter.post(
  '/claims/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const data = claimSchema.parse(req.body);
    ok(res, await claimProfile(req.params.token!, data));
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
  relation: z.string().max(40).optional(),
  relatedToId: z.string().min(1).optional(),
});

const permissionsSchema = z.object({
  role: familyRoleEnum.optional(),
  visibleAssetClasses: z.array(assetClassEnum).optional(),
  visibleCategories: z.array(categoryEnum).optional(),
  relation: z.string().max(40).nullable().optional(),
  relatedToId: z.string().min(1).nullable().optional(),
});

const managedMemberSchema = z.object({
  name: z.string().min(1).max(80),
  relation: z.string().max(40).optional(),
  relatedToId: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  // Never OWNER — see AddManagedMemberInput.
  role: z.enum(['CONTRIBUTOR', 'VIEWER']).optional(),
  contactEmail: z.string().email().optional(),
});

const bulkManagedSchema = z.object({
  members: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        relation: z.string().max(40).nullable().optional(),
        relatedToId: z.string().min(1).nullable().optional(),
        // Someone listed earlier in this same batch, by position.
        relatedToRow: z.number().int().min(0).nullable().optional(),
        managerId: z.string().min(1).nullable().optional(),
        role: z.enum(['CONTRIBUTOR', 'VIEWER']).optional(),
        contactEmail: z.string().email().nullable().optional(),
      }),
    )
    .min(1)
    .max(BULK_MANAGED_MAX),
});

const managerSchema = z.object({ managerId: z.string().min(1) });

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
  requireFeature('FAMILY_SHARING'),
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
    ok(res, await inviteMember(callerId(req), req.params.familyId!, data));
  }),
);

// Someone with no email or login, kept by a family member. Takes a seat like
// an invite, and past the included seats returns the same seat payment,
// completed through `/members/invite/verify-payment`.
familiesRouter.post(
  '/:familyId/members/managed',
  asyncHandler(async (req: Request, res: Response) => {
    const data = managedMemberSchema.parse(req.body);
    ok(res, await addManagedMember(callerId(req), req.params.familyId!, data));
  }),
);

// A whole branch of the family in one pass. All of them or none, and
// relations may point at people listed earlier in the same batch.
familiesRouter.post(
  '/:familyId/members/managed/bulk',
  asyncHandler(async (req: Request, res: Response) => {
    const { members } = bulkManagedSchema.parse(req.body);
    ok(res, await addManagedMembersBulk(callerId(req), req.params.familyId!, members));
  }),
);

familiesRouter.patch(
  '/:familyId/members/:memberUserId/manager',
  asyncHandler(async (req: Request, res: Response) => {
    const { managerId } = managerSchema.parse(req.body);
    await setManagedMemberManager(
      callerId(req),
      req.params.familyId!,
      req.params.memberUserId!,
      managerId,
    );
    noContent(res);
  }),
);

// Invite the person a managed profile belongs to, now that they have an
// email, to take it over. Owners and the member keeping their books.
familiesRouter.post(
  '/:familyId/members/:memberUserId/claim-invite',
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    ok(
      res,
      await inviteProfileClaim(callerId(req), req.params.familyId!, req.params.memberUserId!, {
        email,
      }),
    );
  }),
);

const verifySeatPaymentSchema = z.object({
  pendingInviteId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

// Completes an overage invite once its seat payment has succeeded — see
// verifySeatPaymentAndInvite for the full trust model.
familiesRouter.post(
  '/:familyId/members/invite/verify-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const data = verifySeatPaymentSchema.parse(req.body);
    ok(res, await verifySeatPaymentAndInvite(callerId(req), req.params.familyId!, data));
  }),
);

const inviteEmailSchema = z.object({
  subject: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
});

// The invitation email, exactly as it will go out — the owner can edit the
// subject and note before sending. Link and expiry are fixed by the template.
familiesRouter.post(
  '/:familyId/invitations/:invitationId/email/preview',
  asyncHandler(async (req: Request, res: Response) => {
    const edits = inviteEmailSchema.parse(req.body ?? {});
    ok(
      res,
      await buildFamilyInviteEmail(callerId(req), req.params.familyId!, req.params.invitationId!, edits),
    );
  }),
);

familiesRouter.post(
  '/:familyId/invitations/:invitationId/email/send',
  asyncHandler(async (req: Request, res: Response) => {
    const edits = inviteEmailSchema.parse(req.body ?? {});
    ok(
      res,
      await sendFamilyInviteEmail(
        callerId(req),
        req.params.familyId!,
        req.params.invitationId!,
        edits,
        req,
      ),
    );
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

// Attach a caller-owned existing portfolio to the family.
familiesRouter.post(
  '/:familyId/portfolios/:portfolioId/share',
  asyncHandler(async (req: Request, res: Response) => {
    ok(
      res,
      await sharePortfolioWithFamily(
        callerId(req),
        req.params.familyId!,
        req.params.portfolioId!,
      ),
    );
  }),
);

// Detach a caller-owned portfolio back to personal (clears familyId).
familiesRouter.post(
  '/:familyId/portfolios/:portfolioId/unshare',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await unsharePortfolioFromFamily(callerId(req), req.params.portfolioId!));
  }),
);

// ─── Tree layout ────────────────────────────────────────────────────

const layoutSchema = z.object({
  nodes: z
    .array(
      z.object({
        userId: z.string(),
        x: z.number(),
        y: z.number(),
      }),
    )
    .optional(),
  links: z
    .array(
      z.object({
        fromUserId: z.string(),
        toUserId: z.string(),
        label: z.string().max(50).nullable().optional(),
      }),
    )
    .optional(),
  parents: z.record(z.string(), z.string().nullable()).optional(),
  // Couples, as [one, the other]. Order carries no meaning.
  partners: z.array(z.tuple([z.string(), z.string()])).max(200).optional(),
});

familiesRouter.get(
  '/:familyId/tree-layout',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await getFamilyTreeLayout(callerId(req), req.params.familyId!));
  }),
);

familiesRouter.put(
  '/:familyId/tree-layout',
  asyncHandler(async (req: Request, res: Response) => {
    const data = layoutSchema.parse(req.body);
    ok(res, await updateFamilyTreeLayout(callerId(req), req.params.familyId!, data));
  }),
);

// ─── Family dashboard ────────────────────────────────────────────
//
// Read-only household views. Gated on FAMILY_SHARING like the rest of the
// family feature; membership itself is checked inside getEffectiveScope,
// which throws ForbiddenError for a non-member or a revoked member, so
// there is no separate membership guard here.
//
// Every one of these applies the caller's per-member visibility caps before
// aggregating. They are safe to expose to any ACTIVE member of the family,
// including a VIEWER, precisely because the caps decide what lands in the
// totals rather than the route deciding who may call it.
familiesRouter.get(
  '/:familyId/dashboard/wealth',
  requireFeature('FAMILY_SHARING'),
  asyncHandler(getWealth),
);

familiesRouter.get(
  '/:familyId/dashboard/goals',
  requireFeature('FAMILY_SHARING'),
  asyncHandler(getGoals),
);

familiesRouter.get(
  '/:familyId/dashboard/protection',
  requireFeature('FAMILY_SHARING'),
  asyncHandler(getProtection),
);

familiesRouter.get(
  '/:familyId/dashboard/attention',
  requireFeature('FAMILY_SHARING'),
  asyncHandler(getAttention),
);

familiesRouter.get(
  '/:familyId/members/:userId/detail',
  requireFeature('FAMILY_SHARING'),
  asyncHandler(getMemberDetail),
);
