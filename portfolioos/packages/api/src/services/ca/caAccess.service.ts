/**
 * CA ↔ client grants: who a Chartered Accountant may act for, and how that
 * relationship begins and ends.
 *
 * This is the only module that reads `Client` rows to make an access decision,
 * by the same rule `familyScope.service.ts` states for `FamilyMember`. Two
 * places deciding who may be seen is how the two drift apart.
 *
 * THE CA ALWAYS ACTS UNDER THEIR OWN IDENTITY. Nothing here calls
 * `runAsUser(clientUserId, …)`, and that is deliberate rather than incidental.
 * Impersonating the client would hand the CA that identity's ENTIRE row-level
 * surface — including, via `Portfolio`'s family branch, every family-shared
 * portfolio in the client's households, owned by relatives who granted the CA
 * nothing. A client can consent to sharing their own data; they cannot consent
 * on behalf of their family. The grant is instead expressed as RLS policies
 * keyed to the CA's real id (`app_is_active_ca_for`), so Postgres decides what
 * a CA may reach, and the answer is the same whatever the service layer asks.
 *
 * Two relationship directions, one table, but deliberately separate transition
 * functions — see `Client.kind`. A single polymorphic `updateGrant()` would
 * eventually offer a shadow client a "you were removed, sign in to see why"
 * path it can never take, or fail to give a real client a working revoke
 * because the code assumed the CA drives every transition.
 */

import crypto from 'node:crypto';
import type { Client } from '@prisma/client';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { hashPassword } from '../password.service.js';
import { recordCaAudit } from './caAudit.service.js';
import type { Request } from 'express';

/** Invitations expire; an indefinitely open grant link is a standing risk. */
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * What a CA is allowed to do for one client, resolved per request.
 *
 * Structurally close to `EffectiveScope` where the meanings genuinely match,
 * and deliberately NOT the same type: it carries no `allowedAssetClasses` or
 * family fields, so it cannot be passed to `portfolioReadableWhere`,
 * `fanOutRead` or `assertCanWriteToFamily`. That mismatch is the compile-time
 * guarantee that a CA can never be processed as a family member.
 */
export interface CaScope {
  /** The CA. Never reassigned to the client anywhere. */
  callerId: string;
  clientId: string;
  /** The user whose books these are — real person or shadow record. */
  subjectUserId: string;
  kind: 'SHADOW' | 'INVITED';
  subjectLabel: string;
}

/**
 * Resolve the caller's grant over one client, or refuse.
 *
 * RLS would already return zero rows for an unauthorised CA, but a bare empty
 * result is indistinguishable from "this client has no data yet". Throwing
 * here gives the caller a truthful reason, and the policy remains the backstop
 * if this is ever bypassed — the same belt-and-braces split `getEffectiveScope`
 * uses for a forged family header.
 */
export async function getCaScope(callerId: string, clientId: string): Promise<CaScope> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });

  if (!client || client.advisorId !== callerId) {
    // Same message for "not yours" and "does not exist" — a distinct one would
    // let a CA probe which client ids are real.
    throw new ForbiddenError('That client is not yours.');
  }
  if (client.status === 'REVOKED') {
    throw new ForbiddenError('Your access to this client has been revoked.');
  }
  if (client.status === 'PENDING' || !client.userId) {
    throw new ForbiddenError('That client has not accepted your invitation yet.');
  }

  return {
    callerId,
    clientId: client.id,
    subjectUserId: client.userId,
    kind: client.kind,
    subjectLabel: client.name,
  };
}

/** The CA's own list. Revoked grants stay visible, greyed out, as history. */
export async function listClients(callerId: string): Promise<Client[]> {
  return prisma.client.findMany({
    where: { advisorId: callerId },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
}

/** The client's own view: every professional who can currently see their books. */
export async function listMyProfessionals(callerId: string) {
  const rows = await prisma.client.findMany({
    where: { userId: callerId, status: 'ACTIVE' },
    orderBy: { acceptedAt: 'desc' },
  });
  const advisorIds = [...new Set(rows.map((r) => r.advisorId))];
  // The advisor is a different user, so their name is not readable under the
  // client's own RLS context. This is a bounded authorisation-adjacent lookup:
  // membership is already proven by the row, and it selects nothing but the
  // identity needed to render "who has access".
  const advisors = await runAsSystem(() =>
    prisma.user.findMany({
      where: { id: { in: advisorIds } },
      select: { id: true, name: true, email: true },
    }),
  );
  const byId = new Map(advisors.map((a) => [a.id, a]));
  return rows.map((r) => ({
    clientId: r.id,
    grantedAt: r.acceptedAt,
    advisor: byId.get(r.advisorId) ?? null,
  }));
}

// ─── Direction (b): CA-owned record, no login ────────────────────────

export interface CreateManagedClientInput {
  name: string;
  email?: string;
  pan?: string;
  phone?: string;
  category?: string;
  consentBasis: 'ENGAGEMENT_LETTER' | 'WRITTEN_CONSENT' | 'EXISTING_CLIENT_RELATIONSHIP' | 'OTHER';
  consentNote?: string;
}

/**
 * Create a client record for someone with no login, and the shadow `User` that
 * owns their books.
 *
 * `consentBasis` is required rather than optional. The subject here is a real
 * person who never agreed to anything in this product, and their complete
 * financial position is about to live in it. The platform cannot verify the
 * basis, but it can refuse to let the question go unasked — an optional field
 * would be left null forever and the obligation would rest with nobody.
 */
export async function createManagedClient(
  callerId: string,
  input: CreateManagedClientInput,
  req?: Request,
): Promise<Client> {
  const name = input.name.trim();
  if (!name) throw new BadRequestError('A client name is required.');

  // The shadow user's login email must never collide with, or be mistaken
  // for, a real one. `.invalid` is reserved by RFC 2606 and can never resolve,
  // so no mail can be sent to it even by accident. The client's real address,
  // if the CA has one, is kept on the Client row for correspondence instead —
  // where it can never be used to authenticate.
  const shadowEmail = `client-${crypto.randomUUID()}@ca-client.invalid`;
  // Hash of a secret that is discarded on the next line. Nothing anyone can
  // type will match it; `isShadowClient` is the lock that actually matters.
  const unusablePassword = crypto.randomBytes(48).toString('base64url');
  const passwordHash = await hashPassword(unusablePassword);

  return runInTransaction(async (tx) => {
    // No runAsSystem here, deliberately: inside runInTransaction it would be a
    // no-op (see the note in acceptInvitation) and a no-op that looks load-
    // bearing is worse than none. This works because `User` carries no RLS
    // policy at all. If one is ever added, this insert breaks — which is the
    // right failure, because it would then need the same hoisting treatment
    // rather than a decoration that never did anything.
    const shadow = await tx.user.create({
      data: {
        email: shadowEmail,
        name,
        passwordHash,
        isShadowClient: true,
        role: 'INVESTOR',
        plan: 'FREE',
        pan: input.pan ?? null,
        phone: input.phone ?? null,
      },
    });

    const client = await tx.client.create({
      data: {
        advisorId: callerId,
        name,
        email: input.email ?? null,
        pan: input.pan ?? null,
        phone: input.phone ?? null,
        category: input.category ?? null,
        userId: shadow.id,
        kind: 'SHADOW',
        // Live immediately: there is no second party whose consent is pending.
        status: 'ACTIVE',
        acceptedAt: new Date(),
        consentBasis: input.consentBasis,
        consentNote: input.consentNote ?? null,
      },
    });

    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: shadow.id, clientId: client.id, req },
      {
        action: 'CLIENT_RECORD_CREATED',
        resourceType: 'Client',
        resourceId: client.id,
        summary: `Created a managed client record for ${name}.`,
        after: { name, consentBasis: input.consentBasis },
      },
    );

    return client;
  });
}

// ─── Direction (a): the client consents ──────────────────────────────

/**
 * Invite a real user. No shadow user and no `userId` yet: there is nothing to
 * reach before they accept, which is what spares this design a merge step.
 */
export async function inviteClient(
  callerId: string,
  input: { name: string; email: string },
  req?: Request,
): Promise<{ client: Client; token: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new BadRequestError('A client name is required.');
  if (!email) throw new BadRequestError('An email address is required.');

  const token = crypto.randomBytes(32).toString('hex');

  const client = await runInTransaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        advisorId: callerId,
        name,
        email,
        kind: 'INVITED',
        status: 'PENDING',
        invitedEmail: email,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    // No subject user exists yet, so the trail records the CA as its own
    // subject — the alternative is no record of the invitation at all.
    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: callerId, clientId: created.id, req },
      {
        action: 'CLIENT_INVITED',
        resourceType: 'Client',
        resourceId: created.id,
        summary: `Invited ${name} (${email}) to share their books.`,
      },
    );
    return created;
  });

  return { client, token };
}

/**
 * The invitee accepts.
 *
 * Runs privileged because the invitee is not yet party to the row and so
 * cannot read it under their own context — the same shape as accepting a
 * family invitation. The token is the credential: it is single-use, expiring,
 * and bound to the address it was sent to. Role and permissions are read from
 * the row, never from anything the caller supplies.
 */
export async function acceptInvitation(
  callerId: string,
  callerEmail: string,
  token: string,
): Promise<Client> {
  // runAsSystem MUST wrap runInTransaction, not sit inside it.
  //
  // runInTransaction reads the ambient identity ONCE, before opening the
  // transaction, and hands the callback a base-client `tx` that does not pass
  // through the $allOperations hook. A runAsSystem() inside the callback
  // therefore changes the AsyncLocalStorage store and nothing ever reads it
  // again — the session variable stays whatever was set at transaction start.
  //
  // That silently broke this entire flow: the session stayed as the invitee,
  // and a PENDING row (advisorId = the CA, userId still null) matches no
  // branch of the Client policy, so every valid token read back zero rows and
  // threw "Invitation not found."
  return runAsSystem(() =>
    runInTransaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { inviteToken: token } });

      if (!client || client.kind !== 'INVITED') throw new NotFoundError('Invitation not found.');
      if (client.status === 'REVOKED') {
        throw new ForbiddenError('That invitation is no longer valid.');
      }
      if (client.acceptedAt) throw new BadRequestError('That invitation has already been used.');
      if (!client.inviteExpiresAt || client.inviteExpiresAt < new Date()) {
        throw new BadRequestError('That invitation has expired. Ask your CA to send a new one.');
      }
      // The token proves possession; this proves it reached the right person.
      // Checked inside the transaction that consumes the token, so a race
      // cannot accept one invitation under another account's email.
      if ((client.invitedEmail ?? '').toLowerCase() !== callerEmail.toLowerCase()) {
        throw new ForbiddenError('That invitation was sent to a different email address.');
      }

      const updated = await tx.client.update({
        where: { id: client.id },
        data: {
          userId: callerId,
          status: 'ACTIVE',
          acceptedAt: new Date(),
          // Single use: clearing the token makes a replay find nothing.
          inviteToken: null,
        },
      });

      await recordCaAudit(
        tx,
        { actorUserId: callerId, subjectUserId: callerId, clientId: client.id },
        {
          action: 'GRANT_ACCEPTED',
          resourceType: 'Client',
          resourceId: client.id,
          summary: 'You granted your CA access to your books.',
        },
      );

      return updated;
    }),
  );
}

/**
 * End a grant. Either side may: the client withdrawing consent, or the CA
 * closing an engagement. `revokedByUserId` records which, so the trail is
 * never ambiguous about who ended it.
 *
 * Revocation bites on the CA's very next query. Nothing caches the decision —
 * `getCaScope` and `app_is_active_ca_for` both re-read the row every time —
 * so there is no session to invalidate. Artefacts already downloaded cannot be
 * recalled; that is stated plainly rather than implied away.
 */
export async function revokeGrant(callerId: string, clientId: string, req?: Request): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Client not found.');

  const isAdvisor = client.advisorId === callerId;
  const isSubject = client.userId === callerId;
  if (!isAdvisor && !isSubject) throw new ForbiddenError('That grant is not yours to end.');

  if (client.status === 'REVOKED') return;

  await runInTransaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: callerId, inviteToken: null },
    });
    await recordCaAudit(
      tx,
      {
        actorUserId: callerId,
        subjectUserId: client.userId ?? callerId,
        clientId,
        req,
      },
      {
        action: 'GRANT_REVOKED',
        resourceType: 'Client',
        resourceId: clientId,
        summary: isSubject
          ? 'You revoked your CA’s access to your books.'
          : `Your CA closed the engagement for ${client.name}.`,
      },
    );
  });
}

/**
 * A client's own record of what their CA has done. Reads under the caller's
 * context: the RLS policy already limits rows to those where the caller is
 * either the actor or the subject, so a CA and a client each see the same
 * entries from their own side without a second filter here.
 */
export async function listCaActivity(callerId: string, opts: { clientId?: string; limit?: number } = {}) {
  return prisma.caAuditLog.findMany({
    where: {
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      OR: [{ actorUserId: callerId }, { subjectUserId: callerId }],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 500),
  });
}
