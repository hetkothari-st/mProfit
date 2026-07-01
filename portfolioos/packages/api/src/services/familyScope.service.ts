import type { AssetClass, FamilyRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ForbiddenError } from '../lib/errors.js';
import { runAsUser } from '../lib/requestContext.js';

/**
 * Family / HOF access-control core.
 *
 * Single source of truth for "who can see what and write what" across
 * the app. Every service that does cross-user reads (dashboard,
 * analytics, portfolio list, non-AC entity lists) resolves an
 * `EffectiveScope` via `getEffectiveScope` and consults it — nothing
 * else in the codebase should know about `FamilyMember` rows directly.
 *
 * Why this abstraction: the current implementation (Phase 5c) uses
 * service-layer fan-out with `runAsUser` per member to satisfy the
 * existing single-user RLS policies. When we migrate to Approach 2
 * (RLS with a delegation function), only this module and the fan-out
 * loops in dashboard/analytics change — every downstream caller keeps
 * using the same `EffectiveScope` shape.
 *
 * Rules (locked in Phase 3):
 *   - OWNER      → sees every active member's personal assets + all
 *                  family-shared assets; no visibility filter applies.
 *                  Can write to any member's family portfolios.
 *   - CONTRIBUTOR → sees own personal + family-shared assets. Filtered
 *                  by their `visibleAssetClasses` / `visibleCategories`.
 *                  Can write to family portfolios of families they
 *                  belong to. Cannot see peers' personal data.
 *   - VIEWER     → same visibility as CONTRIBUTOR. Read-only on family
 *                  portfolios; can still write to own personal
 *                  portfolios.
 * Rule A: CONTRIBUTOR/VIEWER never see another member's personal data.
 * To grant cross-member visibility → promote to OWNER.
 */

/** Non-AssetClass category tokens used by `FamilyMember.visibleCategories`. */
export const NON_AC_CATEGORIES = [
  'VEHICLE',
  'RENTAL',
  'INSURANCE',
  'LOAN',
  'CREDIT_CARD',
  'BANK_ACCOUNT',
  'OWNED_PROPERTY',
  'GOAL',
] as const;
export type NonAcCategory = (typeof NON_AC_CATEGORIES)[number];

export interface EffectiveScope {
  /** The authenticated caller. */
  callerId: string;
  /**
   * The family context this scope was resolved for. `null` = personal
   * view (no family header sent by the client, or no membership).
   */
  familyId: string | null;
  /**
   * The caller's role within `familyId`. `null` when not in a family
   * view. `null` also for a solo user with no memberships.
   */
  role: FamilyRole | null;
  /**
   * User ids whose personal data the caller can READ. Always includes
   * `callerId`. Includes other members' ids only when the caller is an
   * OWNER of the family in view.
   */
  readableUserIds: string[];
  /**
   * User ids the caller can WRITE personal data for. In v1: only
   * `[callerId]` — writing on behalf of another user is not supported.
   */
  writableUserIds: string[];
  /**
   * Family ids whose family-shared portfolios/entities the caller can
   * READ. Empty for personal view. In family view, contains the single
   * `familyId` for CONTRIBUTOR/VIEWER, or all families the OWNER
   * belongs to when they're in "all families" mode.
   */
  readableFamilyIds: string[];
  /**
   * Family ids the caller can WRITE to. OWNER + CONTRIBUTOR can write
   * to family portfolios; VIEWER cannot.
   */
  writableFamilyIds: string[];
  /**
   * AssetClass allowlist for read filters. `null` = no restriction
   * (OWNER, or solo user). CONTRIBUTOR/VIEWER get their configured
   * `visibleAssetClasses`; an empty array means "deny-all", not "any".
   */
  allowedAssetClasses: AssetClass[] | null;
  /**
   * Non-AC entity category allowlist. `null` = no restriction. Empty
   * array = deny-all (member sees no vehicles/loans/etc).
   */
  allowedCategories: NonAcCategory[] | null;
}

export interface ResolveScopeOpts {
  /**
   * If set, resolve scope for the caller's view of this specific family.
   * The caller must have an ACTIVE FamilyMember row for the family; else
   * `ForbiddenError` is thrown.
   *
   * If omitted, returns a "personal" scope: only the caller's own data
   * is readable/writable, no family aggregation.
   */
  familyId?: string;
}

/**
 * Resolve the effective access-control scope for a request.
 *
 * Callers should pass `opts.familyId` when the client has selected a
 * family view via the "Viewing as" switcher (typically forwarded from
 * the `X-Viewing-As-Family` request header). Omit it for personal
 * views and for endpoints that never join across users.
 *
 * Throws `ForbiddenError` if `familyId` is set but the caller has no
 * ACTIVE membership on that family — a defense against clients
 * forging the switcher header.
 */
export async function getEffectiveScope(
  callerId: string,
  opts: ResolveScopeOpts = {},
): Promise<EffectiveScope> {
  if (!opts.familyId) {
    return personalScope(callerId);
  }

  const membership = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId: opts.familyId, userId: callerId } },
    select: {
      role: true,
      status: true,
      visibleAssetClasses: true,
      visibleCategories: true,
    },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError('You are not an active member of this family.');
  }

  const family = opts.familyId;
  const role = membership.role;

  if (role === 'OWNER') {
    // Owner sees every active member's personal + all family-shared
    // assets, unfiltered.
    const siblings = await prisma.familyMember.findMany({
      where: { familyId: family, status: 'ACTIVE' },
      select: { userId: true },
    });
    return {
      callerId,
      familyId: family,
      role,
      readableUserIds: dedupe([callerId, ...siblings.map((s) => s.userId)]),
      // v1: writes on behalf of another user's *personal* data are not
      // allowed — an OWNER can only write to family portfolios of that
      // family, not into another user's personal portfolios. Personal
      // stays personal even for OWNERs.
      writableUserIds: [callerId],
      readableFamilyIds: [family],
      writableFamilyIds: [family],
      allowedAssetClasses: null,
      allowedCategories: null,
    };
  }

  // CONTRIBUTOR / VIEWER: rule A — no peer personal data. Filter caps
  // apply to own personal + family-shared reads uniformly.
  return {
    callerId,
    familyId: family,
    role,
    readableUserIds: [callerId],
    writableUserIds: [callerId],
    readableFamilyIds: [family],
    writableFamilyIds: role === 'CONTRIBUTOR' ? [family] : [],
    allowedAssetClasses: membership.visibleAssetClasses,
    allowedCategories: filterKnownCategories(membership.visibleCategories),
  };
}

/** Scope with no family context — solo view over caller's own data. */
function personalScope(callerId: string): EffectiveScope {
  return {
    callerId,
    familyId: null,
    role: null,
    readableUserIds: [callerId],
    writableUserIds: [callerId],
    readableFamilyIds: [],
    writableFamilyIds: [],
    allowedAssetClasses: null,
    allowedCategories: null,
  };
}

/**
 * Where-clause builder for a `Portfolio` query that respects scope.
 * Personal portfolios owned by any readable user + family portfolios
 * of readable families. Callers merge this into their own where clauses.
 */
export function portfolioReadableWhere(scope: EffectiveScope) {
  return {
    OR: [
      { userId: { in: scope.readableUserIds }, familyId: null },
      ...(scope.readableFamilyIds.length > 0
        ? [{ familyId: { in: scope.readableFamilyIds } }]
        : []),
    ],
  };
}

/**
 * Where-clause builder for a model that joins through `Portfolio`
 * (Transaction, HoldingProjection, CashFlow, Alert, ...) — filter by
 * `portfolio: portfolioReadableWhere(scope)`.
 */
export function portfolioChildReadableWhere(scope: EffectiveScope) {
  return { portfolio: portfolioReadableWhere(scope) };
}

/**
 * Where-clause builder for a user-scoped non-portfolio model (Vehicle,
 * RentalProperty, InsurancePolicy, Loan, CreditCard, BankAccount,
 * OwnedProperty, Goal). Callers pass the category token so this helper
 * can short-circuit to a deny-all when the caller lacks visibility.
 */
export function userModelReadableWhere(
  scope: EffectiveScope,
  category: NonAcCategory,
): { userId: { in: string[] } } | { id: { in: string[] } } {
  if (
    scope.allowedCategories !== null &&
    !scope.allowedCategories.includes(category)
  ) {
    // Deny-all: match no rows. `id: { in: [] }` produces an empty set
    // without special-casing at the call site.
    return { id: { in: [] } };
  }
  return { userId: { in: scope.readableUserIds } };
}

/**
 * AssetClass filter fragment. Returns `{ assetClass: { in: [...] } }`
 * when the scope restricts asset classes; `{}` for OWNERs and solo
 * users. Callers spread this into the `where` of any query that has
 * an `assetClass` column (HoldingProjection, Transaction, ...).
 */
export function assetClassWhere(
  scope: EffectiveScope,
): { assetClass: { in: AssetClass[] } } | Record<string, never> {
  if (scope.allowedAssetClasses === null) return {};
  return { assetClass: { in: scope.allowedAssetClasses } };
}

/**
 * Guard: caller must be able to write to `familyId`. Use before any
 * mutation that lands on a family-shared portfolio.
 */
export function assertCanWriteToFamily(
  scope: EffectiveScope,
  familyId: string,
): void {
  if (!scope.writableFamilyIds.includes(familyId)) {
    throw new ForbiddenError('You do not have write access to this family.');
  }
}

/**
 * Guard: caller must be an OWNER of `familyId`. Use for membership
 * management endpoints (invite / remove / edit permissions).
 */
export async function assertOwnerOf(callerId: string, familyId: string): Promise<void> {
  const row = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId: callerId } },
    select: { role: true, status: true },
  });
  if (!row || row.status !== 'ACTIVE' || row.role !== 'OWNER') {
    throw new ForbiddenError('OWNER role required.');
  }
}

/**
 * Fan-out helper for reading a per-user list model (Vehicle, Loan,
 * InsurancePolicy, ...) across all readable users in scope.
 *
 * Short-circuits to `[]` when the caller lacks visibility on the given
 * category. Runs the caller's own fetch in-context and every other
 * member's under `runAsUser` so the existing single-owner RLS still
 * permits reads. Fetcher must be idempotent (called once per user id).
 */
export async function fanOutRead<T>(
  scope: EffectiveScope,
  category: NonAcCategory,
  fetcher: (userId: string) => Promise<T[]>,
): Promise<T[]> {
  if (
    scope.allowedCategories !== null &&
    !scope.allowedCategories.includes(category)
  ) {
    return [];
  }
  const results = await Promise.all(
    scope.readableUserIds.map((uid) =>
      uid === scope.callerId ? fetcher(uid) : runAsUser(uid, () => fetcher(uid)),
    ),
  );
  return results.flat();
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function filterKnownCategories(cats: string[]): NonAcCategory[] {
  return cats.filter((c): c is NonAcCategory =>
    (NON_AC_CATEGORIES as readonly string[]).includes(c),
  );
}
