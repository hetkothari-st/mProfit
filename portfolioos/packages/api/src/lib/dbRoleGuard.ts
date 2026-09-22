import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { runAsSystem } from './requestContext.js';

/**
 * Row-level security is the backstop for every tenant boundary in this app —
 * users, family views and CA grants all end in a policy. A superuser or
 * BYPASSRLS role skips every one of those policies without an error, so a
 * `DATABASE_URL` that points at the owner role turns isolation off silently
 * and the app keeps working as if nothing were wrong.
 *
 * This asks Postgres which role we actually connected as, once, at boot.
 */
export interface DbRoleFacts {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
}

export type DbRoleVerdict =
  | { ok: true }
  | { ok: false; fatal: boolean; message: string };

/** Pure: decide what to do about the connected role. */
export function evaluateDbRole(facts: DbRoleFacts, nodeEnv: string): DbRoleVerdict {
  if (!facts.superuser && !facts.bypassRls) return { ok: true };
  const why = facts.superuser ? 'is a superuser' : 'has BYPASSRLS';
  const message =
    `DATABASE_URL connects as "${facts.role}", which ${why}: every row-level ` +
    'security policy is skipped, so users could read each other\'s data. ' +
    'Connect as the NOBYPASSRLS runtime role (portfolioos_app); migrations use DIRECT_URL.';
  return { ok: false, fatal: nodeEnv === 'production', message };
}

export async function readDbRoleFacts(): Promise<DbRoleFacts> {
  const rows = await runAsSystem(() =>
    prisma.$queryRaw<Array<{ role: string; superuser: boolean; bypass_rls: boolean }>>(Prisma.sql`
      SELECT current_user AS role, rolsuper AS superuser, rolbypassrls AS bypass_rls
      FROM pg_roles WHERE rolname = current_user
    `),
  );
  const row = rows[0];
  if (!row) throw new Error('Could not read the connected database role from pg_roles.');
  return { role: row.role, superuser: row.superuser, bypassRls: row.bypass_rls };
}
