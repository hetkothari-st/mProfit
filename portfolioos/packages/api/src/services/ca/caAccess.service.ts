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
import type { AssetClass, Client } from '@prisma/client';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { hashPassword } from '../password.service.js';
import { recordCaAudit } from './caAudit.service.js';
import type { Request } from 'express';
import { panColumns } from '../piiAtRest.service.js';

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
  /**
   * What the client narrowed the grant to. `null` means unrestricted, matching
   * `EffectiveScope`'s contract — and, as there, an EMPTY array means deny-all
   * rather than "anything".
   *
   * These exist so a caller can say what it is showing, and refuse to produce
   * an artefact it cannot filter. They are NOT the enforcement: the policies
   * ask `app_ca_may_see_portfolio` / `_category` / `_asset_class` themselves,
   * so a service that forgets to consult these still reads nothing it should
   * not.
   */
  allowedPortfolioIds: string[] | null;
  allowedAssetClasses: AssetClass[] | null;
  allowedCategories: string[] | null;
  /** The grant's window, for display. Expiry itself is enforced in SQL. */
  accessFrom: Date | null;
  accessUntil: Date | null;
  /**
   * What may be CHANGED, as opposed to seen. Default for a new grant is
   * nothing: a professional reads until the account holder says otherwise.
   *
   * As with the read caps, these are not the enforcement — the write policies
   * ask `app_ca_may_edit` themselves. They are here so a handler can refuse
   * with a sentence instead of letting Postgres return a bare 42501 that the
   * user reads as a bug.
   */
  edit: CaEditRights;
}

/** The four write surfaces a grant can cover, each a genuinely different job. */
export interface CaEditRights {
  books: boolean;
  transactions: boolean;
  imports: boolean;
  fmv: boolean;
}

export type CaEditSection = keyof CaEditRights;

const EDIT_SECTION_LABEL: Record<CaEditSection, string> = {
  books: 'keep your client’s books',
  transactions: 'add or correct transactions',
  imports: 'upload statements',
  fmv: 'set fair market values',
};

/**
 * Refuse a write the grant does not permit, in words.
 *
 * The policy would refuse it anyway — that is the guarantee — but Postgres
 * says "new row violates row-level security policy", which reads as a broken
 * feature rather than a boundary working. Callers use this so the answer names
 * the missing permission and who can grant it.
 */
export function assertCaMayEdit(scope: CaScope, section: CaEditSection): void {
  if (scope.edit[section]) return;
  throw new ForbiddenError(
    `${scope.subjectLabel} has given you view-only access, so you cannot ${EDIT_SECTION_LABEL[section]}. They can change that from Account Access.`,
  );
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
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      portfolioScopes: { select: { portfolioId: true } },
      clientUser: { select: { name: true, email: true } },
    },
  });

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
  const now = new Date();
  if (client.accessFrom && client.accessFrom > now) {
    throw new ForbiddenError(
      `This access starts on ${client.accessFrom.toISOString().slice(0, 10)}.`,
    );
  }
  if (client.accessUntil && client.accessUntil < now) {
    // Said plainly, because the CA can do nothing about it themselves: the
    // client sets the window and only the client can extend it.
    throw new ForbiddenError(
      `This access ended on ${client.accessUntil.toISOString().slice(0, 10)}. Ask the client to extend it.`,
    );
  }

  return {
    callerId,
    clientId: client.id,
    subjectUserId: client.userId,
    kind: client.kind,
    subjectLabel: subjectDisplay(client).name,
    allowedPortfolioIds: client.scopeAllPortfolios
      ? null
      : client.portfolioScopes.map((s) => s.portfolioId),
    allowedAssetClasses: client.scopeAllAssetClasses ? null : client.visibleAssetClasses,
    allowedCategories: client.scopeAllCategories ? null : client.visibleCategories,
    accessFrom: client.accessFrom,
    accessUntil: client.accessUntil,
    edit: {
      books: client.canEditBooks,
      transactions: client.canEditTransactions,
      imports: client.canEditImports,
      fmv: client.canEditFmv,
    },
  };
}

/**
 * Who a grant is ABOUT, as the professional should see them.
 *
 * `Client.name` and `Client.email` are whatever the person who opened the
 * relationship typed. When a practice invites a client, that is the client —
 * correct. When an account holder invites their accountant, it is the
 * ACCOUNTANT — so reading those columns showed a professional their own name
 * and address at the top of someone else's books, and told them "Ramesh has
 * given you view-only access" when Ramesh was them.
 *
 * For a client-initiated grant the subject is the account that invited, so the
 * name comes from that user. `User` carries no row-level policy, so this is an
 * ordinary read of exactly the identity the workspace has to render.
 */
function subjectDisplay(client: {
  initiatedBy: 'ADVISOR' | 'CLIENT';
  name: string;
  email: string | null;
  clientUser?: { name: string | null; email: string } | null;
}): { name: string; email: string | null } {
  if (client.initiatedBy === 'CLIENT' && client.clientUser) {
    return {
      name: client.clientUser.name || client.clientUser.email,
      email: client.clientUser.email,
    };
  }
  return { name: client.name, email: client.email };
}

/**
 * The professional's own list. Revoked grants stay visible, greyed out, as
 * history. `displayName` / `displayEmail` are who the books BELONG to — see
 * `subjectDisplay` — and are what every screen on this side should show.
 */
export async function listClients(
  callerId: string,
): Promise<Array<Client & { displayName: string; displayEmail: string | null }>> {
  const rows = await prisma.client.findMany({
    where: { advisorId: callerId },
    include: { clientUser: { select: { name: true, email: true } } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  return rows.map(({ clientUser, ...row }) => {
    const shown = subjectDisplay({ ...row, clientUser });
    return { ...row, displayName: shown.name, displayEmail: shown.email };
  });
}

/** The client's own view: every professional who can currently see their books. */
export async function listMyProfessionals(callerId: string) {
  // Revoked grants stay in the list. They are the client's own history of who
  // they let in, and the only way back to one they ended by accident — a page
  // that hid them would make `reinstateGrant` unreachable from the UI.
  const rows = await prisma.client.findMany({
    where: { userId: callerId, status: { in: ['ACTIVE', 'REVOKED'] } },
    include: { portfolioScopes: { select: { portfolioId: true } } },
    orderBy: [{ status: 'asc' }, { acceptedAt: 'desc' }],
  });
  // Null advisors are invitations nobody has accepted; they have no identity
  // to look up yet.
  const advisorIds = [...new Set(rows.map((r) => r.advisorId).filter((id): id is string => !!id))];
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
    advisor: r.advisorId ? (byId.get(r.advisorId) ?? null) : null,
    status: r.status,
    revokedAt: r.revokedAt,
    accessFrom: r.accessFrom,
    accessUntil: r.accessUntil,
    // Enough for the card to say what this grant covers without a second
    // request per row; the manage panel fetches the full picture.
    scopeAllPortfolios: r.scopeAllPortfolios,
    scopeAllAssetClasses: r.scopeAllAssetClasses,
    scopeAllCategories: r.scopeAllCategories,
    portfolioCount: r.portfolioScopes.length,
    assetClassCount: r.visibleAssetClasses.length,
    categoryCount: r.visibleCategories.length,
    // One bit for the card; the manage panel asks for the four.
    canEdit: r.canEditBooks || r.canEditTransactions || r.canEditImports || r.canEditFmv,
    // Three states rather than a bit, because "some of it" is a real answer
    // and describing it as either end would misstate what was given.
    editMode: editModeOf(r),
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
  // Closed to new records.
  //
  // A shadow client is books about a real person who never agreed to anything
  // in this product — the one path where a set of books exists without the
  // subject's consent. Existing rows stay readable so a practice does not lose
  // work already done, but the way in now is an invitation the person accepts.
  throw new BadRequestError(
    'Records for clients without a login are no longer created. Invite them instead — they accept from their own account, and can see and limit what you do.',
  );

  // eslint-disable-next-line no-unreachable -- kept so existing shadow rows'
  // creation logic stays legible next to the policy that now forbids it.
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
    const shadowPanColumns = await panColumns(input.pan ?? null);
    const shadow = await tx.user.create({
      data: {
        email: shadowEmail,
        name,
        passwordHash,
        isShadowClient: true,
        role: 'INVESTOR',
        plan: 'FREE',
        // Encrypted columns, never plaintext — the same as every other
        // User.pan writer. This path was the one that still wrote it raw.
        ...shadowPanColumns,
        phone: input.phone ?? null,
      },
    });

    const client = await tx.client.create({
      data: {
        advisorId: callerId,
        name,
        email: input.email ?? null,
        // Dual-write: the CA client list still renders Client.pan, so the
        // plaintext stays until that view reads the encrypted copy. See
        // services/piiAtRest.service.ts.
        pan: input.pan ?? null,
        panEnc: shadowPanColumns.panEnc,
        panHash: shadowPanColumns.panHash,
        panLast4: shadowPanColumns.panLast4,
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

// ─── What the client controls ────────────────────────────────────────
//
// Everything below is the SUBJECT's side of a grant: the person whose books
// these are decides which portfolios a professional may open, which asset
// classes and categories of their life are included, and between which dates
// any of it works. A CA can read their own scope and nothing else — a
// professional who could widen their own access has no scope at all.

/** VIEW = nothing may change, FULL = everything may, PARTIAL = some of it. */
function editModeOf(r: {
  canEditBooks: boolean;
  canEditTransactions: boolean;
  canEditImports: boolean;
  canEditFmv: boolean;
}): 'VIEW' | 'PARTIAL' | 'FULL' {
  const flags = [r.canEditBooks, r.canEditTransactions, r.canEditImports, r.canEditFmv];
  if (flags.every(Boolean)) return 'FULL';
  if (flags.some(Boolean)) return 'PARTIAL';
  return 'VIEW';
}

/** Categories a grant can be narrowed to. Mirrors `NON_AC_CATEGORIES`. */
export const CA_SCOPE_CATEGORIES = [
  'VEHICLE',
  'RENTAL',
  'INSURANCE',
  'LOAN',
  'CREDIT_CARD',
  'BANK_ACCOUNT',
  'OWNED_PROPERTY',
  'GOAL',
] as const;
export type CaScopeCategory = (typeof CA_SCOPE_CATEGORIES)[number];

export interface GrantScopePatch {
  /** Any subset; anything left out is untouched. */
  edit?: Partial<{ books: boolean; transactions: boolean; imports: boolean; fmv: boolean }>;
  /** `null` restores "all portfolios"; an array is the allowlist. */
  portfolioIds?: string[] | null;
  assetClasses?: AssetClass[] | null;
  categories?: CaScopeCategory[] | null;
  /** `null` clears that end of the window. Dates are YYYY-MM-DD. */
  accessFrom?: string | null;
  accessUntil?: string | null;
}

/**
 * One grant as the client sees it: who holds it, what it currently covers, and
 * the portfolios they could put in or out of it.
 *
 * The advisor's name needs a privileged read for the same reason
 * `listMyProfessionals` does — they are a different user, invisible under the
 * client's own policies — and is bounded to the identity the page must render.
 */
export async function getGrantForSubject(callerId: string, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { portfolioScopes: { select: { portfolioId: true } } },
  });
  if (!client) throw new NotFoundError('Grant not found.');
  if (client.userId !== callerId) {
    throw new ForbiddenError('That grant is not yours to manage.');
  }

  // Null while a client-initiated invitation is still open: there is nobody
  // holding this grant yet, and the page says so rather than inventing a name.
  const advisor = client.advisorId
    ? await runAsSystem(() =>
        prisma.user.findUnique({
          where: { id: client.advisorId! },
          select: { id: true, name: true, email: true },
        }),
      )
    : null;

  const portfolios = await prisma.portfolio.findMany({
    where: { userId: callerId },
    select: { id: true, name: true, type: true, familyId: true },
    orderBy: { name: 'asc' },
  });

  return {
    clientId: client.id,
    kind: client.kind,
    status: client.status,
    name: client.name,
    advisor,
    acceptedAt: client.acceptedAt,
    revokedAt: client.revokedAt,
    accessFrom: client.accessFrom,
    accessUntil: client.accessUntil,
    scopeAllPortfolios: client.scopeAllPortfolios,
    scopeAllAssetClasses: client.scopeAllAssetClasses,
    scopeAllCategories: client.scopeAllCategories,
    edit: {
      books: client.canEditBooks,
      transactions: client.canEditTransactions,
      imports: client.canEditImports,
      fmv: client.canEditFmv,
    },
    portfolioIds: client.portfolioScopes.map((s) => s.portfolioId),
    assetClasses: client.visibleAssetClasses,
    categories: client.visibleCategories,
    /** Everything the client could include — the picker's universe. */
    availablePortfolios: portfolios,
  };
}

/**
 * Narrow or widen a grant. Subject only.
 *
 * The whole scope and its audit entry are written in one transaction, because
 * a half-applied scope is a grant nobody can describe: portfolio rows saying
 * one thing and the flags another is exactly the state the client would never
 * be shown and could never correct.
 *
 * Portfolio ids are checked against the caller's own portfolios rather than
 * trusted. Passing someone else's id would otherwise write a scope row that
 * `app_ca_may_see_portfolio` ignores — harmless to security, and a lie on the
 * screen that lists what the CA can see.
 */
export async function updateGrantScope(
  callerId: string,
  clientId: string,
  patch: GrantScopePatch,
  req?: Request,
): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Grant not found.');
  if (client.userId !== callerId) {
    throw new ForbiddenError('That grant is not yours to manage.');
  }

  const from = parseScopeDate(patch.accessFrom, 'accessFrom');
  const until = parseScopeDate(patch.accessUntil, 'accessUntil');
  const nextFrom = patch.accessFrom === undefined ? client.accessFrom : from;
  const nextUntil = patch.accessUntil === undefined ? client.accessUntil : until;
  if (nextFrom && nextUntil && nextFrom > nextUntil) {
    throw new BadRequestError('Access cannot end before it starts.');
  }

  let portfolioIds: string[] | null | undefined;
  if (patch.portfolioIds !== undefined) {
    if (patch.portfolioIds === null) {
      portfolioIds = null;
    } else {
      const owned = await prisma.portfolio.findMany({
        where: { id: { in: patch.portfolioIds }, userId: callerId },
        select: { id: true },
      });
      if (owned.length !== new Set(patch.portfolioIds).size) {
        throw new BadRequestError('One of those portfolios is not yours.');
      }
      portfolioIds = owned.map((p) => p.id);
    }
  }

  await runInTransaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        ...(patch.accessFrom !== undefined ? { accessFrom: from } : {}),
        ...(patch.accessUntil !== undefined ? { accessUntil: until } : {}),
        ...(portfolioIds !== undefined ? { scopeAllPortfolios: portfolioIds === null } : {}),
        ...(patch.assetClasses !== undefined
          ? {
              scopeAllAssetClasses: patch.assetClasses === null,
              visibleAssetClasses: patch.assetClasses ?? [],
            }
          : {}),
        ...(patch.categories !== undefined
          ? {
              scopeAllCategories: patch.categories === null,
              visibleCategories: patch.categories ?? [],
            }
          : {}),
        ...(patch.edit?.books !== undefined ? { canEditBooks: patch.edit.books } : {}),
        ...(patch.edit?.transactions !== undefined
          ? { canEditTransactions: patch.edit.transactions }
          : {}),
        ...(patch.edit?.imports !== undefined ? { canEditImports: patch.edit.imports } : {}),
        ...(patch.edit?.fmv !== undefined ? { canEditFmv: patch.edit.fmv } : {}),
      },
    });

    if (portfolioIds !== undefined) {
      await tx.clientPortfolioScope.deleteMany({ where: { clientId } });
      if (portfolioIds !== null && portfolioIds.length > 0) {
        await tx.clientPortfolioScope.createMany({
          data: portfolioIds.map((portfolioId) => ({ clientId, portfolioId })),
        });
      }
    }

    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: callerId, clientId, req },
      {
        action: 'GRANT_SCOPE_CHANGED',
        resourceType: 'Client',
        resourceId: clientId,
        summary: describeScopeChange(patch),
        before: {
          scopeAllPortfolios: client.scopeAllPortfolios,
          scopeAllAssetClasses: client.scopeAllAssetClasses,
          scopeAllCategories: client.scopeAllCategories,
          accessFrom: client.accessFrom?.toISOString() ?? null,
          accessUntil: client.accessUntil?.toISOString() ?? null,
        },
        after: {
          portfolioIds: portfolioIds ?? 'all',
          assetClasses: patch.assetClasses ?? 'all',
          categories: patch.categories ?? 'all',
          accessFrom: nextFrom?.toISOString() ?? null,
          accessUntil: nextUntil?.toISOString() ?? null,
        },
      },
    );
  });
}

/**
 * Put a revoked grant back.
 *
 * The client may always reinstate their own — withdrawing consent should never
 * be a one-way door they need support to reopen. A CA may only reinstate a
 * SHADOW record, which is their own bookkeeping and has no other party; if a
 * real client revoked, only that client can undo it, or the CA invites them
 * again and they accept.
 */
export async function reinstateGrant(
  callerId: string,
  clientId: string,
  req?: Request,
): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Grant not found.');

  const isSubject = client.userId === callerId;
  const isAdvisor = client.advisorId === callerId;
  if (!isSubject && !(isAdvisor && client.kind === 'SHADOW')) {
    throw new ForbiddenError(
      'Only the client can restore this access. Ask them, or send a fresh invitation.',
    );
  }
  if (client.status === 'ACTIVE') return;
  if (!client.userId) {
    throw new BadRequestError(
      'That invitation was never accepted, so there is nothing to restore — send a new one.',
    );
  }

  const subjectUserId = client.userId;
  await runInTransaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: { status: 'ACTIVE', revokedAt: null, revokedByUserId: null },
    });
    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId, clientId, req },
      {
        action: 'GRANT_REINSTATED',
        resourceType: 'Client',
        resourceId: clientId,
        summary: isSubject
          ? 'You restored your CA’s access to your books.'
          : `Your CA reopened the engagement for ${client.name}.`,
      },
    );
  });
}

/** `YYYY-MM-DD` at the start of that day, or null. Anything else is refused. */
function parseScopeDate(value: string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestError(`${field} must be a date in YYYY-MM-DD form.`);
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestError(`${field} is not a real date.`);
  return d;
}

/** One line a person would actually recognise on their own activity feed. */
function describeScopeChange(patch: GrantScopePatch): string {
  const parts: string[] = [];
  if (patch.portfolioIds !== undefined) {
    parts.push(
      patch.portfolioIds === null
        ? 'all portfolios'
        : `${patch.portfolioIds.length} portfolio${patch.portfolioIds.length === 1 ? '' : 's'}`,
    );
  }
  if (patch.assetClasses !== undefined) {
    parts.push(
      patch.assetClasses === null
        ? 'all asset classes'
        : `${patch.assetClasses.length} asset class${patch.assetClasses.length === 1 ? '' : 'es'}`,
    );
  }
  if (patch.categories !== undefined) {
    parts.push(
      patch.categories === null
        ? 'all categories'
        : `${patch.categories.length} categor${patch.categories.length === 1 ? 'y' : 'ies'}`,
    );
  }
  if (patch.accessFrom !== undefined) {
    parts.push(patch.accessFrom ? `access from ${patch.accessFrom}` : 'no start date');
  }
  if (patch.edit) {
    const on = Object.entries(patch.edit)
      .filter(([, v]) => v)
      .map(([k]) => k);
    parts.push(on.length === 0 ? 'view only' : `may change ${on.join(', ')}`);
  }
  if (patch.accessUntil !== undefined) {
    parts.push(patch.accessUntil ? `access until ${patch.accessUntil}` : 'no end date');
  }
  return parts.length > 0
    ? `You changed what your CA can see: ${parts.join(', ')}.`
    : 'You reviewed what your CA can see.';
}

// ─── The ordinary direction: a client brings in their professional ───
//
// The account holder names someone, we email them, and they accept from their
// own account. Nothing of the client's is readable until that acceptance: the
// row carries no `advisorId` until then, and every policy compares that column
// to the caller.
//
// This is free for the professional who accepts. Their own portfolios, and
// inviting clients of their own, are what the advisor plan is for.

export interface InviteProfessionalInput {
  /** What to call them on the invitation. */
  name: string;
  email: string;
}

/**
 * Open an invitation to a professional.
 *
 * Refuses a second open invitation to the same address, and refuses one to an
 * address that already holds access — both would leave the client with two
 * rows meaning one relationship, and no way to tell which of them a revoke
 * applied to.
 */
export async function inviteProfessional(
  callerId: string,
  input: InviteProfessionalInput,
  req?: Request,
): Promise<{ client: Client; token: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new BadRequestError('A name is required.');
  if (!email.includes('@')) throw new BadRequestError('A valid email address is required.');

  const caller = await prisma.user.findUnique({
    where: { id: callerId },
    select: { email: true },
  });
  if (caller?.email.toLowerCase() === email) {
    throw new BadRequestError('That is your own address — invite the professional you work with.');
  }

  const existing = await prisma.client.findFirst({
    where: {
      userId: callerId,
      status: { in: ['PENDING', 'ACTIVE'] },
      OR: [{ invitedEmail: email }, { advisor: { email } }],
    },
  });
  if (existing) {
    throw new BadRequestError(
      existing.status === 'ACTIVE'
        ? `${email} already has access to your books.`
        : `You have already invited ${email}. Cancel that invitation first, or send it again.`,
    );
  }

  const token = crypto.randomBytes(32).toString('hex');

  const client = await runInTransaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        // No advisor yet: this is an offer, not a grant.
        advisorId: null,
        userId: callerId,
        initiatedBy: 'CLIENT',
        name,
        email,
        kind: 'INVITED',
        status: 'PENDING',
        invitedEmail: email,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        // Nothing is shared by default beyond what the client picks later; the
        // scope columns keep their permissive defaults so an accepted invite
        // behaves like the grants that came before it until narrowed.
      },
    });
    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: callerId, clientId: created.id, req },
      {
        action: 'CLIENT_INVITED',
        resourceType: 'Client',
        resourceId: created.id,
        summary: `You invited ${name} (${email}) to see your books.`,
      },
    );
    return created;
  });

  return { client, token };
}

/**
 * What an invitation says about itself before anyone signs in.
 *
 * Read privileged and answered narrowly: the token is the credential, and the
 * reply carries the inviter's name and nothing else of theirs. A professional
 * deciding whether to create an account deserves to know who is asking.
 */
export async function peekProfessionalInvitation(token: string) {
  const client = await runAsSystem(() =>
    prisma.client.findUnique({
      where: { inviteToken: token },
      include: { clientUser: { select: { name: true, email: true } } },
    }),
  );
  if (!client || client.initiatedBy !== 'CLIENT') {
    throw new NotFoundError('Invitation not found.');
  }
  if (client.acceptedAt) throw new BadRequestError('That invitation has already been used.');
  if (client.status === 'REVOKED') throw new BadRequestError('That invitation was withdrawn.');
  if (!client.inviteExpiresAt || client.inviteExpiresAt < new Date()) {
    throw new BadRequestError('That invitation has expired. Ask them to send a new one.');
  }

  return {
    invitedBy: client.clientUser?.name || client.clientUser?.email || 'An EveryPaisa user',
    invitedEmail: client.invitedEmail,
    expiresAt: client.inviteExpiresAt,
  };
}

/**
 * Accept, becoming the professional on that grant.
 *
 * `runAsSystem` wraps `runInTransaction`, not the other way round, for the
 * reason spelled out on the CA-side accept: the transaction reads the ambient
 * identity once, before it opens. Privileged because the accepting user is
 * nobody on this row yet — `advisorId` is null and `userId` is the client, so
 * their own policies show them nothing. The token and the email match are the
 * authorisation, and both still run.
 */
export async function acceptProfessionalInvitation(
  callerId: string,
  callerEmail: string,
  token: string,
  req?: Request,
): Promise<Client> {
  return runAsSystem(() =>
    runInTransaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { inviteToken: token } });
      if (!client || client.initiatedBy !== 'CLIENT') {
        throw new NotFoundError('Invitation not found.');
      }
      if (client.acceptedAt) throw new BadRequestError('That invitation has already been used.');
      if (client.status === 'REVOKED') {
        throw new ForbiddenError('That invitation is no longer valid.');
      }
      if (!client.inviteExpiresAt || client.inviteExpiresAt < new Date()) {
        throw new BadRequestError('That invitation has expired. Ask them to send a new one.');
      }
      if ((client.invitedEmail ?? '').toLowerCase() !== callerEmail.toLowerCase()) {
        throw new ForbiddenError('That invitation was sent to a different email address.');
      }
      if (client.userId === callerId) {
        throw new BadRequestError('You cannot accept your own invitation.');
      }

      const updated = await tx.client.update({
        where: { id: client.id },
        data: {
          advisorId: callerId,
          status: 'ACTIVE',
          acceptedAt: new Date(),
          inviteToken: null,
        },
      });

      await recordCaAudit(
        tx,
        {
          actorUserId: callerId,
          subjectUserId: client.userId!,
          clientId: client.id,
          req,
        },
        {
          action: 'GRANT_ACCEPTED',
          resourceType: 'Client',
          resourceId: client.id,
          summary: 'Your professional accepted your invitation and can now see your books.',
        },
      );

      return updated;
    }),
  );
}

/** Withdraw an invitation that nobody has accepted. Client side only. */
export async function cancelProfessionalInvitation(
  callerId: string,
  clientId: string,
  req?: Request,
): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.userId !== callerId) {
    throw new ForbiddenError('That invitation is not yours.');
  }
  if (client.acceptedAt) {
    throw new BadRequestError('That invitation was accepted — withdraw the access instead.');
  }

  await runInTransaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: callerId, inviteToken: null },
    });
    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: callerId, clientId, req },
      {
        action: 'GRANT_REVOKED',
        resourceType: 'Client',
        resourceId: clientId,
        summary: `You cancelled the invitation to ${client.invitedEmail ?? client.name}.`,
      },
    );
  });
}

/**
 * Everything the account holder has open or granted, invitations included.
 *
 * `listMyProfessionals` answers "who can see my books" and deliberately says
 * nothing about invitations nobody has accepted; this answers the question the
 * Account Access page actually asks, which includes the ones still in flight.
 */
export async function listMyProfessionalGrants(callerId: string) {
  const rows = await prisma.client.findMany({
    where: { userId: callerId },
    include: { portfolioScopes: { select: { portfolioId: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const advisorIds = [...new Set(rows.map((r) => r.advisorId).filter((id): id is string => !!id))];
  const advisors = advisorIds.length
    ? await runAsSystem(() =>
        prisma.user.findMany({
          where: { id: { in: advisorIds } },
          select: { id: true, name: true, email: true },
        }),
      )
    : [];
  const byId = new Map(advisors.map((a) => [a.id, a]));

  return rows.map((r) => ({
    clientId: r.id,
    name: r.name,
    status: r.status,
    initiatedBy: r.initiatedBy,
    invitedEmail: r.invitedEmail,
    /** Null while an invitation is still open — nobody holds it yet. */
    advisor: r.advisorId ? (byId.get(r.advisorId) ?? null) : null,
    grantedAt: r.acceptedAt,
    revokedAt: r.revokedAt,
    inviteExpiresAt: r.inviteExpiresAt,
    accessFrom: r.accessFrom,
    accessUntil: r.accessUntil,
    scopeAllPortfolios: r.scopeAllPortfolios,
    scopeAllAssetClasses: r.scopeAllAssetClasses,
    scopeAllCategories: r.scopeAllCategories,
    portfolioCount: r.portfolioScopes.length,
    assetClassCount: r.visibleAssetClasses.length,
    categoryCount: r.visibleCategories.length,
    // One bit for the card; the manage panel asks for the four.
    canEdit: r.canEditBooks || r.canEditTransactions || r.canEditImports || r.canEditFmv,
    // Three states rather than a bit, because "some of it" is a real answer
    // and describing it as either end would misstate what was given.
    editMode: editModeOf(r),
  }));
}
