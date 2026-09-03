/**
 * Every RLS-protected table must be registered in USER_SCOPED_MODELS.
 *
 * A Postgres policy and an entry in USER_SCOPED_MODELS are two halves of one
 * mechanism. The policy filters on `app.current_user_id`; the Prisma hook is
 * what sets it. With a policy but no entry, the session variable is never
 * issued, the predicate evaluates against NULL, and the table reads as empty
 * while writes fail with 42501 — silently, and only once something actually
 * connects as a NOBYPASSRLS role.
 *
 * That is not hypothetical. It took out the PF tables, then Goal and
 * BankAccount (a paid feature returning nothing), then nineteen more. Each was
 * found by a feature breaking, not by a test. This closes that loop: the
 * database itself is asked which tables have policies, and the answer is
 * compared with the set the application maintains by hand.
 */

import { describe, it, expect } from 'vitest';
import { prisma, USER_SCOPED_MODELS } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * Tables with a policy that are deliberately NOT user-scoped in Prisma.
 * Anything added here needs a reason, because the default answer is "register
 * it" — an unexplained exemption is how this class of bug survives.
 */
const INTENTIONALLY_UNSCOPED = new Set<string>([
  // Reference/market data: shared by every user, no userId to scope by.
  // (none today — listed for the next person, who will need one.)
]);

/**
 * Tables that have a `userId` but deliberately carry NO policy.
 *
 * Both of these are read in flows where the caller has no identity yet: token
 * refresh and password reset happen before authentication, by definition. A
 * userId policy cannot apply when there is no current user — the hook would
 * issue no session variable, the predicate would evaluate against NULL, and
 * every lookup would return nothing, breaking sign-in refresh and password
 * reset. Their security model is the token itself: a 48-byte random secret,
 * single-use, with an expiry.
 *
 * Anything added here needs that standard of justification. "It was awkward"
 * is not one.
 */
const NO_POLICY_BY_DESIGN = new Set<string>(['RefreshToken', 'PasswordResetToken']);

describe('USER_SCOPED_MODELS covers every RLS-protected table', () => {
  it('has no table with a policy that Prisma does not scope', async () => {
    const rows = await runAsSystem(() =>
      prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
        `SELECT DISTINCT c.relname AS tablename
           FROM pg_class c
           JOIN pg_namespace ns ON ns.oid = c.relnamespace
          WHERE ns.nspname = 'public'
            AND c.relrowsecurity
          ORDER BY 1`,
      ),
    );

    const unregistered = rows
      .map((r) => r.tablename)
      .filter((t) => !USER_SCOPED_MODELS.has(t) && !INTENTIONALLY_UNSCOPED.has(t));

    expect(
      unregistered,
      `These tables have ROW LEVEL SECURITY enabled but are absent from ` +
        `USER_SCOPED_MODELS, so no session variable is ever set for them: ` +
        `every read returns zero rows and every write fails 42501. Either add ` +
        `them to USER_SCOPED_MODELS in src/lib/prisma.ts, or add them to ` +
        `INTENTIONALLY_UNSCOPED in this test with a reason.`,
    ).toEqual([]);
  }, 120_000);

  it('enforces FORCE ROW LEVEL SECURITY on every protected table', async () => {
    // Without FORCE, Postgres exempts the table owner. That is not academic:
    // this app connected as the owner until the runtime role was switched, so
    // FORCE is what makes the policy bite for anything that still does.
    const rows = await runAsSystem(() =>
      prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
        `SELECT c.relname AS tablename
           FROM pg_class c
           JOIN pg_namespace ns ON ns.oid = c.relnamespace
          WHERE ns.nspname = 'public'
            AND c.relrowsecurity
            AND NOT c.relforcerowsecurity
          ORDER BY 1`,
      ),
    );

    expect(
      rows.map((r) => r.tablename),
      'RLS is enabled on these tables but not FORCEd, so the table owner ' +
        'bypasses the policy entirely.',
    ).toEqual([]);
  }, 120_000);

  it('gives every protected table an app_is_system() escape hatch', async () => {
    // Background jobs run under runAsSystem, which sets app.bypass_rls rather
    // than app.current_user_id. A policy without the branch filters them out
    // completely — which is how goal_owner blocked every job touching goals.
    const rows = await runAsSystem(() =>
      prisma.$queryRawUnsafe<Array<{ tablename: string; policyname: string }>>(
        `SELECT tablename, policyname
           FROM pg_policies
          WHERE schemaname = 'public'
            AND COALESCE(qual, '') NOT LIKE '%app_is_system%'
          ORDER BY 1, 2`,
      ),
    );

    expect(
      rows.map((r) => `${r.tablename}.${r.policyname}`),
      'These policies have no app_is_system() branch, so background jobs and ' +
        'fixture setup running under runAsSystem cannot see or write these rows.',
    ).toEqual([]);
  }, 120_000);

  it('has no user-owned table without a policy at all', async () => {
    // The gap this suite originally missed. The check above catches "has a
    // policy but is not registered"; it cannot catch "has a userId and no
    // policy", because such a table never appears in pg_policies. Fourteen
    // tables were in exactly that state — Loan, CreditCard, Income,
    // RefreshToken and others — protected by application where-clauses alone.
    const rows = await runAsSystem(() =>
      prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
        `SELECT c.relname AS tablename
           FROM pg_class c
           JOIN pg_namespace ns ON ns.oid = c.relnamespace
           JOIN pg_attribute a  ON a.attrelid = c.oid
          WHERE ns.nspname = 'public'
            AND c.relkind = 'r'
            AND a.attname = 'userId'
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND NOT c.relrowsecurity
          ORDER BY 1`,
      ),
    );

    const unprotected = rows
      .map((r) => r.tablename)
      .filter((t) => !NO_POLICY_BY_DESIGN.has(t));

    expect(
      unprotected,
      `These tables have a userId column but no row-level security at all, so ` +
        `tenant isolation rests entirely on the application remembering its ` +
        `where-clause. Add a policy (ENABLE + FORCE + app_is_system + WITH ` +
        `CHECK) and register the model in USER_SCOPED_MODELS, or add it to ` +
        `NO_POLICY_BY_DESIGN in this file with a reason.`,
    ).toEqual([]);
  }, 120_000);
});
