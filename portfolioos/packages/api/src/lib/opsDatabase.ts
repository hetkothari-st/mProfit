/**
 * Which database role an ops script connects as.
 *
 * ── The bug this exists to stop ──────────────────────────────────
 * Every script here used to open with the same line:
 *
 *   new PrismaClient({ datasources: { db: { url: DIRECT_URL ?? DATABASE_URL } } })
 *
 * In production `DIRECT_URL` is the `postgres` owner — SUPERUSER, BYPASSRLS.
 * So a maintenance script silently ran with row-level security switched off
 * for every table, and nothing said so. It was not a decision anybody made;
 * it was a fallback nobody read.
 *
 * The cost is not hypothetical. A read-only sizing check written against
 * `DATABASE_URL` reported zero `NetWorthSnapshot` rows in a window where a
 * script running under `DIRECT_URL` then modified 303 of them. Same window,
 * same table, two different roles, two different answers — and the smaller
 * one silently became a restore point that captured nothing.
 *
 * ── The rule ─────────────────────────────────────────────────────
 * Ops scripts connect as the APP ROLE (`DATABASE_URL`), under RLS, like the
 * application. A script that needs to cross tenants says so with
 * `--as-superuser`, and gets a loud warning naming the role it is using.
 *
 * A script reading or writing user-scoped rows wraps them in `runAsSystem`
 * or `runAsUser` — explicitly, so the reader can see whose data is in play.
 *
 * `prisma migrate deploy` keeps `DIRECT_URL`: DDL genuinely needs the owner,
 * and it runs from `start.sh`, not from here.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { prisma as appPrisma } from './prisma.js';

export interface OpsDatabaseChoice {
  url: string;
  /** True when `--as-superuser` was passed AND `DIRECT_URL` is set. */
  superuser: boolean;
  /** For the log line and the report: the role, never the password. */
  role: string;
  host: string;
  database: string;
}

/** Username, host and database from a connection string. Never the password. */
function describe(url: string): { role: string; host: string; database: string } {
  try {
    const u = new URL(url);
    return {
      role: decodeURIComponent(u.username) || 'unknown',
      host: u.hostname || 'unknown',
      database: u.pathname.replace(/^\//, '') || 'unknown',
    };
  } catch {
    return { role: 'unparseable', host: 'unparseable', database: 'unparseable' };
  }
}

/**
 * The URL an ops script should use.
 *
 * `argv` is passed in rather than read from `process.argv` so this is
 * testable without a subprocess.
 */
export function opsDatabaseUrl(argv: readonly string[] = process.argv): OpsDatabaseChoice {
  const wantsSuperuser = argv.includes('--as-superuser');
  const appUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (!wantsSuperuser) {
    if (!appUrl) {
      throw new Error(
        'DATABASE_URL is not set. Ops scripts connect as the application role; ' +
          'pass --as-superuser only when the script genuinely needs to cross tenants.',
      );
    }
    const d = describe(appUrl);
    logger.info({ ...d, superuser: false }, '[ops] connecting as the application role');
    return { url: appUrl, superuser: false, ...d };
  }

  if (!directUrl) {
    throw new Error(
      '--as-superuser was passed but DIRECT_URL is not set. Refusing to fall back ' +
        'to the application role: a script that asked for superuser and quietly got ' +
        'something else is how the original bug worked.',
    );
  }
  const d = describe(directUrl);
  // Loud on purpose. RLS is the only thing standing between a maintenance
  // script and every tenant's data, and turning it off should never be a
  // line nobody reads.
  logger.warn(
    { ...d, superuser: true },
    `[ops] ⚠ RUNNING AS "${d.role}" WITH ROW-LEVEL SECURITY BYPASSED — every tenant's rows are visible and writable`,
  );
  return { url: directUrl, superuser: true, ...d };
}

/**
 * The Prisma client an ops script should use.
 *
 * ── Why not `new PrismaClient({ url })` ──────────────────────────
 * Because that is a second trap sitting behind the first one. The RLS session
 * variable (`app.current_user_id`, and the system flag) is set by middleware
 * on the SHARED client in `lib/prisma.ts`. A client a script constructs for
 * itself has none of that, so `runAsUser` and `runAsSystem` wrap it and
 * change nothing — the session has no context, every policy matches nothing,
 * and the script fails with "new row violates row-level security policy" or,
 * worse, silently reads zero rows.
 *
 * Under the old `DIRECT_URL ?? DATABASE_URL` default that never showed up:
 * the owner role bypasses RLS, so a client with no context worked fine. The
 * two bugs concealed each other.
 *
 * So: the app role means the app's own client, context plumbing included.
 * `--as-superuser` gets a bare client, because bypassing RLS is the point.
 */
export function opsPrisma(argv: readonly string[] = process.argv): {
  prisma: PrismaClient;
  choice: OpsDatabaseChoice;
  disconnect: () => Promise<void>;
} {
  const choice = opsDatabaseUrl(argv);
  if (!choice.superuser) {
    return {
      prisma: appPrisma as unknown as PrismaClient,
      choice,
      disconnect: () => appPrisma.$disconnect(),
    };
  }
  const client = new PrismaClient({ datasources: { db: { url: choice.url } } });
  return { prisma: client, choice, disconnect: () => client.$disconnect() };
}
