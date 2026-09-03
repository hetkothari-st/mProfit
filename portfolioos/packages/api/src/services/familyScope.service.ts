import type { AssetClass, FamilyRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ForbiddenError } from '../lib/errors.js';
import { runAsUser, runAsSystem } from '../lib/requestContext.js';

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
 * Rules (revised post-feedback):
 *   - Personal view (no familyId) → caller sees own data only.
 *   - Family view (familyId set)  → the "family scope" is the UNION of
 *     every active member's personal data + every family-shared entity.
 *       - OWNER      → sees the whole union; no visibility filter.
 *       - CONTRIBUTOR → sees the whole union filtered by their
 *                       `visibleAssetClasses` / `visibleCategories`
 *                       (empty = no restriction = allow all). Restricted
 *                       classes render blank on the member's screens.
 *                       Can add own transactions; can write to family
 *                       portfolios; cannot mutate peer personal data.
 *       - VIEWER     → same visibility as CONTRIBUTOR but read-only.
 *
 * The earlier "Rule A" (peers never see each other's personal data) was
 * reversed after real-world testing showed family members expect to see
 * the household's whole picture. Restrictions are now a filter on the
 * aggregated family view, not a firewall against peer personal data.
 * Personal-view semantics unchanged — a solo user's personal login
 * still shows only their own data.
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
   * `callerId`. Includes every ACTIVE member of the family in view, for
   * EVERY role — a family view is the union of the household's data. What
   * a non-OWNER may actually see of that union is capped by
   * `allowedAssetClasses` / `allowedCategories`, which callers MUST apply;
   * this list alone is not an authorisation decision.
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

  // Family view — every active member of the family is readable to every
  // other active member, and what they may actually SEE of that union is
  // decided by allowedAssetClasses / allowedCategories below.
  //
  // This membership lookup runs privileged, and deliberately so. It is an
  // AUTHORISATION step, not a data read: RLS on FamilyMember only lets you
  // see your own row unless you are an ACTIVE OWNER, so an unprivileged read
  // here would return `[self]` for every CONTRIBUTOR and VIEWER and silently
  // collapse their family view to their own data — the caps would never even
  // be consulted. This mirrors app_is_active_family_owner(), the SECURITY
  // DEFINER function the RLS policy itself uses for exactly this reason.
  //
  // It is safe because it is tightly bounded: the caller has already been
  // proven an ACTIVE member of this family immediately above; the query is
  // pinned to that one familyId; and it selects nothing but userId — no
  // names, no emails, no financial data. Widening this select, or reaching it
  // before the membership check, would turn an authorisation lookup into a
  // data leak.
  const siblings = await runAsSystem(() =>
    prisma.familyMember.findMany({
      where: { familyId: family, status: 'ACTIVE' },
      select: { userId: true },
    }),
  );
  const readableUserIds = dedupe([callerId, ...siblings.map((s) => s.userId)]);

  if (role === 'OWNER') {
    return {
      callerId,
      familyId: family,
      role,
      readableUserIds,
      // Writes remain limited to caller's own userId — an OWNER cannot
      // silently mutate another member's personal portfolios/holdings.
      // Family-shared portfolios are written via `writableFamilyIds`.
      writableUserIds: [callerId],
      readableFamilyIds: [family],
      writableFamilyIds: [family],
      allowedAssetClasses: null,
      allowedCategories: null,
    };
  }

  const knownCats = filterKnownCategories(membership.visibleCategories);
  return {
    callerId,
    familyId: family,
    role,
    readableUserIds,
    writableUserIds: [callerId],
    readableFamilyIds: [family],
    writableFamilyIds: role === 'CONTRIBUTOR' ? [family] : [],
    // An empty list is DENY-ALL, not "unrestricted" — see the contract on
    // allowedAssetClasses above, and the schema comment on
    // FamilyMember.visibleAssetClasses. Only `null` means unrestricted, and
    // only an OWNER gets null. Mapping empty to null inverted the default:
    // the column is `@default([])`, so every member invited without someone
    // explicitly ticking boxes could see the whole family's finances.
    allowedAssetClasses: membership.visibleAssetClasses,
    allowedCategories: knownCats,
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
