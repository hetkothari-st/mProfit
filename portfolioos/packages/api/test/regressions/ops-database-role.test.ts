import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ops scripts must not silently run as the database owner.
 *
 * Every script used to open with the same line:
 *
 *   new PrismaClient({ datasources: { db: { url: DIRECT_URL ?? DATABASE_URL } } })
 *
 * In production `DIRECT_URL` is the `postgres` owner — SUPERUSER, BYPASSRLS —
 * so a maintenance script ran with row-level security switched off for every
 * table, and nothing said so. Nobody decided that; it was a fallback nobody
 * read.
 *
 * It had a real cost. A read-only sizing check written against `DATABASE_URL`
 * reported zero `NetWorthSnapshot` rows in a window where a script running
 * under `DIRECT_URL` then modified 303 of them — and the smaller number
 * silently became a restore point that captured nothing.
 *
 * This is the check that stops it coming back.
 */

const API_ROOT = join(__dirname, '..', '..');
const SEARCH_ROOTS = ['scripts', join('src', 'scripts')];

/** `prisma migrate deploy` genuinely needs the owner; it runs from start.sh. */
const ALLOWED_FILES = new Set<string>([
  join('src', 'lib', 'opsDatabase.ts'),
  join('src', 'config', 'env.ts'),
]);

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

describe('ops scripts connect as the application role', () => {
  const files = SEARCH_ROOTS.flatMap((r) => walk(join(API_ROOT, r)));

  it('finds the ops scripts at all, so a passing run means something', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('has no DIRECT_URL-then-DATABASE_URL fallback anywhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(API_ROOT.length + 1);
      if (ALLOWED_FILES.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      // Both orderings, and the `||` spelling: the point is a silent
      // escalation to whichever role happens to be set, not one operator.
      if (
        /DIRECT_URL\s*(\?\?|\|\|)\s*process\.env\.DATABASE_URL/.test(src) ||
        /process\.env\.DIRECT_URL\s*(\?\?|\|\|)/.test(src)
      ) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These read DIRECT_URL with a fallback, which silently runs as the ` +
            `database owner with RLS bypassed:\n  ${offenders.join('\n  ')}\n` +
            `Use opsDatabaseUrl() from src/lib/opsDatabase.ts instead.`,
    ).toEqual([]);
  });

  /**
   * The second trap, which the first one hid.
   *
   * The RLS session variable is set by middleware on the SHARED client in
   * lib/prisma.ts. A client a script constructs for itself has none of that,
   * so `runAsUser`/`runAsSystem` wrap it and change nothing. Under the old
   * owner-role default that never showed: the owner bypasses RLS, so a
   * context-less client worked fine. Remove one bug and the other surfaces
   * as "new row violates row-level security policy".
   */
  it('does not construct its own PrismaClient for the app role', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(API_ROOT.length + 1);
      if (ALLOWED_FILES.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (!/new PrismaClient\(/.test(src)) continue;
      // Constructing one is only defensible behind --as-superuser, where
      // bypassing RLS is the whole point.
      if (!/--as-superuser/.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These build their own PrismaClient, which has no RLS context plumbing: ${offenders.join(', ')}. Use opsPrisma() from src/lib/opsDatabase.ts.`,
    ).toEqual([]);
  });

  it('reaches for DIRECT_URL only behind --as-superuser', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(API_ROOT.length + 1);
      if (ALLOWED_FILES.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (/process\.env\.DIRECT_URL/.test(src) && !/--as-superuser/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('opsDatabaseUrl', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://app_role:pw@db.internal:5432/appdb';
    process.env.DIRECT_URL = 'postgresql://postgres:pw@db.internal:5432/appdb';
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it('uses the application role by default', async () => {
    const { opsDatabaseUrl } = await import('../../src/lib/opsDatabase.js');
    const c = opsDatabaseUrl([]);
    expect(c.superuser).toBe(false);
    expect(c.role).toBe('app_role');
    expect(c.url).toBe(process.env.DATABASE_URL);
  });

  it('uses DIRECT_URL only when asked, and names the role it is using', async () => {
    const { opsDatabaseUrl } = await import('../../src/lib/opsDatabase.js');
    const { logger } = await import('../../src/lib/logger.js');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    const c = opsDatabaseUrl(['node', 'script.ts', '--as-superuser']);
    expect(c.superuser).toBe(true);
    expect(c.role).toBe('postgres');
    expect(warn).toHaveBeenCalledTimes(1);
    const [, message] = warn.mock.calls[0]!;
    expect(String(message)).toMatch(/ROW-LEVEL SECURITY BYPASSED/);
    expect(String(message)).toMatch(/postgres/);
  });

  // The original bug in miniature: ask for one role, silently get another.
  it('refuses to fall back to the app role when --as-superuser is passed', async () => {
    const { opsDatabaseUrl } = await import('../../src/lib/opsDatabase.js');
    delete process.env.DIRECT_URL;
    expect(() => opsDatabaseUrl(['--as-superuser'])).toThrow(/Refusing to fall back/);
  });

  it('never returns a password in the description', async () => {
    const { opsDatabaseUrl } = await import('../../src/lib/opsDatabase.js');
    const c = opsDatabaseUrl([]);
    expect(JSON.stringify({ role: c.role, host: c.host, database: c.database })).not.toMatch(/pw/);
  });
});
