/**
 * Integration tests for the monthly MF metadata job (`07` Task 1.2).
 *
 * These hit a real database. Two things follow from that, and both are
 * deliberate:
 *
 *  1. **Every row this file creates is namespaced.** Scheme codes live in a
 *     reserved `9912xx` band, ISINs in `INF9912…`, AMCs are named
 *     `TEST-METADATA-n`. The development database is shared with other suites
 *     and the job under test reconciles a *whole table* — an unscoped run here
 *     would suspend every scheme another test owns. `runMfMetadataJob` takes a
 *     `scope` for exactly this reason and every call below passes one.
 *
 *  2. **The DLQ owner is passed explicitly.** `resolveOpsUserId` otherwise
 *     picks the oldest active ADMIN, which in a shared database is somebody
 *     else's fixture.
 *
 * The load-bearing assertion is the second-run no-op. It is checked on
 * `updatedAt`, not on a row count, because an unconditional upsert would keep
 * the count identical while rewriting all 12,000 rows — which is the actual
 * failure mode `01 §5` forbids.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  runMfMetadataJob,
  resetOpsUserCache,
  type MfMetadataJobResult,
} from '../../src/jobs/mfMetadataJob.js';
import { AMFI_SCHEME_MASTER_ADAPTER_ID } from '../../src/priceFeeds/amfiSchemeMaster.v1.js';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Reserved band. Nothing outside it is read or written by this file. */
const SCHEME_PREFIX = '9912';
const SCOPE = { schemeCode: { startsWith: SCHEME_PREFIX } } as const;

function fixture(name: string): Promise<string> {
  return readFile(resolve(here, '../fixtures/mf/amfi', name), 'utf8');
}

let opsUserId = '';
let run1Text = '';
let run2Text = '';

async function runJob(text: string, now: Date): Promise<MfMetadataJobResult> {
  return runMfMetadataJob({ text, now, opsUserId, scope: SCOPE });
}

async function schemesInBand() {
  return runAsSystem(() =>
    prisma.mfSchemeMeta.findMany({
      where: SCOPE,
      orderBy: { schemeCode: 'asc' },
    }),
  );
}

async function failuresForRun() {
  return runAsSystem(() =>
    prisma.ingestionFailure.findMany({
      where: { userId: opsUserId, sourceAdapter: AMFI_SCHEME_MASTER_ADAPTER_ID },
      orderBy: { sourceRef: 'asc' },
    }),
  );
}

beforeAll(async () => {
  run1Text = await fixture('job-metadata-run1.txt');
  run2Text = await fixture('job-metadata-run2-vanished.txt');

  await runAsSystem(async () => {
    // Leftovers from an aborted previous run of this file. Scoped to the
    // reserved band — never an unqualified deleteMany.
    await prisma.mfSchemeMeta.deleteMany({ where: SCOPE });

    const admin = await prisma.user.create({
      data: {
        email: `mf-metadata-ops-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'test-not-a-real-hash',
        name: 'MF metadata ops',
        role: 'ADMIN',
      },
    });
    opsUserId = admin.id;
  });
  resetOpsUserCache();
});

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.mfSchemeMeta.deleteMany({ where: SCOPE });
    // IngestionFailure cascades from User, but delete explicitly so a failed
    // user delete does not leave orphaned DLQ noise behind.
    await prisma.ingestionFailure.deleteMany({ where: { userId: opsUserId } });
    await prisma.user.delete({ where: { id: opsUserId } }).catch(() => undefined);
  });
  resetOpsUserCache();
});

// ---------------------------------------------------------------------------

describe('mfMetadataJob', () => {
  const RUN1_AT = new Date('2026-01-01T02:00:00.000Z');
  const RUN2_AT = new Date('2026-02-01T02:00:00.000Z');
  const RUN3_AT = new Date('2026-03-01T02:00:00.000Z');

  it('creates one row per parsable scheme, with category, benchmark and plan/option', async () => {
    const result = await runJob(run1Text, RUN1_AT);

    // 7 parsable schemes: 991201-991207. 991208 has no plan/option marker and
    // 99120X has a non-numeric code — both are excluded by the parser.
    expect(result.seen).toBe(7);
    expect(result.inserted).toBe(7);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.suspended).toBe(0);

    const rows = await schemesInBand();
    expect(rows.map((r) => r.schemeCode)).toEqual([
      '991201', '991202', '991203', '991204', '991205', '991206', '991207',
    ]);

    const growth = rows.find((r) => r.schemeCode === '991201');
    expect(growth).toMatchObject({
      schemeName: 'Testmeta Bluechip Fund - Direct Plan - Growth',
      amcName: 'TEST-METADATA-1 Mutual Fund',
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType: 'GROWTH',
      // From SEBI_SUBCATEGORY_MAP.defaultBenchmarkCode — never invented.
      benchmarkIndexCode: 'NIFTY100_TRI',
      status: 'ACTIVE',
      isin: 'INF991201A01',
    });
    // AMFI publishes no inception date; the job seeds it from the NAV date on
    // the row it inserted from (no MFNav history exists for these codes).
    expect(growth?.inceptionDate.toISOString()).toBe('2025-12-31T00:00:00.000Z');

    const debt = rows.find((r) => r.schemeCode === '991206');
    expect(debt).toMatchObject({
      sebiCategory: 'DEBT',
      sebiSubCategory: 'Corporate Bond Fund',
      benchmarkIndexCode: 'NIFTY_CORPORATE_BOND',
    });

    // The IDCW-reinvest row must carry the reinvestment ISIN, not the payout
    // one — MfSchemeMeta.isin is unique and identifies this option, not the
    // fund.
    expect(rows.find((r) => r.schemeCode === '991203')?.isin).toBe('INF991203A02');
  });

  it('stores an unmapped category as UNMAPPED and writes an IngestionFailure for it', async () => {
    const rows = await schemesInBand();
    const unmapped = rows.find((r) => r.schemeCode === '991207');

    // Stored, not discarded: 01 §3 excludes it from universes, nothing more.
    expect(unmapped).toBeDefined();
    expect(unmapped?.sebiSubCategory).toBe('UNMAPPED');
    // The broad category still comes from what AMFI literally wrote.
    expect(unmapped?.sebiCategory).toBe('OTHER');
    // No sub-category means no mandated benchmark, and we never guess one.
    expect(unmapped?.benchmarkIndexCode).toBeNull();

    const failures = await failuresForRun();
    const byRef = new Map(failures.map((f) => [f.sourceRef, f]));

    expect(byRef.get('navall:scheme:991207')?.errorMessage).toMatch(/^unmapped_sebi_category:/);
    // The other two parser reasons are in the DLQ as well, and those rows are
    // genuinely absent from MfSchemeMeta.
    expect(byRef.get('navall:scheme:991208')?.errorMessage).toMatch(/^unparseable_plan_option:/);
    expect(failures.some((f) => /^malformed_row:/.test(f.errorMessage))).toBe(true);
    expect(rows.some((r) => r.schemeCode === '991208')).toBe(false);
  });

  it('links every non-growth option to its growth sibling within the same plan', async () => {
    const rows = await schemesInBand();
    const byCode = new Map(rows.map((r) => [r.schemeCode, r]));

    // DIRECT IDCW and IDCW-reinvest both resolve to the DIRECT growth option…
    expect(byCode.get('991202')?.growthSiblingSchemeCode).toBe('991201');
    expect(byCode.get('991203')?.growthSiblingSchemeCode).toBe('991201');
    // …and the REGULAR IDCW to the REGULAR one. Crossing plans would attribute
    // a distributor-plan return to a direct-plan holder.
    expect(byCode.get('991205')?.growthSiblingSchemeCode).toBe('991204');
    // A growth row is its own option; the column is null by definition.
    expect(byCode.get('991201')?.growthSiblingSchemeCode).toBeNull();
    expect(byCode.get('991204')?.growthSiblingSchemeCode).toBeNull();
  });

  it('is a true no-op on a second run over the same file', async () => {
    const before = await schemesInBand();
    const failuresBefore = await failuresForRun();

    const result = await runJob(run1Text, RUN2_AT);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(7);
    expect(result.suspended).toBe(0);
    expect(result.failed).toBe(0);
    // The DLQ is part of the no-op: an unresolved row for the same
    // (sourceRef, message) is not written again.
    expect(result.dlqWritten).toBe(0);

    const after = await schemesInBand();

    // The assertion that actually catches an unconditional upsert: the row
    // count would be identical either way, `updatedAt` would not.
    expect(after.map((r) => r.updatedAt.toISOString())).toEqual(
      before.map((r) => r.updatedAt.toISOString()),
    );
    expect(after.map((r) => r.fetchedAt.toISOString())).toEqual(
      before.map((r) => r.fetchedAt.toISOString()),
    );
    expect(after.map((r) => r.sourceHash)).toEqual(before.map((r) => r.sourceHash));

    const failuresAfter = await failuresForRun();
    expect(failuresAfter.map((f) => f.id).sort()).toEqual(
      failuresBefore.map((f) => f.id).sort(),
    );
  });

  it('marks a vanished scheme SUSPENDED instead of deleting it, and leaves the rest alone', async () => {
    const before = await schemesInBand();

    const result = await runJob(run2Text, RUN3_AT);

    expect(result.seen).toBe(6);
    expect(result.suspended).toBe(1);
    expect(result.unchanged).toBe(6);
    expect(result.updated).toBe(0);

    const after = await schemesInBand();
    // Still seven rows. Nothing is ever deleted: users hold these schemes and
    // their NAV history stays queryable (01 §7).
    expect(after).toHaveLength(7);

    const vanished = after.find((r) => r.schemeCode === '991205');
    expect(vanished?.status).toBe('SUSPENDED');
    expect(vanished?.statusChangedAt?.toISOString()).toBe(RUN3_AT.toISOString());
    // Absence from the NAV file does not say *why*, so no successor is
    // recorded and no history is spliced.
    expect(vanished?.predecessorSchemeCode).toBeNull();

    // Every other row is untouched — the sweep is not an excuse to rewrite.
    const beforeOthers = before.filter((r) => r.schemeCode !== '991205');
    const afterOthers = after.filter((r) => r.schemeCode !== '991205');
    expect(afterOthers.map((r) => r.updatedAt.toISOString())).toEqual(
      beforeOthers.map((r) => r.updatedAt.toISOString()),
    );
  });

  it('reactivates a suspended scheme that reappears in a later file', async () => {
    const reactivatedAt = new Date('2026-04-01T02:00:00.000Z');
    const result = await runJob(run1Text, reactivatedAt);

    expect(result.reactivated).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(6);
    expect(result.inserted).toBe(0);

    const row = (await schemesInBand()).find((r) => r.schemeCode === '991205');
    expect(row?.status).toBe('ACTIVE');
    expect(row?.statusChangedAt?.toISOString()).toBe(reactivatedAt.toISOString());
  });
});
