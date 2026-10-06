/**
 * Managed family profiles.
 *
 * A grandparent without an email still has FDs, a pension and an LIC policy,
 * and somebody in the family keeps them. A managed profile is a real `User`
 * row that owns that data, so every existing page — stocks, FDs, insurance,
 * reports, tax — works for them unchanged. What makes it safe:
 *
 *  - It can never sign in. It is `isShadowClient`, which every auth entry
 *    point refuses (password, refresh, Google, password reset), and its email
 *    is an unroutable placeholder under the reserved `.invalid` TLD.
 *  - Exactly one person may act for it: its manager (`managedById`), and only
 *    while both are ACTIVE members of the same family. Revoking either
 *    membership ends it on the very next request; nothing is cached.
 *  - Acting is explicit. The client sends `X-Act-As: <profileId>` and
 *    `authenticate` re-checks the above on every request, then binds the
 *    request — and so Postgres RLS — to the profile.
 *  - Account-level routes are refused while acting: nobody can change the
 *    profile's credentials, billing, family or professional access by
 *    riding the manager's session.
 */

import crypto from 'node:crypto';
import type { PlanTier, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { ForbiddenError } from '../../lib/errors.js';

/** The header the web client sets while the manager is acting for a profile. */
export const ACT_AS_HEADER = 'x-act-as';

/**
 * Routes that act on an ACCOUNT rather than on its data, refused while acting
 * for a profile. The client never sends the header to these; refusing here
 * is what makes that a rule rather than a habit.
 */
const ACCOUNT_ROUTE_PREFIXES = [
  '/api/auth',
  '/api/billing',
  '/api/families',
  '/api/ca',
  '/api/me',
  '/api/professional-invitations',
  '/api/managed-profiles',
  '/api/gmail',
  '/api/mailboxes',
];

export function isAccountRoute(path: string): boolean {
  return ACCOUNT_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

/** An address that can never receive mail, for a profile that has none. */
export function managedPlaceholderEmail(): string {
  return `managed-${crypto.randomBytes(12).toString('hex')}@managed.everypaisa.invalid`;
}

export interface ActingIdentity {
  id: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
}

/**
 * Resolve `X-Act-As` for a signed-in manager, or refuse.
 *
 * Privileged read (FamilyMember is RLS-protected and the manager may not be
 * an OWNER), bounded by construction: it matches only a profile whose
 * `managedById` IS the caller, and returns nothing else. Every condition is
 * in the one query, so there is no window between checking and using.
 */
export async function resolveActAs(
  manager: { id: string; plan: PlanTier },
  profileId: string,
): Promise<ActingIdentity> {
  // Asked from the FamilyMember side on purpose. `User` is not an RLS-scoped
  // model, so a `prisma.user` query never gets the system bypass, and its
  // nested membership filter ran against FamilyMember's policy with no
  // identity at all — matching nothing, for every manager.
  const membership = await runAsSystem(() =>
    prisma.familyMember.findFirst({
      where: {
        userId: profileId,
        status: 'ACTIVE',
        user: {
          managedById: manager.id,
          isShadowClient: true,
          isActive: true,
          deletionScheduledFor: null,
        },
        family: { members: { some: { userId: manager.id, status: 'ACTIVE' } } },
      },
      select: { user: { select: { id: true, email: true } } },
    }),
  );
  const profile = membership?.user;
  if (!profile) {
    // One message for every reason: not managed, not yours, membership ended.
    throw new ForbiddenError('You cannot act for this profile.');
  }
  return {
    id: profile.id,
    email: profile.email,
    // Never anything the profile could not be on its own; never ADMIN.
    role: 'INVESTOR',
    // Features follow the person paying for them. The profile itself is on
    // FREE, and gating grandpa's pages on that would lock the manager out of
    // what they already have for their own books.
    plan: manager.plan,
  };
}

/** Profiles the caller manages, across every family they are active in. */
export async function listProfilesIManage(callerId: string) {
  // From the FamilyMember side for the same reason as `resolveActAs`.
  const rows = await runAsSystem(() =>
    prisma.familyMember.findMany({
      where: {
        status: 'ACTIVE',
        user: { managedById: callerId, isShadowClient: true, isActive: true },
        family: { members: { some: { userId: callerId, status: 'ACTIVE' } } },
      },
      select: {
        relation: true,
        user: { select: { id: true, name: true } },
        family: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: 'asc' } },
    }),
  );
  // A profile belongs to one family today; keep the first row per profile
  // so a second family can never list it twice.
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.user.id) ? false : (seen.add(r.user.id), true)))
    .map((r) => ({
      id: r.user.id,
      name: r.user.name,
      relation: r.relation,
      familyId: r.family.id,
      familyName: r.family.name,
    }));
}

/**
 * Record that the manager opened a profile. Written once per switch rather
 * than per request: "who looked after grandpa's books, and when" is the
 * question an audit has to answer, and a row per API call would bury it.
 */
export async function recordEnteredProfile(
  managerId: string,
  profileId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<void> {
  await runAsSystem(() =>
    prisma.auditLog.create({
      data: {
        userId: managerId,
        action: 'managed_profile_enter',
        resource: `User:${profileId}`,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    }),
  );
}
