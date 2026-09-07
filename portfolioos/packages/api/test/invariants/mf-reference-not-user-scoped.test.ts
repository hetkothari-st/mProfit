/**
 * MF analytics reference data must never be user-scoped.
 *
 * `docs/mf-analytics/00-README.md` invariant 1 and `01-DATA-FOUNDATION.md §2`:
 * scheme metadata, TER/AUM/manager history, portfolio disclosures, benchmark
 * TRI series, the risk-free curve, the AMFI market-cap list and every computed
 * metric / peer rank / score are shared market data. They are in the same class
 * as StockMaster, MFNav and FXRate — no `userId`, no RLS policy, no entry in
 * USER_SCOPED_MODELS. A scheme's Sharpe ratio is the same number for everyone
 * who holds the fund.
 *
 * This test exists because the failure mode runs in an unusual direction.
 * CONTEXT.md §5 records the same defect over and over — a policy on a table with
 * no matching entry in USER_SCOPED_MODELS, so no session variable is ever
 * issued, so the table reads as empty and writes fail with 42501. It has taken
 * out the PF tables, then Goal and BankAccount, then nineteen more. The natural
 * response to that history is a sweep: find every table that looks unprotected
 * and protect it.
 *
 * Applied here, that sweep would break the feature. Adding these tables to
 * USER_SCOPED_MODELS makes the hook issue `app.current_user_id` for market data;
 * the follow-up "we should add the policies too" then returns zero rows of fund
 * analytics to every user, for tables that have nothing to isolate. So the
 * assertion is deliberately the mirror image of `user-scoped-coverage.test.ts`:
 * these names must be ABSENT from the Set, and no migration may enable RLS on
 * them.
 *
 * Both checks are source-level on purpose — the Set is read from the module and
 * the migrations are read from disk, so this runs without a database and gives
 * the same answer in CI as it does locally.
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
 * The reference tables. Prisma model name === Postgres table name throughout
 * this schema (no `@@map`), so one list serves both halves of the test.
 *
 * The four without an `Mf` prefix are here explicitly because the prefix-based
 * completeness check below cannot find them: BenchmarkIndex,
 * BenchmarkIndexPrice, RiskFreeRate and AmfiMarketCapList are equally shared
 * market data and equally must not acquire a policy.
 */
const MF_REFERENCE_MODELS = [
  'MfSchemeMeta',
  'MfSchemeTer',
  'MfSchemeAum',
  'MfSchemeManager',
  'MfPortfolioSnapshot',
  'MfPortfolioHolding',
  'MfSchemeMetrics',
  'MfPeerRank',
  'MfSchemeScore',
  'MfSchemeQualitativeFact',
  'BenchmarkIndex',
  'BenchmarkIndexPrice',
  'RiskFreeRate',
  'AmfiMarketCapList',
] as const;

/**
 * `Mf*` models that ARE user-scoped, and therefore need both a policy and an
 * entry in USER_SCOPED_MODELS — the opposite obligation from everything above.
 *
 * `docs/mf-analytics/05-FINDINGS-ENGINE.md` §1: one user's analysis of one
 * user's holdings — which of their funds were flagged, why, and what the engine
 * concluded. They landed with 20260904140000_mf_analytics_user_scoped, which
 * carries both halves, and are asserted positively by
 * `mf-user-scoped-coverage.test.ts`.
 *
 * Listing a model here is a claim that it carries user data — anything else
 * added to it is a bug, not a shortcut past a failing test.
 */
const MF_USER_SCOPED_MODELS = new Set<string>([
  'MfAnalysisRun',
  'MfFinding',
  'MfFundVerdict',
]);

/** Strip `--` line comments so prose about RLS is not mistaken for RLS SQL. */
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

describe('MF analytics reference data is not user-scoped', () => {
  it('keeps every reference model out of USER_SCOPED_MODELS', () => {
    const wronglyScoped = MF_REFERENCE_MODELS.filter((m) => USER_SCOPED_MODELS.has(m));

    expect(
      wronglyScoped,
      `These are shared market reference tables with no userId column, but they ` +
        `have been added to USER_SCOPED_MODELS in src/lib/prisma.ts. The hook ` +
        `would then issue app.current_user_id for market data, and the matching ` +
        `"add the policy too" would return zero rows of fund analytics to every ` +
        `user. Remove them. If a genuinely user-owned MF model is being added ` +
        `(MfAnalysisRun, MfFinding, MfFundVerdict), list it in ` +
        `MF_USER_SCOPED_MODELS in this file instead.`,
    ).toEqual([]);
  });

  it('has no migration enabling row-level security on a reference table', () => {
    const offenders: string[] = [];

    for (const { name, sql } of readAllMigrationSql()) {
      for (const model of MF_REFERENCE_MODELS) {
        // Both halves of the mistake: turning RLS on, and writing a policy.
        // Either alone is enough to make the table read as empty under the
        // NOBYPASSRLS runtime role.
        const enable = new RegExp(
          `ALTER\\s+TABLE\\s+"?${model}"?[\\s\\S]{0,40}?ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        );
        const policy = new RegExp(`CREATE\\s+POLICY[\\s\\S]{0,120}?ON\\s+"?${model}"?`, 'i');

        if (enable.test(sql)) offenders.push(`${name}: ENABLE/FORCE RLS on "${model}"`);
        if (policy.test(sql)) offenders.push(`${name}: CREATE POLICY on "${model}"`);
      }
    }

    expect(
      offenders,
      `Row-level security has been enabled on shared market reference tables. ` +
        `These have no userId to scope by, so the policy predicate can only ` +
        `evaluate against NULL: every user would see an empty fund-analytics ` +
        `layer and every job write would fail with 42501. Drop the policy ` +
        `rather than registering the model.`,
    ).toEqual([]);
  });

  it('classifies every Mf* model in the schema as reference or user-scoped', () => {
    // The guard that keeps this test honest as the feature grows. Without it,
    // a new `MfSomethingElse` model added in a later task would simply not be
    // covered by either check, and the invariant would quietly stop applying to
    // the newest tables — which is exactly how the USER_SCOPED_MODELS gaps in
    // CONTEXT.md §5 accumulated.
    const schema = readFileSync(schemaPath, 'utf8');
    const declared = [...schema.matchAll(/^model\s+(Mf[A-Za-z0-9_]*)\s*\{/gm)].map((m) => m[1]);

    const reference = new Set<string>(MF_REFERENCE_MODELS);
    const unclassified = declared.filter(
      (m) => !reference.has(m) && !MF_USER_SCOPED_MODELS.has(m),
    );

    expect(
      unclassified,
      `These Mf* models exist in schema.prisma but are in neither ` +
        `MF_REFERENCE_MODELS nor MF_USER_SCOPED_MODELS in this file, so nothing ` +
        `asserts which side of the RLS boundary they sit on. Add each to the ` +
        `list that matches: shared market data (no userId, no policy, absent ` +
        `from USER_SCOPED_MODELS) or user-owned analysis (userId, policy, AND ` +
        `an entry in USER_SCOPED_MODELS).`,
    ).toEqual([]);
  });

  it('finds every reference model in the schema', () => {
    // Cheap protection against a rename or a deletion silently emptying the
    // lists above: a test that asserts nothing is a test that always passes.
    const schema = readFileSync(schemaPath, 'utf8');
    const missing = MF_REFERENCE_MODELS.filter(
      (m) => !new RegExp(`^model\\s+${m}\\s*\\{`, 'm').test(schema),
    );

    expect(
      missing,
      'These models are asserted to be reference data but no longer exist in ' +
        'schema.prisma. Update MF_REFERENCE_MODELS to match the rename, or ' +
        'remove the entry if the model is gone.',
    ).toEqual([]);
  });
});
