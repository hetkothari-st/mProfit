/**
 * Handing a managed profile to the person it belongs to.
 *
 * A grandparent's books were kept for them because they had no email. When
 * they get one, the family invites them to take the profile over: the SAME
 * user row becomes their account — their email, their password — so every
 * holding, transaction and receipt recorded for them stays exactly where it
 * is, under the same ids, still in the family, still in its place on the
 * tree. Creating a second account and moving data across would lose both the
 * history and the lineage.
 *
 * What the claim flips, in one transaction:
 *   isShadowClient  true → false   the profile can now sign in
 *   managedById     set  → null    nobody acts for it any more
 *   email           placeholder → theirs
 *   passwordHash    unusable → the one they just set
 *
 * The checks that make that safe:
 *   - The link is a single-use token with an expiry, mailed to one address.
 *   - The address must be free. Taking over cannot silently merge two
 *     accounts, so an address that already has one is refused, by name.
 *   - The profile must still be managed and still an active member — a
 *     profile already claimed, removed, or handed to someone else fails.
 *   - Only the family's owners, or whoever keeps the profile's books, can
 *     send the invitation in the first place.
 */

import crypto from 'node:crypto';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { hashPassword } from '../password.service.js';
import { issueSession } from '../auth.service.js';
import { assertOwnerOf } from '../familyScope.service.js';

const CLAIM_TOKEN_BYTES = 32;

const CLAIM_TTL_DAYS = 14;

export interface ClaimInviteResult {
  invitationId: string;
  token: string;
  invitedEmail: string;
  expiresAt: string;
}

/**
 * Invite the person a managed profile belongs to, so they can take it over.
 *
 * Open to the family's owners and to whoever keeps this profile's books —
 * the same two parties who can hand it to another member.
 */
export async function inviteProfileClaim(
  callerId: string,
  familyId: string,
  profileId: string,
  input: { email: string },
): Promise<ClaimInviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new BadRequestError('A valid email is required.');

  const membership = await runAsSystem(() =>
    prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: profileId } },
      select: {
        status: true,
        role: true,
        relation: true,
        relatedToId: true,
        user: { select: { name: true, isShadowClient: true, managedById: true } },
      },
    }),
  );
  if (!membership || !membership.user.isShadowClient) {
    throw new NotFoundError('Managed member not found in this family.');
  }
  if (membership.status !== 'ACTIVE') {
    throw new BadRequestError('That member is no longer in this family.');
  }
  if (membership.user.managedById !== callerId) {
    await assertOwnerOf(callerId, familyId);
  }

  // A claim cannot merge two accounts, so the address has to be free.
  const taken = await runAsSystem(() =>
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  );
  if (taken) {
    throw new BadRequestError(
      `${email} already has an EveryPaisa account. Ask them to sign in with it — or use another address for this profile.`,
    );
  }

  const token = crypto.randomBytes(CLAIM_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + CLAIM_TTL_DAYS * 86_400_000);

  // Privileged: the invitation is about somebody else's row, and only the
  // authorisation above decides who may create it.
  const invitation = await runAsSystem(() =>
    prisma.familyInvitation.create({
      data: {
        familyId,
        invitedEmail: email,
        invitedName: membership.user.name,
        // What they keep when they take over: their place in the family,
        // and their place on the tree.
        role: membership.role === 'VIEWER' ? 'CONTRIBUTOR' : membership.role,
        relation: membership.relation,
        relatedToId: membership.relatedToId,
        claimForUserId: profileId,
        invitedById: callerId,
        token,
        expiresAt,
      },
    }),
  );
  logger.info({ familyId, profileId, invitationId: invitation.id }, '[family] profile claim invited');
  return {
    invitationId: invitation.id,
    token,
    invitedEmail: email,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface ClaimPreview {
  profileName: string;
  familyName: string;
  invitedBy: string;
  invitedEmail: string;
  expiresAt: string;
}

/**
 * What the link says before anyone signs anything. Unauthenticated by
 * necessity: the person holding it has no account yet. It answers "who is
 * asking, for what" and nothing else — no ids, no holdings, no addresses
 * beyond the one the mail went to.
 */
export async function peekProfileClaim(token: string): Promise<ClaimPreview> {
  const inv = await runAsSystem(() =>
    prisma.familyInvitation.findUnique({
      where: { token },
      include: {
        family: { select: { name: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    }),
  );
  if (!inv || !inv.claimForUserId) throw new NotFoundError('That link is not valid.');
  if (inv.acceptedAt) throw new BadRequestError('That account has already been taken over.');
  if (inv.expiresAt < new Date()) throw new BadRequestError('That link has expired.');

  const profile = await runAsSystem(() =>
    prisma.user.findUnique({
      where: { id: inv.claimForUserId! },
      select: { name: true, isShadowClient: true },
    }),
  );
  if (!profile?.isShadowClient) throw new BadRequestError('That account has already been taken over.');

  return {
    profileName: profile.name,
    familyName: inv.family.name,
    invitedBy: inv.invitedBy.name || inv.invitedBy.email,
    invitedEmail: inv.invitedEmail,
    expiresAt: inv.expiresAt.toISOString(),
  };
}

/**
 * Take the profile over: it becomes this person's own account, and they are
 * signed in as it.
 *
 * Every check is re-run inside the transaction, against the row, so a link
 * used twice at once cannot produce two owners of one profile.
 */
export async function claimProfile(
  token: string,
  input: { email: string; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  const user = await runAsSystem(() =>
    runInTransaction(async (tx) => {
      const inv = await tx.familyInvitation.findUnique({ where: { token } });
      if (!inv || !inv.claimForUserId) throw new NotFoundError('That link is not valid.');
      if (inv.acceptedAt) throw new BadRequestError('That account has already been taken over.');
      if (inv.expiresAt < new Date()) throw new BadRequestError('That link has expired.');
      if (inv.invitedEmail.toLowerCase() !== email) {
        throw new ForbiddenError('This link was sent to a different email address.');
      }

      const profile = await tx.user.findUnique({ where: { id: inv.claimForUserId } });
      if (!profile || !profile.isShadowClient) {
        throw new BadRequestError('That account has already been taken over.');
      }
      const membership = await tx.familyMember.findUnique({
        where: { familyId_userId: { familyId: inv.familyId, userId: profile.id } },
        select: { status: true },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new BadRequestError('That member is no longer in this family.');
      }
      const taken = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (taken && taken.id !== profile.id) {
        throw new BadRequestError(`${email} already has an EveryPaisa account.`);
      }

      const claimed = await tx.user.update({
        where: { id: profile.id },
        data: {
          email,
          passwordHash,
          // The two locks that made this a managed profile, both released.
          isShadowClient: false,
          managedById: null,
        },
      });
      await tx.familyMember.update({
        where: { familyId_userId: { familyId: inv.familyId, userId: profile.id } },
        data: { role: inv.role },
      });
      await tx.familyInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: profile.id,
          action: 'managed_profile_claimed',
          resource: `Family:${inv.familyId}`,
          metadata: { invitationId: inv.id },
        },
      });
      return claimed;
    }),
  );

  logger.info({ userId: user.id }, '[family] managed profile claimed');
  return issueSession(user);
}
