/**
 * The MF analytics user-scoped trio must carry BOTH halves of the RLS
 * mechanism.
 *
 * `docs/mf-analytics/06-QUALITY-COMPLIANCE.md` §1: `MfAnalysisRun`,
 * `MfFinding` and `MfFundVerdict` are in `USER_SCOPED_MODELS` **and** have a
 * policy. CONTEXT.md §5 is blunt about why that is one obligation and not two:
 * the policy filters on `app.current_user_id`, and the Prisma `$allOperations`
 * hook is the only thing that ever sets it. A table with a policy but no entry
 * gets no session variable, so under the `NOBYPASSRLS` runtime role its
 * predicate evaluates against NULL — every read returns zero rows, every write
 * fails with `42501`. That has taken out the PF tables, then `Goal` and
 * `BankAccount`, then nineteen more, then twelve more, every time discovered by
 * a feature breaking rather than by a test.
 *
 * This is the mirror of `mf-reference-not-user-scoped.test.ts`, which asserts
 * the opposite obligation for the shared market-data tables next door. Between
 * them every `Mf*` model is pinned to one side of the boundary, and a model
 * cannot be moved across it by relaxing a test — each side fails the other.
 *
 * Both checks here are SOURCE-LEVEL on purpose: the Set is read from the module
 * and the migrations from disk, so the test needs no database and gives the same
 * answer in CI as locally. `user-scoped-coverage.test.ts` makes the
 * complementary assertion against a live database (enabled, FORCEd, has a
 * policy), which is what catches an unapplied migration.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const prismaDir = join(here, '..', '..', 'prisma');
const schemaPath = join(prismaDir, 'schema.prisma');
const migrationsDir = join(prismaDir, 'migrations');

/**
 * Prisma model name === Postgres table name throughout this schema (no
 * `@@map`), so one list serves the Set check and the SQL check.
 */
const MF_USER_SCOPED_MODELS = ['MfAnalysisRun', 'MfFinding', 'MfFundVerdict'] as const;

/** Strip `--` line comments so prose *about* RLS is not mistaken for RLS SQL. */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function readAllMigrationSql(): Array<{ name: string; sql: string }> {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ dir: e.name, file: join(migrationsDir, e.name, 'migration.sql') }))
    .filter((e) => existsSync(e.file))
    .map((e) => ({ name: e.dir, sql: stripSqlComments(readFileSync(e.file, 'utf8')) }));
}

describe('MF analytics user-scoped models carry both halves of RLS', () => {
  it('registers all three in USER_SCOPED_MODELS', () => {
    const missing = MF_USER_SCOPED_MODELS.filter((m) => !USER_SCOPED_MODELS.has(m));

    expect(
      missing,
      `These models hold one user's analysis of one user's holdings and have ` +
        `RLS policies in the database, but are absent from USER_SCOPED_MODELS ` +
        `in src/lib/prisma.ts. The hook therefore never issues ` +
        `set_config('app.current_user_id') for them: under the NOBYPASSRLS ` +
        `runtime role every read returns zero rows and every write fails 42501. ` +
        `Add them to the Set — do not drop the policy.`,
    ).toEqual([]);
  });

  it('gives all three a FORCEd policy with USING, WITH CHECK and app_is_system()', () => {
    const sql = readAllMigrationSql()
      .map((m) => m.sql)
      .join('\n');

    const problems: string[] = [];

    for (const model of MF_USER_SCOPED_MODELS) {
      const enable = new RegExp(
        `ALTER\\s+TABLE\\s+"${model}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      // FORCE is not optional. Postgres exempts the table owner from its own
      // policies by default, and Prisma connects as the owner in every
      // environment where DATABASE_URL has not been switched to the
      // portfolioos_app role — including production today (CONTEXT.md §13).
      // Without FORCE the policy is decoration.
      const force = new RegExp(
        `ALTER\\s+TABLE\\s+"${model}"\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      const policy = new RegExp(
        `CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+"${model}"([\\s\\S]{0,400}?);`,
        'i',
      );

      if (!enable.test(sql)) problems.push(`${model}: no ENABLE ROW LEVEL SECURITY`);
      if (!force.test(sql)) problems.push(`${model}: no FORCE ROW LEVEL SECURITY`);

      const match = policy.exec(sql);
      if (!match) {
        problems.push(`${model}: no CREATE POLICY`);
        continue;
      }
      const body = match[1];
      if (!/USING/i.test(body)) problems.push(`${model}: policy has no USING clause`);
      // Without WITH CHECK a policy guards reads only, so a user can still
      // INSERT or UPDATE a row claiming somebody else's id.
      if (!/WITH\s+CHECK/i.test(body)) {
        problems.push(`${model}: policy has no WITH CHECK clause (writes unguarded)`);
      }
      // runAsSystem sets app.bypass_rls, not app.current_user_id. A policy
      // without this branch filters every background job out completely —
      // which is how goal_owner once blocked every job touching goals.
      if (!/app_is_system\s*\(\s*\)/i.test(body)) {
        problems.push(`${model}: policy has no app_is_system() branch`);
      }
      // The predicate must compare the row's own userId. A join-up through
      // MfAnalysisRun would work but is why the column was denormalised in the
      // first place: findings are read in bulk on every page load.
      if (!/"userId"\s*=\s*app_current_user_id\s*\(\s*\)/i.test(body)) {
        problems.push(`${model}: policy does not compare "userId" to app_current_user_id()`);
      }
      if (!new RegExp(`GRANT[\\s\\S]{0,120}?ON\\s+"${model}"\\s+TO\\s+portfolioos_app`, 'i').test(sql)) {
        problems.push(`${model}: no GRANT to the portfolioos_app runtime role`);
      }
    }

    expect(
      problems,
      'The RLS SQL for the MF analytics user-scoped tables is incomplete. Each ' +
        'needs ENABLE + FORCE, a policy with USING *and* WITH CHECK, an ' +
        'app_is_system() branch for background jobs, and a GRANT to ' +
        'portfolioos_app. See 20260904140000_mf_analytics_user_scoped.',
    ).toEqual([]);
  });

  it('declares all three in schema.prisma with a userId column', () => {
    // Keeps the two lists above honest: a test asserting things about models
    // that no longer exist is a test that always passes.
    const schema = readFileSync(schemaPath, 'utf8');
    const problems: string[] = [];

    for (const model of MF_USER_SCOPED_MODELS) {
      const block = new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
      if (!block) {
        problems.push(`${model}: not declared in schema.prisma`);
        continue;
      }
      if (!/^\s*userId\s+String\b/m.test(block[1])) {
        problems.push(`${model}: has no userId column for the policy to compare against`);
      }
    }

    expect(problems).toEqual([]);
  });
});
