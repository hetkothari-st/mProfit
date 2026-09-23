import crypto from 'node:crypto';
import type { AssetClass, FamilyRole } from '@prisma/client';
import { toDecimal, serializeMoney, placeRelative, hasCycle } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
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
import { hashPassword } from './password.service.js';
import { managedPlaceholderEmail } from './family/managedProfile.service.js';
import { purgeUser } from './accountDeletion.service.js';
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
  const usage = await Promise.all(
    memberships.map((m) => seatUsage(m.familyId).catch(() => null)),
  );
  return memberships.map((m, i) => ({
    id: m.family.id,
    name: m.family.name,
    description: m.family.description,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt.toISOString(),
    seats: usage[i],
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
  // Privileged read, for the same reason as the sibling lookup in
  // `getEffectiveScope`: FamilyMember's policy shows a non-OWNER nothing but
  // their own row, so an unprivileged read here returns a household of one to
  // every CONTRIBUTOR and VIEWER — which is what the members page showed once
  // the app stopped connecting as a superuser.
  //
  // Bounded the same way: membership on this exact family is already proven
  // one line above, the query is pinned to that familyId, and it returns the
  // roster the page exists to display. Reaching this before the membership
  // check would turn it into a directory of every household in the product.
  const rows = await runAsSystem(() =>
    prisma.familyMember.findMany({
      where: { familyId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isShadowClient: true,
            managedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    }),
  );
  // Removed members are gone from the family, not greyed out in it.
  const current = rows.filter((r) => r.status !== 'REVOKED');
  const nameOf = new Map(current.map((r) => [r.userId, r.user.name]));
  return current.map((r) => {
    const managed = r.user.isShadowClient;
    return {
      id: r.id,
      userId: r.userId,
      name: r.user.name,
      // A managed profile's address is a placeholder nobody should see.
      email: managed ? null : r.user.email,
      managed,
      managedBy: managed ? r.user.managedBy : null,
      relation: r.relation,
      // Who the relation is measured against, while they are still here.
      relatedTo:
        r.relatedToId && nameOf.has(r.relatedToId)
          ? { id: r.relatedToId, name: nameOf.get(r.relatedToId)! }
          : null,
      role: r.role,
      status: r.status,
      visibleAssetClasses: r.visibleAssetClasses,
      visibleCategories: filterKnownCategories(r.visibleCategories),
      joinedAt: r.joinedAt.toISOString(),
      invitedById: r.invitedById,
    };
  });
}

export interface UpdateMemberInput {
  role?: FamilyRole;
  visibleAssetClasses?: AssetClass[];
  visibleCategories?: NonAcCategory[];
  relation?: string | null;
  /** The member `relation` is measured against. */
  relatedToId?: string | null;
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

  if (patch.role === 'OWNER') {
    // A managed profile can never sign in, so as an OWNER it could become
    // the family's last one and leave nobody able to run it.
    const user = await prisma.user.findUnique({
      where: { id: memberUserId },
      select: { isShadowClient: true },
    });
    if (user?.isShadowClient) {
      throw new BadRequestError('A managed member cannot be an owner; they cannot sign in.');
    }
  }

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

  // A new relation re-places them on the tree, so check it first: it must
  // point at an active member other than themselves, and must not loop.
  const relationChanged = patch.relation !== undefined || patch.relatedToId !== undefined;
  let kin: { relation: string | null; relatedToId: string | null } | null = null;
  if (relationChanged) {
    if (patch.relatedToId === memberUserId) {
      throw new BadRequestError('Someone cannot be related to themselves.');
    }
    kin = await validRelative(
      familyId,
      patch.relation !== undefined ? patch.relation : target.relation,
      patch.relatedToId !== undefined ? patch.relatedToId : target.relatedToId,
    );
    await placeInTree(familyId, memberUserId, kin.relatedToId, kin.relation, { strict: true });
  }

  // Privileged: FamilyMember's policy lets an owner read the roster but not
  // update another member's row. Ownership was proven above.
  return runAsSystem(() =>
    prisma.familyMember.update({
      where: { familyId_userId: { familyId, userId: memberUserId } },
      data: {
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.visibleAssetClasses !== undefined
          ? { visibleAssetClasses: patch.visibleAssetClasses }
          : {}),
        ...(patch.visibleCategories !== undefined
          ? { visibleCategories: patch.visibleCategories }
          : {}),
        ...(kin ? { relation: kin.relation, relatedToId: kin.relatedToId } : {}),
      },
    }),
  );
}

/**
 * OWNER-only. Revoke a member's access (status → REVOKED). Non-
 * destructive: FamilyMember row stays for audit, member keeps User
 * row + personal portfolios. Cannot revoke the last OWNER.
 */
/**
 * OWNER-only. Remove a member from the family completely — not a greyed-out
 * "revoked" card that stays on the tree.
 *
 * - Someone with their own login leaves the family: their membership row is
 *   deleted, and their own account and data are untouched (they are theirs).
 * - A managed member is deleted outright, with everything recorded for them.
 *   Nobody could ever reach that profile again — it has no login, and its
 *   manager's access came only through this family — so keeping it would
 *   only keep someone's finances somewhere no one can see or erase them.
 *
 * Either way, anyone placed under them on the tree moves up into their place,
 * and any managed members they were keeping pass to the owner removing them.
 */
export async function revokeMember(
  callerId: string,
  familyId: string,
  memberUserId: string,
): Promise<void> {
  await assertOwnerOf(callerId, familyId);
  if (memberUserId === callerId) {
    throw new BadRequestError('Use "leave family" to revoke your own access.');
  }
  const target = await runAsSystem(() =>
    prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: memberUserId } },
      select: { role: true, status: true, user: { select: { isShadowClient: true } } },
    }),
  );
  if (!target) throw new NotFoundError('Member not found in family.');

  if (target.role === 'OWNER' && target.status === 'ACTIVE') {
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

  await detachFromTree(familyId, memberUserId);

  // Profiles this person was keeping must not be stranded with nobody able
  // to open them.
  // Looked up from the FamilyMember side: `User` is not RLS-scoped, so a
  // nested membership filter on a user query matches nothing.
  await runAsSystem(async () => {
    const kept = await prisma.familyMember.findMany({
      where: { familyId, user: { managedById: memberUserId, isShadowClient: true } },
      select: { userId: true },
    });
    if (kept.length === 0) return;
    await prisma.user.updateMany({
      where: { id: { in: kept.map((k) => k.userId) } },
      data: { managedById: callerId },
    });
  });

  if (target.user.isShadowClient) {
    // Privileged: the profile's rows belong to it, not to the caller.
    // Ownership of the family was proven above.
    await runAsSystem(() => purgeUser(memberUserId));
    logger.info({ familyId, profileId: memberUserId }, '[family] managed member deleted');
    return;
  }

  await runAsSystem(() =>
    prisma.familyMember.delete({
      where: { familyId_userId: { familyId, userId: memberUserId } },
    }),
  );
  logger.info({ familyId, userId: memberUserId }, '[family] member removed');
}

/**
 * Take someone off the tree: anyone under them moves up to their parent, so
 * removing a father does not strand his children in a floating branch.
 */
async function detachFromTree(familyId: string, userId: string): Promise<void> {
  await runAsSystem(async () => {
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      select: { treeLayout: true, members: { select: { userId: true, invitedById: true } } },
    });
    const layout = (family.treeLayout as FamilyTreeLayout | null) ?? {};
    const parents: Record<string, string | null> = { ...(layout.parents ?? {}) };
    const invitedBy = new Map(family.members.map((m) => [m.userId, m.invitedById]));
    const parentOf = (id: string) => (id in parents ? (parents[id] ?? null) : (invitedBy.get(id) ?? null));
    const theirParent = parentOf(userId);
    for (const m of family.members) {
      if (m.userId !== userId && parentOf(m.userId) === userId) parents[m.userId] = theirParent;
    }
    delete parents[userId];
    await prisma.family.update({
      where: { id: familyId },
      data: {
        treeLayout: {
          nodes: (layout.nodes ?? []).filter((n) => n.userId !== userId),
          links: (layout.links ?? []).filter((l) => l.fromUserId !== userId && l.toUserId !== userId),
          parents,
        } as unknown as object,
      },
    });
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
  /** "Wife", "Son" … of `relatedToId`; places them on the tree when they accept. */
  relation?: string;
  relatedToId?: string;
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
  const kin = await validRelative(familyId, input.relation, input.relatedToId);

  const { family, usage, seatNumber } = await nextSeat(familyId);

  if (seatNumber > family.includedSeats) {
    if (!isRazorpayConfigured()) {
      throw new BadRequestError(
        `${seatMessage(usage, toDecimal(family.extraSeatPriceInr).toString())} Payments are not configured on this server.`,
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
        kind: 'INVITE',
        invitedEmail,
        invitedName: input.invitedName?.trim() || null,
        relation: kin.relation,
        relatedToId: kin.relatedToId,
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
      message: seatMessage(usage, toDecimal(family.extraSeatPriceInr).toString()),
    };
  }

  const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  const invitation = await prisma.familyInvitation.create({
    data: {
      familyId,
      invitedEmail,
      invitedName: input.invitedName?.trim() || null,
      relation: kin.relation,
      relatedToId: kin.relatedToId,
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
): Promise<InviteResult | ManagedMemberResult> {
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

  if (pending.kind === 'MANAGED') {
    // The paid seat holds a managed profile, not an invitation. Created in
    // the same transaction as the seat increment and the pending row's
    // removal, for the same reason as the invitation below.
    const passwordHash = await unusablePasswordHash();
    const { family, profile } = await runAsSystem(() =>
      runInTransaction(async (tx) => {
        const family = await tx.family.update({
          where: { id: familyId },
          data: { includedSeats: { increment: 1 } },
          select: { name: true, includedSeats: true },
        });
        const profile = await createManagedProfileTx(tx, {
          familyId,
          name: pending.invitedName ?? 'Family member',
          relation: pending.relation,
          relatedToId: pending.relatedToId,
          managerId: pending.managedById ?? pending.createdById,
          addedById: pending.createdById,
          passwordHash,
        });
        await tx.pendingFamilyInvite.delete({ where: { id: pending.id } });
        return { family, profile };
      }),
    );
    await placeInTree(familyId, profile.id, pending.relatedToId, pending.relation);
    logger.info(
      { familyId, profileId: profile.id, pendingInviteId: pending.id },
      '[family] seat paid, managed member added',
    );
    return {
      status: 'managed_added',
      userId: profile.id,
      name: profile.name,
      familyName: family.name,
      seatNumber: family.includedSeats,
      includedSeats: family.includedSeats,
    };
  }

  const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  // Only a MANAGED seat has no address, and that one returned above.
  const pendingEmail = pending.invitedEmail;
  if (!pendingEmail) throw new BadRequestError('This seat request has no invitee.');

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
        invitedEmail: pendingEmail,
        invitedName: pending.invitedName,
        relation: pending.relation,
        relatedToId: pending.relatedToId,
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

// ─── Seats ───────────────────────────────────────────────────────────

/**
 * The seat the next member would take, and what is using the others.
 *
 * Seats are held by ACTIVE members (managed profiles included — a grandparent
 * is a member like anyone else) and by invitations nobody has accepted yet.
 * An open invitation has to hold one: without that, a family could invite
 * any number of people past its seats and only pay once they all accepted.
 *
 * It does NOT count an invitation that hands an existing member the account
 * kept for them — they already hold their seat, and counting it twice took a
 * seat away from a family for doing nothing at all.
 */
export interface SeatUsage {
  includedSeats: number;
  members: number;
  openInvitations: number;
  used: number;
}

export async function seatUsage(familyId: string): Promise<SeatUsage> {
  const [family, members, openInvitations] = await Promise.all([
    prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      select: { includedSeats: true },
    }),
    prisma.familyMember.count({ where: { familyId, status: 'ACTIVE' } }),
    prisma.familyInvitation.count({
      where: {
        familyId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        claimForUserId: null,
      },
    }),
  ]);
  return {
    includedSeats: family.includedSeats,
    members,
    openInvitations,
    used: members + openInvitations,
  };
}

async function nextSeat(familyId: string) {
  const [family, usage] = await Promise.all([
    prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      select: { name: true, includedSeats: true, extraSeatPriceInr: true },
    }),
    seatUsage(familyId),
  ]);
  return { family, usage, seatNumber: usage.used + 1 };
}

/** Says what is actually using the seats, so "pay up" is never a mystery. */
function seatMessage(usage: SeatUsage, priceInr: string): string {
  const parts = [`${usage.members} member${usage.members === 1 ? '' : 's'}`];
  if (usage.openInvitations > 0) {
    parts.push(
      `${usage.openInvitations} invitation${usage.openInvitations === 1 ? '' : 's'} nobody has accepted yet`,
    );
  }
  return (
    `Your family's ${usage.includedSeats} included seats are taken by ${parts.join(' and ')}. ` +
    `Pay ₹${priceInr} to add a seat` +
    (usage.openInvitations > 0 ? ', or cancel an invitation to free one.' : '.')
  );
}

// ─── Managed members ─────────────────────────────────────────────────

export interface AddManagedMemberInput {
  name: string;
  /** "Father", "Wife" … of `relatedToId`. */
  relation?: string;
  relatedToId?: string;
  /** Who keeps this person's books: any active, non-managed member. Defaults to the caller. */
  managerId?: string;
}

export interface ManagedMemberResult {
  status: 'managed_added';
  userId: string;
  name: string;
  familyName: string;
  seatNumber: number;
  includedSeats: number;
}

/** A hash of a secret nobody ever sees: nothing typed will ever match it. */
function unusablePasswordHash(): Promise<string> {
  return hashPassword(crypto.randomBytes(48).toString('base64url'));
}

type Tx = Parameters<Parameters<typeof runInTransaction>[0]>[0];

async function createManagedProfileTx(
  tx: Tx,
  input: {
    familyId: string;
    name: string;
    relation: string | null;
    relatedToId: string | null;
    managerId: string;
    addedById: string;
    passwordHash: string;
  },
) {
  const profile = await tx.user.create({
    data: {
      email: managedPlaceholderEmail(),
      name: input.name,
      passwordHash: input.passwordHash,
      role: 'INVESTOR',
      plan: 'FREE',
      // The lock every sign-in path checks. See managedProfile.service.
      isShadowClient: true,
      managedById: input.managerId,
    },
    select: { id: true, name: true },
  });
  await tx.familyMember.create({
    data: {
      familyId: input.familyId,
      userId: profile.id,
      // They never sign in, so the role only places them in the family;
      // VIEWER grants nothing that matters.
      role: 'VIEWER',
      status: 'ACTIVE',
      invitedById: input.addedById,
      relation: input.relation,
      relatedToId: input.relatedToId,
    },
  });
  return profile;
}

/**
 * Check a relation's anchor: the person it is measured against must be an
 * active member of this family. Returns what to store — nothing, when no
 * anchor was given, because a relation with nobody to relate to is noise.
 */
async function validRelative(
  familyId: string,
  relation: string | undefined | null,
  relatedToId: string | undefined | null,
): Promise<{ relation: string | null; relatedToId: string | null }> {
  const label = relation?.trim().slice(0, 40) || null;
  if (!relatedToId) return { relation: label, relatedToId: null };
  const row = await runAsSystem(() =>
    prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: relatedToId } },
      select: { status: true },
    }),
  );
  if (!row || row.status !== 'ACTIVE') {
    throw new BadRequestError('They must be related to an active member of this family.');
  }
  return { relation: label, relatedToId };
}

/**
 * Put a new member where their relation says: a father above the person he
 * is father of, a wife beside her husband, a son below. Saved card positions
 * are cleared so the new shape lays itself out. Any failure here must not
 * undo adding the member — they are simply left where the tree would put
 * them anyway, and can be moved with "Place".
 */
async function placeInTree(
  familyId: string,
  newUserId: string,
  relatedToId: string | null,
  relation: string | null,
  opts: { strict?: boolean } = {},
): Promise<void> {
  if (!relatedToId) return;
  try {
    await runAsSystem(async () => {
      const family = await prisma.family.findUniqueOrThrow({
        where: { id: familyId },
        select: { treeLayout: true, members: { select: { userId: true, invitedById: true } } },
      });
      const layout = (family.treeLayout as FamilyTreeLayout | null) ?? {};
      const invitedBy = new Map(family.members.map((m) => [m.userId, m.invitedById]));
      const parents = placeRelative(
        layout.parents ?? {},
        (id) => invitedBy.get(id) ?? null,
        newUserId,
        relatedToId,
        relation,
      );
      if (hasCycle(parents, (id) => invitedBy.get(id) ?? null)) {
        throw new BadRequestError(
          'That relation would put someone under their own descendant on the tree.',
        );
      }
      await prisma.family.update({
        where: { id: familyId },
        data: {
          treeLayout: { nodes: [], links: layout.links ?? [], parents } as unknown as object,
        },
      });
    });
  } catch (err) {
    // Editing a relation should say why the tree did not follow; adding
    // someone must still succeed and leaves them where they already are.
    if (opts.strict) throw err;
    logger.warn({ err, familyId, newUserId }, '[family] could not place new member on the tree');
  }
}

/** The manager must be a real, active member of this family — not another managed profile. */
async function assertValidManager(familyId: string, managerId: string): Promise<void> {
  const row = await runAsSystem(() =>
    prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: managerId } },
      select: { status: true, user: { select: { isShadowClient: true } } },
    }),
  );
  if (!row || row.status !== 'ACTIVE') {
    throw new BadRequestError('The manager must be an active member of this family.');
  }
  if (row.user.isShadowClient) {
    throw new BadRequestError('A managed profile cannot manage another one.');
  }
}

/**
 * OWNER-only. Add someone with no email or login (a grandparent, a child) as
 * a managed profile, kept by `managerId`. Takes a seat exactly as an invite
 * does, and past the included seats goes through the same seat payment.
 */
export async function addManagedMember(
  callerId: string,
  familyId: string,
  input: AddManagedMemberInput,
): Promise<ManagedMemberResult | SeatPaymentRequiredResult> {
  await assertOwnerOf(callerId, familyId);
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Their name is required.');
  if (name.length > 80) throw new BadRequestError('That name is too long.');
  const { relation, relatedToId } = await validRelative(familyId, input.relation, input.relatedToId);
  const managerId = input.managerId ?? callerId;
  await assertValidManager(familyId, managerId);

  const { family, usage, seatNumber } = await nextSeat(familyId);

  if (seatNumber > family.includedSeats) {
    if (!isRazorpayConfigured()) {
      throw new BadRequestError(
        `${seatMessage(usage, toDecimal(family.extraSeatPriceInr).toString())} Payments are not configured on this server.`,
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
        kind: 'MANAGED',
        invitedEmail: null,
        invitedName: name,
        relation,
        relatedToId,
        managedById: managerId,
        role: 'VIEWER',
        createdById: callerId,
        razorpayOrderId: order.orderId,
        expiresAt: new Date(Date.now() + PENDING_SEAT_INVITE_TTL_MIN * 60_000),
      },
    });
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
      message: seatMessage(usage, toDecimal(family.extraSeatPriceInr).toString()),
    };
  }

  const passwordHash = await unusablePasswordHash();
  // Privileged: the new FamilyMember row belongs to a user who is not the
  // caller, which its policy refuses. Ownership was proven above.
  const profile = await runAsSystem(() =>
    runInTransaction((tx) =>
      createManagedProfileTx(tx, {
        familyId,
        name,
        relation,
        relatedToId,
        managerId,
        addedById: callerId,
        passwordHash,
      }),
    ),
  );
  await placeInTree(familyId, profile.id, relatedToId, relation);
  logger.info({ familyId, profileId: profile.id, managerId }, '[family] managed member added');
  return {
    status: 'managed_added',
    userId: profile.id,
    name: profile.name,
    familyName: family.name,
    seatNumber,
    includedSeats: family.includedSeats,
  };
}

/**
 * Hand a managed profile to another member to keep — when the son who set it
 * up moves abroad, say, and his sister takes over. Open to the current
 * manager and to owners.
 */
export async function setManagedMemberManager(
  callerId: string,
  familyId: string,
  profileId: string,
  managerId: string,
): Promise<void> {
  await assertValidManager(familyId, managerId);
  const target = await runAsSystem(() =>
    prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: profileId } },
      select: { user: { select: { isShadowClient: true, managedById: true } } },
    }),
  );
  if (!target || !target.user.isShadowClient) {
    throw new NotFoundError('Managed member not found in this family.');
  }
  // The person keeping the books can hand them over themselves — they need
  // not be an owner. Anyone else must be one.
  if (target.user.managedById !== callerId) {
    await assertOwnerOf(callerId, familyId);
  }
  await runAsSystem(() =>
    prisma.user.update({ where: { id: profileId }, data: { managedById: managerId } }),
  );
  logger.info({ familyId, profileId, managerId }, '[family] managed member manager changed');
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
  // No session exists on this route by design — the token IS the credential —
  // so there is no `app.current_user_id` for FamilyInvitation's policy to
  // match and an unprivileged read returns nothing for every valid token.
  // The 32-byte token is what authorises this; the response stays limited to
  // what the accept page must render.
  const inv = await runAsSystem(() =>
    prisma.familyInvitation.findUnique({
      where: { token },
      include: {
        family: { select: { name: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    }),
  );
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

  // Privileged, and `runAsSystem` MUST wrap `runInTransaction` rather than sit
  // inside it — `runInTransaction` reads the ambient identity once, before the
  // transaction opens, and its `tx` client never passes through the hook that
  // would notice a later change. This mirrors the CA accept flow, which broke
  // in exactly this way.
  //
  // Why privileged at all: the invitee is neither the inviter nor an owner of
  // the family, so FamilyInvitation's policy hides the row from the one person
  // the token was issued to, and stamping `acceptedAt` is denied for the same
  // reason. The token plus the email match below are the authorisation; both
  // still run, and both still refuse.
  const membership = await runAsSystem(() =>
    runInTransaction(async (tx) => {
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
              relation: inv.relation,
              relatedToId: inv.relatedToId,
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
              relation: inv.relation,
              relatedToId: inv.relatedToId,
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
    }),
  );
  // Outside the transaction: placing them is a courtesy that must never
  // undo their joining.
  await placeInTree(membership.familyId, callerId, membership.relatedToId, membership.relation);
  return membership;
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
  /**
   * Who sits under whom, as the family arranged it: child userId → parent
   * userId, or null for someone placed at the top. Overrides the "who
   * invited whom" chain, which put whoever set the family up at the top — a
   * son running the account for his father is not the head of the tree.
   */
  parents?: Record<string, string | null>;
}

/**
 * Keep only parent links that point at another listed person and do not
 * loop back on themselves. A cycle would leave the tree without a top.
 */
function sanitizeParents(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object') return {};
  const parents: Record<string, string | null> = {};
  for (const [child, parent] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof child !== 'string' || child.length === 0 || child.length > 64) continue;
    if (parent === null) parents[child] = null;
    else if (typeof parent === 'string' && parent !== child && parent.length <= 64) {
      parents[child] = parent;
    }
  }
  for (const start of Object.keys(parents)) {
    const seen = new Set<string>([start]);
    let at = parents[start];
    while (typeof at === 'string') {
      if (seen.has(at)) {
        throw new BadRequestError('That arrangement puts someone under themselves.');
      }
      seen.add(at);
      at = parents[at];
    }
  }
  return parents;
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
    parents: sanitizeParents(layout.parents),
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
