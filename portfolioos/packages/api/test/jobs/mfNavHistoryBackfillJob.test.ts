/**
 * Integration tests for the MF NAV history backfill job.
 *
 * These hit a real database, so — exactly as `mfMetadataJob.test.ts` does —
 * every row this file creates is namespaced into a reserved scheme-code band
 * (`9913xx`). The development database is shared with other suites and with
 * real ingested NAV data; nothing outside the band is read, written or
 * deleted, and there is no unscoped `deleteMany` anywhere in this file.
 *
 * The network is never touched: the job takes an injected `transport`, and the
 * bodies it returns are the LIVE fixtures under `test/fixtures/mf/mfapi/`.
 *
 * The load-bearing assertion is idempotency, and it is checked on row IDENTITY
 * (id + nav + date), not on a row count. A count would stay identical while an
 * upsert rewrote every row — which is the failure mode that would silently
 * desynchronise `nav` from the `adjustedNav` another job derived from it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  runMfNavHistoryBackfill,
  resetOpsUserCache,
} from '../../src/jobs/mfNavHistoryBackfillJob.js';
import { MFAPI_NAV_HISTORY_ADAPTER_ID } from '../../src/priceFeeds/mfapiNavHistory.v1.js';

const here = fileURLToPath(new URL('.', import.meta.url));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, '../fixtures/mf/mfapi', name), 'utf8')) as unknown;
}

const GROWTH = fixture('scheme-120465-growth.json');
const UNKNOWN = fixture('unknown-scheme.json');

/** Reserved band. Nothing outside it is touched. */
const PREFIX = '9913';
const CODE_OK = `${PREFIX}01`;
const CODE_MISSING = `${PREFIX}02`;
const CODES = [CODE_OK, CODE_MISSING];

let opsUserId = '';

/** Serves the live growth fixture for one code and MFAPI's unknown-scheme body for the other. */
const transport = async (url: string): Promise<{ statusCode: number; body: unknown }> => {
  if (url.endsWith(`/${CODE_MISSING}`)) return { statusCode: 200, body: UNKNOWN };
  return { statusCode: 200, body: GROWTH };
};

async function cleanup(): Promise<void> {
  await runAsSystem(async () => {
    const masters = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { startsWith: PREFIX } },
      select: { id: true },
    });
    if (masters.length > 0) {
      await prisma.mFNav.deleteMany({ where: { fundId: { in: masters.map((m) => m.id) } } });
      await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
    }
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
    if (opsUserId) {
      await prisma.ingestionFailure.deleteMany({
        where: { userId: opsUserId, sourceAdapter: MFAPI_NAV_HISTORY_ADAPTER_ID },
      });
    }
  });
}

beforeAll(async () => {
  resetOpsUserCache();
  await runAsSystem(async () => {
    // Leftovers from an aborted previous run, scoped to the reserved band.
    const stale = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { startsWith: PREFIX } },
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.mFNav.deleteMany({ where: { fundId: { in: stale.map((m) => m.id) } } });
      await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
    }
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });

    // The DLQ owner is passed explicitly everywhere below: `resolveOpsUserId`
    // otherwise picks the oldest active ADMIN, which in a shared database is
    // somebody else's fixture.
    const admin = await prisma.user.create({
      data: {
        email: `mf-navhistory-ops-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'test-not-a-real-hash',
        name: 'MF nav history ops',
        role: 'ADMIN',
      },
    });
    opsUserId = admin.id;

    for (const [i, schemeCode] of CODES.entries()) {
      await prisma.mfSchemeMeta.create({
        data: {
          schemeCode,
          isin: `INF9913${String(i).padStart(2, '0')}TEST`,
          schemeName: `TEST NAV HISTORY FUND ${i} - Direct Plan - Growth`,
          amcCode: 'TEST_AMC',
          amcName: 'TEST-NAVHISTORY',
          sebiCategory: 'EQUITY',
          sebiSubCategory: 'Large Cap Fund',
          planType: 'DIRECT',
          optionType: 'GROWTH',
          isEtf: false,
          inceptionDate: new Date(Date.UTC(2013, 0, 2)),
          status: 'ACTIVE',
          sourceHash: `test-${schemeCode}`,
          fetchedAt: new Date(),
        },
      });
    }
  });
});

afterAll(async () => {
  await cleanup();
  if (opsUserId) {
    await runAsSystem(() => prisma.user.delete({ where: { id: opsUserId } }));
  }
  resetOpsUserCache();
});

async function navRowsFor(schemeCode: string) {
  return runAsSystem(async () => {
    const master = await prisma.mutualFundMaster.findUnique({
      where: { schemeCode },
      select: { id: true },
    });
    if (!master) return [];
    return prisma.mFNav.findMany({
      where: { fundId: master.id },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, nav: true, adjustedNav: true },
    });
  });
}

describe('mfNavHistoryBackfillJob', () => {
  it('ingests history, creating the MutualFundMaster row that did not exist', async () => {
    const res = await runMfNavHistoryBackfill({
      schemeCodes: CODES,
      opsUserId,
      transport,
      delayMs: 0,
      retryDelayMs: 0,
      concurrency: 2,
    });

    expect(res.selected).toBe(2);
    expect(res.ingested).toBe(1); // the other scheme is not in MFAPI
    // AMFI publishes schemes we hold no master row for; without on-demand
    // creation the backfill would skip exactly the schemes it exists to find.
    expect(res.mastersCreated).toBe(1);
    expect(res.navRowsInserted).toBeGreaterThan(50);
    expect(res.failed).toBe(0);

    const master = await runAsSystem(() =>
      prisma.mutualFundMaster.findUnique({ where: { schemeCode: CODE_OK } }),
    );
    expect(master).not.toBeNull();
    // Derived from MfSchemeMeta.sebiCategory, not from MFAPI's text.
    expect(master!.category).toBe('EQUITY');
    expect(master!.subCategory).toBe('Large Cap Fund');
  });

  it('stores dates day-first and NAV as an exact Decimal', async () => {
    const rows = await navRowsFor(CODE_OK);

    // "02-01-2013" is 2 January 2013, not 1 February.
    expect(rows[0]!.date.toISOString().slice(0, 10)).toBe('2013-01-02');
    expect(rows[0]!.nav.toString()).toBe('12.28');

    // "04-09-2026" is 4 September 2026, not 9 April.
    const last = rows[rows.length - 1]!;
    expect(last.date.toISOString().slice(0, 10)).toBe('2026-09-04');
    expect(last.nav.toString()).toBe('69.66');
  });

  it('leaves adjustedNav NULL — that column is the adjustment job\'s', async () => {
    // A backfill that stopped here would look full of history and still report
    // INSUFFICIENT_DATA everywhere, because every metric reads adjustedNav.
    const rows = await navRowsFor(CODE_OK);
    expect(rows.every((r) => r.adjustedNav === null)).toBe(true);
  });

  it('does not write the zero NAV that is really in the live data', async () => {
    const rows = await navRowsFor(CODE_OK);
    // Scheme 120465 publishes {"date":"07-04-2013","nav":"0.00000"}. A 0 in the
    // series reads as a -100% day and destroys every drawdown spanning it.
    expect(rows.some((r) => r.date.toISOString().slice(0, 10) === '2013-04-07')).toBe(false);
    // Its neighbours survive: one bad point costs one point.
    expect(rows.some((r) => r.date.toISOString().slice(0, 10) === '2013-04-08')).toBe(true);
    expect(rows.some((r) => r.date.toISOString().slice(0, 10) === '2013-04-05')).toBe(true);
  });

  it('counts a scheme MFAPI does not have as not_found, not as a failure', async () => {
    // MFAPI answers an unknown scheme with HTTP 200 and status "SUCCESS", so
    // this is the only place the distinction can be made.
    const res = await runMfNavHistoryBackfill({
      schemeCodes: [CODE_MISSING],
      opsUserId,
      transport,
      delayMs: 0,
      skipIfNavRowsAtLeast: 0,
    });
    expect(res.notFound).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.schemeFailuresByReason['not_found']).toBe(1);
    // Hundreds of these on a full run is normal; DLQ-ing them would bury the
    // real failures.
    expect(res.dlqWritten).toBe(0);
  });

  it('reports rejected points to the DLQ once per scheme, not once per point', async () => {
    const failures = await runAsSystem(() =>
      prisma.ingestionFailure.findMany({
        where: { userId: opsUserId, sourceAdapter: MFAPI_NAV_HISTORY_ADAPTER_ID },
      }),
    );
    const points = failures.filter((f) => f.sourceRef === `mfapi:scheme:${CODE_OK}:points`);
    expect(points).toHaveLength(1);
    expect(points[0]!.errorMessage).toContain('non_positive_nav');
  });

  it('is idempotent: a forced re-ingest writes nothing and changes nothing', async () => {
    const before = await navRowsFor(CODE_OK);

    const res = await runMfNavHistoryBackfill({
      schemeCodes: [CODE_OK],
      opsUserId,
      transport,
      delayMs: 0,
      // 0 disables the "already has NAVs" pre-skip, so the job really does
      // re-parse and re-offer every point to the database. Without this the
      // test would only be proving that the skip works.
      skipIfNavRowsAtLeast: 0,
    });

    expect(res.ingested).toBe(1);
    expect(res.navPointsSeen).toBe(before.length);
    expect(res.navRowsInserted).toBe(0);

    const after = await navRowsFor(CODE_OK);
    // Identity, not just count: an upsert would keep the count and rewrite the
    // rows, moving `nav` out from under any derived `adjustedNav`.
    expect(after).toHaveLength(before.length);
    expect(after.map((r) => [r.id, r.date.toISOString(), r.nav.toString()])).toEqual(
      before.map((r) => [r.id, r.date.toISOString(), r.nav.toString()]),
    );
  });

  it('skips a scheme that already has NAV rows without making a request', async () => {
    let requests = 0;
    const res = await runMfNavHistoryBackfill({
      schemeCodes: [CODE_OK],
      opsUserId,
      delayMs: 0,
      transport: async (url) => {
        requests += 1;
        return transport(url);
      },
    });
    expect(res.skipped).toBe(1);
    expect(res.ingested).toBe(0);
    // The writes are idempotent, but the TRAFFIC is not — this is what keeps a
    // re-run from re-downloading 130 KB per scheme from a free host.
    expect(requests).toBe(0);
  });

  it('routes an HTTP failure to the DLQ and keeps going', async () => {
    const res = await runMfNavHistoryBackfill({
      schemeCodes: CODES,
      opsUserId,
      delayMs: 0,
      retryDelayMs: 0,
      retries: 0,
      skipIfNavRowsAtLeast: 0,
      transport: async (url) =>
        url.endsWith(`/${CODE_OK}`)
          ? { statusCode: 500, body: undefined }
          : { statusCode: 200, body: UNKNOWN },
    });

    expect(res.failed).toBe(1);
    expect(res.schemeFailuresByReason['http_error']).toBe(1);
    // The run completed; the other scheme was still processed.
    expect(res.notFound).toBe(1);

    const dlq = await runAsSystem(() =>
      prisma.ingestionFailure.findMany({
        where: {
          userId: opsUserId,
          sourceAdapter: MFAPI_NAV_HISTORY_ADAPTER_ID,
          sourceRef: `mfapi:scheme:${CODE_OK}`,
        },
      }),
    );
    expect(dlq.length).toBeGreaterThanOrEqual(1);
    expect(dlq[0]!.errorMessage).toContain('http_error');
  });
});
