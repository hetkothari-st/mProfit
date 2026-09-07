import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  BENCHMARK_INDEX_SEED,
  assertTotalReturnIndex,
} from '../../src/priceFeeds/benchmarkIndexSeed.js';

/**
 * `docs/mf-analytics/00-README.md` invariant 9 and `06-QUALITY-COMPLIANCE.md §1`.
 *
 * A benchmark must be a **Total Return Index**. A price-return index omits
 * reinvested dividends, while a fund's NAV is total-return by construction, so
 * every fund measured against a PRI shows roughly 1.2-1.5%/yr of alpha that
 * does not exist. That error is invisible from the outside: it inflates
 * information ratio, up/down capture, M2, batting average and therefore the
 * star rating, all consistently and all in the same direction. Nobody looking
 * at the output could tell. This is the same reason SEBI mandated the TRI
 * switch for scheme benchmarking in Feb 2018.
 *
 * The protection is three layers deep, and this file exists because the
 * strongest of them is the one Prisma cannot see:
 *
 *   1. `assertTotalReturnIndex()` in code, called before any fetch.
 *   2. A `WHERE "isTotalReturn"` guard on the seed INSERT.
 *   3. A Postgres CHECK constraint — the only layer an ops script, a psql
 *      session or a future migration cannot walk past.
 *
 * Layer 3 lives ONLY in migration SQL: `schema.prisma` has no syntax for a
 * CHECK constraint, so `prisma db push` against a scratch database, or a
 * `migrate dev` that regenerates from the datamodel, will not recreate it and
 * will report it as drift to be "cleaned up". Losing it would be silent. This
 * test is what makes that loud.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = resolve(here, '../../prisma/migrations');

describe('benchmark indices are Total Return only', () => {
  it('every seeded index declares isTotalReturn', () => {
    // The seed list is the whitelist `01 §3` refers to when it says to reject
    // any index whose name lacks "TRI" unless explicitly listed. If an entry
    // here is false, the whitelist has been used to smuggle a PRI in.
    for (const entry of BENCHMARK_INDEX_SEED) {
      expect(
        entry.isTotalReturn,
        `${entry.code} is seeded as a benchmark but is not a total-return index`,
      ).toBe(true);
    }
  });

  it('assertTotalReturnIndex throws on a price-return entry', () => {
    expect(() =>
      // Only the two fields the guard actually reads. It takes a Pick<>, so
      // passing name/provider is an excess-property error that vitest never
      // surfaces (it transpiles without typechecking) but tsc does.
      assertTotalReturnIndex({
        code: 'NIFTY50_PRI',
        isTotalReturn: false,
      }),
    ).toThrow();
  });

  it('the CHECK constraint is declared in a migration', () => {
    // Source-level, so this half of the test runs without a database and
    // fails in CI even on a checkout that has never been migrated.
    const sql = readdirSync(migrationsDir)
      .filter((d) => !d.startsWith('.'))
      .map((d) => {
        try {
          return readFileSync(resolve(migrationsDir, d, 'migration.sql'), 'utf8');
        } catch {
          // A migration directory without a migration.sql is not this test's
          // concern; skip it rather than failing for an unrelated reason.
          return '';
        }
      })
      .join('\n');

    expect(
      /ADD CONSTRAINT\s+"?BenchmarkIndex_isTotalReturn_check"?/i.test(sql),
      'No migration adds the BenchmarkIndex TRI CHECK constraint. If it was ' +
        'removed as Prisma "drift", restore it — schema.prisma cannot express ' +
        'a CHECK, so the migration is its only home.',
    ).toBe(true);
  });

  it('the CHECK constraint is live in the database and rejects a PRI insert', async () => {
    await runAsSystem(async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = '"BenchmarkIndex"'::regclass AND contype = 'c'`,
      );
      expect(
        rows.some((r) => /"isTotalReturn"\s*=\s*true/i.test(r.def)),
        'BenchmarkIndex has no TRI CHECK constraint in this database',
      ).toBe(true);

      // Prove it actually bites, rather than trusting the catalogue entry.
      // Postgres raises 23514 (check_violation).
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "BenchmarkIndex" ("code","name","provider","isTotalReturn")
           VALUES ('TEST_PRI_REJECT','Price return probe','NSE',false)`,
        ),
      ).rejects.toThrow();

      const leaked = await prisma.benchmarkIndex.count({
        where: { code: 'TEST_PRI_REJECT' },
      });
      expect(leaked, 'the rejected PRI row was written anyway').toBe(0);
    });
  });

  it('no stored benchmark is a price-return index', async () => {
    await runAsSystem(async () => {
      const offenders = await prisma.benchmarkIndex.findMany({
        where: { isTotalReturn: false },
        select: { code: true },
      });
      expect(
        offenders.map((o) => o.code),
        'price-return indices are present in BenchmarkIndex',
      ).toEqual([]);
    });
  });
});
