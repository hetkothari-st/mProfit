import crypto from 'node:crypto';
import type { AssetClass, FamilyRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
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

  return prisma.$transaction(async (tx) => {
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

/**
 * OWNER-only. Create a signed invitation. Returns the token so the
 * caller (or an outer email-sending shim) can dispatch it to the
 * invitee. Tokens are 32 bytes of urlsafe base64, expire in
 * INVITE_TTL_DAYS days, and are single-use.
 */
export async function inviteMember(
  callerId: string,
  familyId: string,
  input: InviteInput,
) {
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
    include: { family: { select: { name: true } } },
  });
  logger.info(
    { familyId, invitedEmail, invitationId: invitation.id },
    '[family] invitation created',
  );
  return {
    id: invitation.id,
    token,
    expiresAt: invitation.expiresAt.toISOString(),
    invitedEmail,
    invitedName: invitation.invitedName,
    role: invitation.role,
    familyName: invitation.family.name,
  };
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

  return prisma.$transaction(async (tx) => {
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
