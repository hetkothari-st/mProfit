import crypto from 'node:crypto';
import type { AssetClass, FamilyRole } from '@prisma/client';
import { toDecimal, serializeMoney } from '@portfolioos/shared';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { runAsUser } from '../lib/requestContext.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import {
  assertOwnerOf,
  NON_AC_CATEGORIES,
  type NonAcCategory,
} from './familyScope.service.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import {
  assertValidSignature,
  createOrder,
  fetchOrderNotes,
  isRazorpayConfigured,
} from './billing/razorpay.service.js';

// How long a seat's Razorpay order stays valid before the pending invite
// is considered abandoned. Not actively swept (see PendingFamilyInvite
// schema comment) — a stale row just blocks nothing since the seat count
// check re-derives from ACTIVE members + unexpired FamilyInvitations.
const PENDING_SEAT_INVITE_TTL_MIN = 30;

/**
 * Family CRUD + invitation flow.
 *
 * Every function here takes the caller's userId as its first argument;
 * OWNER-level operations verify membership via `assertOwnerOf` before
 * mutating. Invitations are token-based: an OWNER creates a
 * FamilyInvitation row, the token is emailed to the invitee, and the
 * accept endpoint exchanges the token for a new FamilyMember row bound
 * to the accepting user's id.
 */

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 14;

// ─── Family CRUD ─────────────────────────────────────────────────────

export interface CreateFamilyInput {
  name: string;
  description?: string;
}

/**
 * Create a new Family. The caller becomes the first ACTIVE OWNER via
 * a single-transaction FamilyMember insert alongside the Family row.
 */
export async function createFamily(callerId: string, input: CreateFamilyInput) {
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Family name is required.');

  return runInTransaction(async (tx) => {
    const family = await tx.family.create({
      data: {
        name,
        description: input.description?.trim() || null,
        createdById: callerId,
      },
    });
    await tx.familyMember.create({
      data: {
        familyId: family.id,
        userId: callerId,
        role: 'OWNER',
        status: 'ACTIVE',
        invitedById: null,
      },
    });
    logger.info({ familyId: family.id, callerId }, '[family] created');
    return family;
  });
}

/**
 * List every family the caller is an ACTIVE or PENDING member of. Used
 * by the frontend switcher to populate the "Viewing as" dropdown.
 */
export async function listMyFamilies(callerId: string) {
  const memberships = await prisma.familyMember.findMany({
    where: { userId: callerId, status: { in: ['ACTIVE', 'PENDING'] } },
    include: { family: true },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((m) => ({
    id: m.family.id,
    name: m.family.name,
    description: m.family.description,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt.toISOString(),
  }));
}

/** OWNER-only. Rename / re-describe a family. */
export async function updateFamily(
  callerId: string,
  familyId: string,
  patch: Partial<CreateFamilyInput>,
) {
  await assertOwnerOf(callerId, familyId);
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new BadRequestError('Family name cannot be empty.');
    data.name = name;
  }
  if (patch.description !== undefined) {
    data.description = patch.description?.trim() || null;
  }
  return prisma.family.update({ where: { id: familyId }, data });
}

// ─── Members ─────────────────────────────────────────────────────────

/** Any active member (including CONTRIBUTOR/VIEWER) can list peers. */
export async function listMembers(callerId: string, familyId: string) {
  await assertActiveMemberOf(callerId, familyId);
  const rows = await prisma.familyMember.findMany({
    where: { familyId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    role: r.role,
    status: r.status,
    visibleAssetClasses: r.visibleAssetClasses,
    visibleCategories: filterKnownCategories(r.visibleCategories),
    joinedAt: r.joinedAt.toISOString(),
    invitedById: r.invitedById,
  }));
}

export interface UpdateMemberInput {
  role?: FamilyRole;
  visibleAssetClasses?: AssetClass[];
  visibleCategories?: NonAcCategory[];
}

/**
 * OWNER-only. Change a member's role or visibility caps. Prevents
 * demoting the last remaining OWNER of a family (schema-enforced would
 * be nicer but SQL check across rows requires a trigger).
 */
export async function updateMemberPermissions(
  callerId: string,
  familyId: string,
  memberUserId: string,
  patch: UpdateMemberInput,
) {
  await assertOwnerOf(callerId, familyId);
  const target = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: memberUserId } },
  });
  if (!target) throw new NotFoundError('Member not found in family.');

  if (patch.role !== undefined && target.role === 'OWNER' && patch.role !== 'OWNER') {
    // About to demote an OWNER — ensure at least one OWNER remains.
    const otherOwners = await prisma.familyMember.count({
      where: {
        familyId,
        role: 'OWNER',
        status: 'ACTIVE',
        userId: { not: memberUserId },
      },
    });
    if (otherOwners === 0) {
      throw new BadRequestError('Cannot demote the last OWNER of a family.');
    }
  }

  return prisma.familyMember.update({
    where: { familyId_userId: { familyId, userId: memberUserId } },
    data: {
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.visibleAssetClasses !== undefined
        ? { visibleAssetClasses: patch.visibleAssetClasses }
        : {}),
      ...(patch.visibleCategories !== undefined
        ? { visibleCategories: patch.visibleCategories }
        : {}),
    },
  });
}

/**
 * OWNER-only. Revoke a member's access (status → REVOKED). Non-
 * destructive: FamilyMember row stays for audit, member keeps User
 * row + personal portfolios. Cannot revoke the last OWNER.
 */
export async function revokeMember(
  callerId: string,
  familyId: string,
  memberUserId: string,
) {
  await assertOwnerOf(callerId, familyId);
  if (memberUserId === callerId) {
    throw new BadRequestError('Use "leave family" to revoke your own access.');
  }
  const target = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: memberUserId } },
  });
  if (!target) throw new NotFoundError('Member not found in family.');
  if (target.status === 'REVOKED') return target;

  if (target.role === 'OWNER') {
    const otherOwners = await prisma.familyMember.count({
      where: {
        familyId,
        role: 'OWNER',
        status: 'ACTIVE',
        userId: { not: memberUserId },
      },
    });
    if (otherOwners === 0) {
      throw new BadRequestError('Cannot revoke the last OWNER of a family.');
    }
  }

  return prisma.familyMember.update({
    where: { familyId_userId: { familyId, userId: memberUserId } },
    data: { status: 'REVOKED' },
  });
}

/** Any member can leave their own family (except the last OWNER). */
export async function leaveFamily(callerId: string, familyId: string) {
  const own = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: callerId } },
  });
  if (!own || own.status !== 'ACTIVE') {
    throw new NotFoundError('You are not an active member of this family.');
  }
  if (own.role === 'OWNER') {
    const otherOwners = await prisma.familyMember.count({
      where: {
        familyId,
        role: 'OWNER',
        status: 'ACTIVE',
        userId: { not: callerId },
      },
    });
    if (otherOwners === 0) {
      throw new BadRequestError(
        'You are the last OWNER. Promote another member to OWNER before leaving.',
      );
    }
  }
  return prisma.familyMember.update({
    where: { familyId_userId: { familyId, userId: callerId } },
    data: { status: 'REVOKED' },
  });
}

// ─── Invitations ─────────────────────────────────────────────────────

export interface InviteInput {
  invitedEmail: string;
  invitedName?: string;
  role?: FamilyRole;
  visibleAssetClasses?: AssetClass[];
  visibleCategories?: NonAcCategory[];
}

export interface InviteResult {
  status: 'invited';
  id: string;
  token: string;
  expiresAt: string;
  invitedEmail: string;
  invitedName: string | null;
  role: FamilyRole;
  familyName: string;
  seatNumber: number;
  includedSeats: number;
}

export interface SeatPaymentRequiredResult {
  status: 'seat_payment_required';
  pendingInviteId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  extraSeatPriceInr: string;
  seatNumber: number;
  includedSeats: number;
  message: string;
}

/**
 * OWNER-only. Invites a member if a seat is available within
 * `includedSeats`. If this invite would exceed included seats, it does
 * **not** create a FamilyInvitation — instead it creates a
 * PendingFamilyInvite and a Razorpay order for one extra seat, and the
 * caller must complete `verifySeatPaymentAndInvite` before the
 * invitation (and the seat itself) actually exists. This is deliberate:
 * an earlier version let overage invites through immediately with a
 * "this will be billed next cycle" note, which meant a user could add a
 * paid seat, use it, and churn before the deferred charge ever landed —
 * pay-per-seat upfront closes that gap.
 */
export async function inviteMember(
  callerId: string,
  familyId: string,
  input: InviteInput,
): Promise<InviteResult | SeatPaymentRequiredResult> {
  await assertOwnerOf(callerId, familyId);
  const invitedEmail = input.invitedEmail.trim().toLowerCase();
  if (!invitedEmail || !invitedEmail.includes('@')) {
    throw new BadRequestError('A valid email is required.');
  }
  // Guard: don't invite an existing ACTIVE member.
  const existing = await prisma.familyMember.findFirst({
    where: {
      familyId,
      user: { email: invitedEmail },
      status: { in: ['ACTIVE', 'PENDING'] },
    },
  });
  if (existing) {
    throw new BadRequestError(`${invitedEmail} is already a member of this family.`);
  }

  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    select: { name: true, includedSeats: true, extraSeatPriceInr: true },
  });
  // Seats already spoken for: ACTIVE members + still-pending, unexpired
  // invitations. The invite about to be created takes the next seat.
  const [activeMemberCount, pendingInviteCount] = await Promise.all([
    prisma.familyMember.count({ where: { familyId, status: 'ACTIVE' } }),
    prisma.familyInvitation.count({
      where: { familyId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  const seatNumber = activeMemberCount + pendingInviteCount + 1;

  if (seatNumber > family.includedSeats) {
    if (!isRazorpayConfigured()) {
      throw new BadRequestError(
        'Adding another family member exceeds your included seats, and payments are not configured on this server.',
      );
    }
    const amountPaise = toDecimal(family.extraSeatPriceInr).mul(100).toNumber();
    const order = await createOrder({
      amountPaise,
      receiptLabel: 'family_seat',
      notes: { type: 'family_seat', familyId, callerId },
    });
    const pending = await prisma.pendingFamilyInvite.create({
      data: {
        familyId,
        invitedEmail,
        invitedName: input.invitedName?.trim() || null,
        role: input.role ?? 'CONTRIBUTOR',
        visibleAssetClasses: input.visibleAssetClasses ?? [],
        visibleCategories: input.visibleCategories ?? [],
        createdById: callerId,
        razorpayOrderId: order.orderId,
        expiresAt: new Date(Date.now() + PENDING_SEAT_INVITE_TTL_MIN * 60_000),
      },
    });
    logger.info(
      { familyId, invitedEmail, pendingInviteId: pending.id, seatNumber },
      '[family] invite requires seat payment',
    );
    return {
      status: 'seat_payment_required',
      pendingInviteId: pending.id,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID!,
      extraSeatPriceInr: serializeMoney(toDecimal(family.extraSeatPriceInr)),
      seatNumber,
      includedSeats: family.includedSeats,
      message: `This is your ${ordinal(seatNumber)} family member; it exceeds your included ${family.includedSeats} seats. Pay ₹${toDecimal(family.extraSeatPriceInr).toString()} to add this seat.`,
    };
  }

  const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  const invitation = await prisma.familyInvitation.create({
    data: {
      familyId,
      invitedEmail,
      invitedName: input.invitedName?.trim() || null,
      role: input.role ?? 'CONTRIBUTOR',
      visibleAssetClasses: input.visibleAssetClasses ?? [],
      visibleCategories: input.visibleCategories ?? [],
      invitedById: callerId,
      token,
      expiresAt,
    },
  });
  logger.info(
    { familyId, invitedEmail, invitationId: invitation.id, seatNumber },
    '[family] invitation created',
  );

  return {
    status: 'invited',
    id: invitation.id,
    token,
    expiresAt: invitation.expiresAt.toISOString(),
    invitedEmail,
    invitedName: invitation.invitedName,
    role: invitation.role,
    familyName: family.name,
    seatNumber,
    includedSeats: family.includedSeats,
  };
}

/**
 * Completes an overage invite after its Razorpay payment succeeds:
 * verifies the signature, re-fetches the order's `notes` from Razorpay
 * (never trusts the client's familyId/callerId at this step), then
 * atomically bumps `Family.includedSeats` and creates the real
 * FamilyInvitation from the payload stashed in PendingFamilyInvite.
 */
export async function verifySeatPaymentAndInvite(
  callerId: string,
  familyId: string,
  input: {
    pendingInviteId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
): Promise<InviteResult> {
  await assertOwnerOf(callerId, familyId);

  const pending = await prisma.pendingFamilyInvite.findUnique({
    where: { id: input.pendingInviteId },
  });
  if (!pending || pending.familyId !== familyId) {
    throw new NotFoundError('Pending invite not found.');
  }
  if (pending.razorpayOrderId !== input.razorpayOrderId) {
    throw new BadRequestError('Order does not match this pending invite.');
  }
  if (pending.expiresAt < new Date()) {
    await prisma.pendingFamilyInvite.delete({ where: { id: pending.id } }).catch(() => undefined);
    throw new BadRequestError('This seat payment request has expired — start the invite again.');
  }

  assertValidSignature({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
  });

  const notes = await fetchOrderNotes(input.razorpayOrderId);
  if (notes.type !== 'family_seat' || notes.familyId !== familyId || notes.callerId !== callerId) {
    throw new ForbiddenError('This payment does not match this seat request.');
  }

  const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  // Callback form so the seat increment, the invitation and the removal of the
  // pending row commit or fail together. The pendingFamilyInvite delete used to
  // sit outside the transaction entirely, so a crash between the two could
  // leave a paid-for seat with its pending invite still claimable.
  const { family, invitation } = await runInTransaction(async (tx) => {
    const family = await tx.family.update({
      where: { id: familyId },
      data: { includedSeats: { increment: 1 } },
      select: { name: true, includedSeats: true },
    });
    const invitation = await tx.familyInvitation.create({
      data: {
        familyId,
        invitedEmail: pending.invitedEmail,
        invitedName: pending.invitedName,
        role: pending.role,
        visibleAssetClasses: pending.visibleAssetClasses,
        visibleCategories: pending.visibleCategories,
        invitedById: pending.createdById,
        token,
        expiresAt,
      },
    });
    await tx.pendingFamilyInvite.delete({ where: { id: pending.id } });
    return { family, invitation };
  });

  logger.info(
    { familyId, invitationId: invitation.id, pendingInviteId: pending.id },
    '[family] seat paid, invitation created',
  );

  return {
    status: 'invited',
    id: invitation.id,
    token,
    expiresAt: invitation.expiresAt.toISOString(),
    invitedEmail: invitation.invitedEmail,
    invitedName: invitation.invitedName,
    role: invitation.role,
    familyName: family.name,
    seatNumber: family.includedSeats,
    includedSeats: family.includedSeats,
  };
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** OWNER-only. List still-pending invitations on the family. */
export async function listPendingInvitations(callerId: string, familyId: string) {
  await assertOwnerOf(callerId, familyId);
  const rows = await prisma.familyInvitation.findMany({
    where: { familyId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    invitedEmail: r.invitedEmail,
    invitedName: r.invitedName,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}

/** OWNER-only. Cancel a pending invitation. */
export async function cancelInvitation(
  callerId: string,
  familyId: string,
  invitationId: string,
) {
  await assertOwnerOf(callerId, familyId);
  const inv = await prisma.familyInvitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.familyId !== familyId) {
    throw new NotFoundError('Invitation not found.');
  }
  if (inv.acceptedAt) throw new BadRequestError('Invitation already accepted.');
  await prisma.familyInvitation.delete({ where: { id: invitationId } });
}

/**
 * Preview an invitation by token (public endpoint — no membership
 * required). Returns just enough for the accept-page UI to show the
 * family name and role being offered. Does NOT accept the invite.
 */
export async function peekInvitation(token: string) {
  const inv = await prisma.familyInvitation.findUnique({
    where: { token },
    include: {
      family: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!inv) throw new NotFoundError('Invitation not found or expired.');
  if (inv.acceptedAt) throw new BadRequestError('Invitation already accepted.');
  if (inv.expiresAt < new Date()) throw new BadRequestError('Invitation expired.');
  return {
    familyName: inv.family.name,
    invitedByName: inv.invitedBy.name,
    invitedByEmail: inv.invitedBy.email,
    invitedEmail: inv.invitedEmail,
    role: inv.role,
    expiresAt: inv.expiresAt.toISOString(),
  };
}

/**
 * Accept an invitation. Requires an authenticated user (`callerId`);
 * the invitation's `invitedEmail` must match the caller's User email
 * (case-insensitive) or we treat it as fraudulent and reject. Creates
 * a new ACTIVE FamilyMember row and stamps the invitation as accepted.
 */
export async function acceptInvitation(callerId: string, token: string) {
  const caller = await prisma.user.findUnique({
    where: { id: callerId },
    select: { email: true },
  });
  if (!caller) throw new NotFoundError('User not found.');

  return runInTransaction(async (tx) => {
    const inv = await tx.familyInvitation.findUnique({ where: { token } });
    if (!inv) throw new NotFoundError('Invitation not found.');
    if (inv.acceptedAt) throw new BadRequestError('Invitation already accepted.');
    if (inv.expiresAt < new Date()) throw new BadRequestError('Invitation expired.');
    if (inv.invitedEmail.toLowerCase() !== caller.email.toLowerCase()) {
      throw new ForbiddenError(
        'This invitation was sent to a different email address.',
      );
    }
    // Reactivate a REVOKED prior membership instead of failing on the
    // unique constraint. New membership if none exists.
    const prior = await tx.familyMember.findUnique({
      where: { familyId_userId: { familyId: inv.familyId, userId: callerId } },
    });
    const membership = prior
      ? await tx.familyMember.update({
          where: { familyId_userId: { familyId: inv.familyId, userId: callerId } },
          data: {
            role: inv.role,
            status: 'ACTIVE',
            visibleAssetClasses: inv.visibleAssetClasses,
            visibleCategories: inv.visibleCategories,
            invitedById: inv.invitedById,
          },
        })
      : await tx.familyMember.create({
          data: {
            familyId: inv.familyId,
            userId: callerId,
            role: inv.role,
            status: 'ACTIVE',
            visibleAssetClasses: inv.visibleAssetClasses,
            visibleCategories: inv.visibleCategories,
            invitedById: inv.invitedById,
          },
        });
    await tx.familyInvitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });
    logger.info(
      { familyId: inv.familyId, userId: callerId },
      '[family] invitation accepted',
    );
    return membership;
  });
}

// ─── Family portfolios ───────────────────────────────────────────────

/**
 * Create a family-shared portfolio. OWNER + CONTRIBUTOR may create.
 * The row's `userId` is set to the creator (audit/lineage) and
 * `familyId` marks it as shared — RLS + service scope treat these as
 * "readable by any active member, writable by OWNER/CONTRIBUTOR."
 */
// ─── Tree layout (draggable + custom-linkable UI) ───────────────────

export interface FamilyTreeLayout {
  nodes?: Array<{ userId: string; x: number; y: number }>;
  links?: Array<{ fromUserId: string; toUserId: string; label?: string | null }>;
}

/**
 * Get the persisted tree layout for a family (positions + custom
 * links). Any active member may read; null when the OWNERs haven't
 * customized it yet (frontend falls back to auto layout).
 */
export async function getFamilyTreeLayout(
  callerId: string,
  familyId: string,
): Promise<FamilyTreeLayout | null> {
  await assertActiveMemberOf(callerId, familyId);
  const row = await prisma.family.findUnique({
    where: { id: familyId },
    select: { treeLayout: true },
  });
  if (!row) throw new NotFoundError('Family not found.');
  return (row.treeLayout as FamilyTreeLayout | null) ?? null;
}

/**
 * Replace the persisted tree layout wholesale. OWNER-only — non-OWNER
 * members shouldn't rearrange the family's shared canvas. Callers pass
 * the whole layout blob (nodes + custom links) so we don't need a
 * partial-update PATCH for a small JSON.
 */
export async function updateFamilyTreeLayout(
  callerId: string,
  familyId: string,
  layout: FamilyTreeLayout,
): Promise<FamilyTreeLayout> {
  await assertOwnerOf(callerId, familyId);
  const sanitized: FamilyTreeLayout = {
    nodes: Array.isArray(layout.nodes)
      ? layout.nodes
          .filter(
            (n) =>
              n &&
              typeof n.userId === 'string' &&
              Number.isFinite(n.x) &&
              Number.isFinite(n.y),
          )
          .map((n) => ({ userId: n.userId, x: Math.round(n.x), y: Math.round(n.y) }))
      : [],
    links: Array.isArray(layout.links)
      ? layout.links
          .filter(
            (l) =>
              l &&
              typeof l.fromUserId === 'string' &&
              typeof l.toUserId === 'string' &&
              l.fromUserId !== l.toUserId,
          )
          .map((l) => ({
            fromUserId: l.fromUserId,
            toUserId: l.toUserId,
            label: l.label ?? null,
          }))
      : [],
  };
  await prisma.family.update({
    where: { id: familyId },
    data: { treeLayout: sanitized as unknown as object },
  });
  return sanitized;
}

/**
 * Attach an existing PERSONAL portfolio the caller already owns to a
 * family, making it a family-shared portfolio going forward. Only the
 * portfolio's own user can share it; OWNERs cannot forcibly share
 * another member's personal portfolio. Symmetric `unshareFromFamily`
 * clears the familyId if the caller changes their mind.
 */
export async function sharePortfolioWithFamily(
  callerId: string,
  familyId: string,
  portfolioId: string,
) {
  const membership = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: callerId } },
    select: { status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError('You are not an active member of this family.');
  }
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true, familyId: true },
  });
  if (!portfolio) throw new NotFoundError('Portfolio not found.');
  if (portfolio.userId !== callerId) {
    throw new ForbiddenError('You can only share portfolios you own.');
  }
  if (portfolio.familyId && portfolio.familyId !== familyId) {
    throw new BadRequestError(
      'Portfolio is already shared with a different family. Unshare it first.',
    );
  }
  return prisma.portfolio.update({
    where: { id: portfolioId },
    data: { familyId },
  });
}

export async function unsharePortfolioFromFamily(
  callerId: string,
  portfolioId: string,
) {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true, familyId: true },
  });
  if (!portfolio) throw new NotFoundError('Portfolio not found.');
  if (portfolio.userId !== callerId) {
    throw new ForbiddenError('You can only unshare portfolios you own.');
  }
  return prisma.portfolio.update({
    where: { id: portfolioId },
    data: { familyId: null },
  });
}

export async function createFamilyPortfolio(
  callerId: string,
  familyId: string,
  input: {
    name: string;
    description?: string;
    currency?: string;
    type?: 'INVESTMENT' | 'TRADING' | 'GOAL' | 'STRATEGY';
  },
) {
  const membership = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: callerId } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError('You are not an active member of this family.');
  }
  if (membership.role === 'VIEWER') {
    throw new ForbiddenError('VIEWER cannot create family portfolios.');
  }
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Portfolio name is required.');
  return prisma.portfolio.create({
    data: {
      userId: callerId,
      familyId,
      name,
      description: input.description?.trim() || null,
      currency: input.currency ?? 'INR',
      type: input.type ?? 'INVESTMENT',
    },
  });
}

// ─── Internals ───────────────────────────────────────────────────────

async function assertActiveMemberOf(callerId: string, familyId: string): Promise<void> {
  const row = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: callerId } },
    select: { status: true },
  });
  if (!row || row.status !== 'ACTIVE') {
    throw new ForbiddenError('You are not an active member of this family.');
  }
}

function filterKnownCategories(cats: string[]): NonAcCategory[] {
  return cats.filter((c): c is NonAcCategory =>
    (NON_AC_CATEGORIES as readonly string[]).includes(c),
  );
}

// Reference to silence unused-import warnings; `runAsUser` is exported
// from lib/requestContext elsewhere but not needed here. Keeping the
// export surface stable makes downstream refactors trivial.
void runAsUser;
