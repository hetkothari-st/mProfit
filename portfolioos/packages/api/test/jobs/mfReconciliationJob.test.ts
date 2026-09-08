/**
 * Integration tests for the monthly MF reconciliation job
 * (`06-QUALITY-COMPLIANCE.md §2`, `07` Task 2.6).
 *
 * These hit a real database, and three things follow from that:
 *
 *  1. **Every row is namespaced.** Scheme codes live in a reserved `9945xx`
 *     band, the ops user is created per-run, and `afterAll` deletes only rows
 *     inside that band. The development database is shared with other suites
 *     right now; an unscoped `deleteMany` here would take somebody else's
 *     fixtures with it.
 *
 *  2. **The DLQ owner is passed explicitly.** `resolveOpsUserId` otherwise
 *     picks the oldest active ADMIN, which in a shared database is somebody
 *     else's user.
 *
 *  3. **Nothing reaches the network.** The published-returns feed is driven
 *     through the *real* `fetchMfPublishedReturns` with an injected transport,
 *     so the fetcher's own rules (non-JSON detection, scheme-code matching,
 *     empty-body handling) are under test rather than stubbed past.
 *
 * The load-bearing assertions:
 *   - Task 2.6's stated criterion: a deliberately wrong metrics row produces a
 *     drift failure whose message NAMES the scheme.
 *   - `COULD_NOT_RECONCILE` is a distinct, alerting outcome. A job that reports
 *     success having fetched nothing manufactures confidence, which is worse
 *     than having no reconciliation job at all.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  runMfReconciliationJob,
  loadReconciliationPanel,
  resetOpsUserCache,
  isReturnBreach,
  RETURN_TOLERANCE_PP,
  MF_RECONCILIATION_ADAPTER_ID,
  type MfReconciliationJobResult,
  type ReconciliationPanelEntry,
} from '../../src/jobs/mfReconciliationJob.js';
import {
  fetchMfPublishedReturns,
  type MfPublishedReturnsFetchOutcome,
} from '../../src/priceFeeds/mfPublishedReturns.v1.js';
import type { HttpTextOutcome } from '../../src/priceFeeds/nseIndices.v1.js';
import { toDecimal } from '@portfolioos/shared';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Reserved band. Nothing outside it is read or written by this file. */
const BAND = '9945';
const SCOPE = { schemeCode: { startsWith: BAND } } as const;

const MONTH_END = new Date(Date.UTC(2026, 7, 31)); // 2026-08-31
const PERIOD = '2026-08';
/** `now` is inside September so `lastCompletedMonthEnd` would agree with us. */
const RUN_AT = new Date(Date.UTC(2026, 8, 5, 3, 0, 0));

let opsUserId = '';

// ---------------------------------------------------------------------------
// The fake feed — real fetcher, real parser, injected transport
// ---------------------------------------------------------------------------

/** scheme code -> fixture file under `test/fixtures/mf/reconciliation/`. */
const FIXTURE_BY_CODE: Readonly<Record<string, string>> = {
  '994501': 'published-994501-match.json',
  '994502': 'published-994502-drift.json',
  '994503': 'published-994503-boundary.json',
  '994504': 'published-994504-ter-aum-mismatch.json',
  '994505': 'published-994505-not-json.html',
  '994506': 'published-994506-window-drift.json',
};

const fixtureCache = new Map<string, string>();

async function fixtureText(name: string): Promise<string> {
  const hit = fixtureCache.get(name);
  if (hit !== undefined) return hit;
  const text = await readFile(resolve(here, '../fixtures/mf/reconciliation', name), 'utf8');
  fixtureCache.set(name, text);
  return text;
}

/**
 * Transport that serves a fixture for a scheme code found in the URL, and a
 * hard 404 for anything else. Deliberately not a stub of the *fetcher*: routing
 * through `fetchMfPublishedReturns` keeps the HTML-error-page detection, the
 * scheme-code cross-check and the parse rejection in the tested path.
 */
async function fixtureTransport(url: string): Promise<HttpTextOutcome> {
  const code = /\/mf\/(\d+)\//.exec(url)?.[1];
  const file = code === undefined ? undefined : FIXTURE_BY_CODE[code];
  if (file === undefined) {
    return { ok: false, reason: 'HTTP_ERROR', detail: `no fixture for ${url}`, httpStatus: 404 };
  }
  return { ok: true, text: await fixtureText(file) };
}

function fetchPublished(schemeCode: string): Promise<MfPublishedReturnsFetchOutcome> {
  return fetchMfPublishedReturns(schemeCode, { fetchText: fixtureTransport });
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function panelEntry(schemeCode: string, schemeName: string): ReconciliationPanelEntry {
  return { schemeCode, schemeName, sebiSubCategory: 'Large Cap Fund', codeVerified: true };
}

const MAIN_PANEL: ReconciliationPanelEntry[] = [
  panelEntry('994501', 'TEST-RECON Bluechip Fund - Direct Plan - Growth'),
  panelEntry('994502', 'TEST-RECON Midcap Fund - Direct Plan - Growth'),
  panelEntry('994503', 'TEST-RECON Smallcap Fund - Direct Plan - Growth'),
  panelEntry('994504', 'TEST-RECON Corporate Bond Fund - Direct Plan - Growth'),
];

/**
 * A minimally-complete `MfHorizonMetrics` payload.
 *
 * Only `returns.absolute` / `returns.cagr` and the provenance fields are read by
 * the job, but the shape is kept faithful so a future field the job starts
 * reading is present rather than undefined.
 *
 * Values are Decimal **strings** — `MfSchemeMetrics.metrics` stores them that
 * way precisely so a JSON number cannot round-trip through IEEE-754
 * (`CONTEXT.md §3.1`), and a fixture that used numbers would be testing a
 * different contract from the one production writes.
 */
function horizonMetrics(input: {
  asOf: Date;
  horizonYears: 1 | 3 | 5;
  cagr: string | null;
  absolute: string | null;
}): Prisma.InputJsonValue {
  return {
    asOf: input.asOf.toISOString().slice(0, 10),
    horizonYears: input.horizonYears,
    observationsMonthly: input.horizonYears * 12,
    status: 'OK',
    benchmarkCode: 'NIFTY100_TRI',
    riskFreeSeries: 'TBILL_91D',
    mathVersion: 'metrics-v1',
    returns: {
      cagr: input.cagr,
      absolute: input.absolute,
      benchmarkCagr: null,
      categoryMedianCagr: null,
      rolling1y: null,
      rolling3y: null,
      rolling5y: null,
      calendarYears: [],
      sipXirr: null,
    },
    risk: {},
    riskAdjusted: {},
    relative: {},
    consistency: { quartileHistory: [], survivorshipAdjusted: true },
    fieldStatus: {},
  } as unknown as Prisma.InputJsonValue;
}

async function seedScheme(schemeCode: string, schemeName: string, optionType: 'GROWTH'): Promise<void> {
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode,
      schemeName,
      amcCode: 'TEST-RECON',
      amcName: 'TEST-RECON Mutual Fund',
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType,
      inceptionDate: new Date(Date.UTC(2015, 0, 1)),
      status: 'ACTIVE',
      sourceHash: `test-recon-${schemeCode}`,
      fetchedAt: RUN_AT,
    },
  });
}

async function seedMetrics(
  schemeCode: string,
  asOf: Date,
  rows: Array<{ horizonYears: 1 | 3 | 5; cagr: string | null; absolute: string | null }>,
): Promise<void> {
  for (const r of rows) {
    await prisma.mfSchemeMetrics.create({
      data: {
        schemeCode,
        asOf,
        horizonYears: r.horizonYears,
        status: 'OK',
        metrics: horizonMetrics({ asOf, ...r }),
        benchmarkCode: 'NIFTY100_TRI',
        riskFreeSeries: 'TBILL_91D',
        mathVersion: 'metrics-v1',
      },
    });
  }
}

/** The three matching horizons every scheme except 994503/994506 carries. */
const MATCHING_RETURNS = [
  { horizonYears: 1 as const, cagr: null, absolute: '0.184200' },
  { horizonYears: 3 as const, cagr: '0.151000', absolute: null },
  { horizonYears: 5 as const, cagr: '0.120300', absolute: null },
];

/** 63,421.55 crore in plain rupees — `MfSchemeAum.aum` is NOT crore (schema §). */
const MATCHING_AUM_RUPEES = '634215500000';

async function seedTerAum(schemeCode: string, terPct: string, aumRupees: string): Promise<void> {
  await prisma.mfSchemeTer.create({
    data: {
      schemeCode,
      effectiveFrom: new Date(Date.UTC(2026, 7, 1)),
      terPct,
      sourceHash: `test-recon-ter-${schemeCode}`,
      fetchedAt: RUN_AT,
    },
  });
  await prisma.mfSchemeAum.create({
    data: {
      schemeCode,
      asOf: MONTH_END,
      aum: aumRupees,
      sourceHash: `test-recon-aum-${schemeCode}`,
      fetchedAt: RUN_AT,
    },
  });
}

async function cleanBand(): Promise<void> {
  // Ordered by dependency, and every predicate is band-scoped. MfSchemeMetrics /
  // Ter / Aum cascade from MfSchemeMeta but are deleted explicitly so a partial
  // failure cannot leave orphans that break the next run's create.
  await prisma.mfSchemeMetrics.deleteMany({ where: SCOPE });
  await prisma.mfSchemeTer.deleteMany({ where: SCOPE });
  await prisma.mfSchemeAum.deleteMany({ where: SCOPE });
  await prisma.mfSchemeMeta.deleteMany({ where: SCOPE });
  const masters = await prisma.mutualFundMaster.findMany({
    where: SCOPE,
    select: { id: true },
  });
  if (masters.length > 0) {
    await prisma.mFNav.deleteMany({ where: { fundId: { in: masters.map((m) => m.id) } } });
    await prisma.mutualFundMaster.deleteMany({ where: SCOPE });
  }
}

let mainRun: MfReconciliationJobResult;

beforeAll(async () => {
  await runAsSystem(async () => {
    // Leftovers from an aborted previous run of this file.
    await cleanBand();

    const admin = await prisma.user.create({
      data: {
        email: `mf-recon-ops-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'test-not-a-real-hash',
        name: 'MF reconciliation ops',
        role: 'ADMIN',
      },
    });
    opsUserId = admin.id;

    // --- 994501: agrees on everything ------------------------------------
    await seedScheme('994501', 'TEST-RECON Bluechip Fund - Direct Plan - Growth', 'GROWTH');
    await seedMetrics('994501', MONTH_END, MATCHING_RETURNS);
    // 0.620004 against a published "0.62": equal once rounded to the scale they
    // published at, which is what "exact match" has to mean against a source
    // that discloses two decimals.
    await seedTerAum('994501', '0.620004', MATCHING_AUM_RUPEES);

    // --- 994502: 3y is deliberately wrong, with a quarantined NAV to explain it
    await seedScheme('994502', 'TEST-RECON Midcap Fund - Direct Plan - Growth', 'GROWTH');
    await seedMetrics('994502', MONTH_END, [
      { horizonYears: 1, cagr: null, absolute: '0.184200' },
      // 15.42pp against a published 15.10pp — 0.32pp, well past tolerance.
      { horizonYears: 3, cagr: '0.154200', absolute: null },
      { horizonYears: 5, cagr: '0.120300', absolute: null },
    ]);
    await seedTerAum('994502', '0.620000', MATCHING_AUM_RUPEES);
    const master = await prisma.mutualFundMaster.create({
      data: {
        schemeCode: '994502',
        schemeName: 'TEST-RECON Midcap Fund - Direct Plan - Growth',
        amcName: 'TEST-RECON Mutual Fund',
        category: 'EQUITY',
      },
    });
    await prisma.mFNav.create({
      data: {
        fundId: master.id,
        date: new Date(Date.UTC(2025, 5, 15)),
        nav: '100.0000',
        adjustedNav: '100.000000',
        isQuarantined: true,
        quarantineReason: 'nav_jump',
      },
    });

    // --- 994503: the tolerance boundary, three ways ----------------------
    await seedScheme('994503', 'TEST-RECON Smallcap Fund - Direct Plan - Growth', 'GROWTH');
    await seedMetrics('994503', MONTH_END, [
      // +0.05pp — comfortably inside.
      { horizonYears: 1, cagr: null, absolute: '0.184700' },
      // +0.10pp — exactly on the tolerance. Documented as NOT firing.
      { horizonYears: 3, cagr: '0.152000', absolute: null },
      // +0.11pp — the first value that must fire.
      { horizonYears: 5, cagr: '0.121400', absolute: null },
    ]);
    await seedTerAum('994503', '0.620000', MATCHING_AUM_RUPEES);

    // --- 994504: returns agree, TER and AUM do not ------------------------
    await seedScheme('994504', 'TEST-RECON Corporate Bond Fund - Direct Plan - Growth', 'GROWTH');
    await seedMetrics('994504', MONTH_END, MATCHING_RETURNS);
    // 0.75 against 0.62, and 1,234 crore against a published 1,000.00 crore.
    await seedTerAum('994504', '0.750000', '12340000000');

    // --- 994506: right numbers, wrong window ------------------------------
    await seedScheme('994506', 'TEST-RECON Flexicap Fund - Direct Plan - Growth', 'GROWTH');
    await seedMetrics('994506', MONTH_END, [
      { horizonYears: 3, cagr: '0.154200', absolute: null },
    ]);
    await seedMetrics('994506', new Date(Date.UTC(2026, 7, 30)), [
      { horizonYears: 3, cagr: '0.151000', absolute: null },
    ]);
  });

  resetOpsUserCache();

  mainRun = await runMfReconciliationJob({
    monthEnd: MONTH_END,
    now: RUN_AT,
    opsUserId,
    panel: MAIN_PANEL,
    fetchPublished,
  });
});

afterAll(async () => {
  await runAsSystem(async () => {
    await cleanBand();
    // IngestionFailure and Alert cascade from User, but are deleted explicitly
    // so a failed user delete does not leave ops noise behind.
    await prisma.ingestionFailure.deleteMany({ where: { userId: opsUserId } });
    await prisma.alert.deleteMany({ where: { userId: opsUserId } });
    await prisma.user.delete({ where: { id: opsUserId } }).catch(() => undefined);
  });
  resetOpsUserCache();
});

async function failures(): Promise<Array<{ sourceRef: string; errorMessage: string; rawPayload: unknown }>> {
  return runAsSystem(() =>
    prisma.ingestionFailure.findMany({
      where: { userId: opsUserId, sourceAdapter: MF_RECONCILIATION_ADAPTER_ID },
      orderBy: { sourceRef: 'asc' },
      select: { sourceRef: true, errorMessage: true, rawPayload: true },
    }),
  );
}

// ---------------------------------------------------------------------------

describe('mfReconciliationJob', () => {
  it('reconciles the panel and separates coverage from agreement', () => {
    // 4 schemes x (1y, 3y, 5y, TER, AUM).
    expect(mainRun.comparisons).toBe(20);
    expect(mainRun.unreconciled).toBe(0);
    expect(mainRun.coverage).toBe('FULL');
    // FULL coverage says we checked everything; DRIFT_DETECTED says what we
    // found. The two axes are deliberately independent.
    expect(mainRun.outcome).toBe('DRIFT_DETECTED');
    expect(mainRun.matched).toBe(16);
    expect(mainRun.drifted).toBe(4);
  });

  it('names the scheme in the drift failure and classifies the suspected cause', async () => {
    // Task 2.6's stated acceptance criterion.
    const rows = await failures();
    const row = rows.find((r) => r.sourceRef === 'mf-recon:994502:RETURN_3Y:2026-08');
    expect(row, 'a drift row for 994502 at the 3y horizon').toBeDefined();

    expect(row!.errorMessage).toContain('reconciliation_drift');
    expect(row!.errorMessage).toContain('994502');
    expect(row!.errorMessage).toContain('TEST-RECON Midcap Fund');
    expect(row!.errorMessage).toContain('RETURN_3Y');
    // Both sides of the comparison, so the operator does not have to go and
    // fetch the published figure again to know which one moved.
    expect(row!.errorMessage).toContain('15.4200pp');
    expect(row!.errorMessage).toContain('15.1000pp');

    // `06 §2`: drift is nearly always one of four things, and the job says
    // which rather than leaving the operator to re-derive it.
    expect(row!.errorMessage).toContain('QUARANTINED_NAV_GAP');
    const payload = row!.rawPayload as Record<string, unknown>;
    expect(payload['suspectedCause']).toBe('QUARANTINED_NAV_GAP');
    expect(String(payload['causeEvidence'])).toContain('quarantined NAV row');

    expect(mainRun.driftsByCause['QUARANTINED_NAV_GAP']).toBe(1);
  });

  it('does not fire inside the tolerance, does not fire at exactly 0.10pp, does fire past it', async () => {
    const breaches = mainRun.breaches.filter((b) => b.schemeCode === '994503');
    // +0.05pp (1y) and +0.10pp (3y) are inside the band; only +0.11pp (5y) is
    // outside it. The boundary decision is documented on RETURN_TOLERANCE_PP:
    // "±0.10 pp" is a closed band, so a value on the edge is within tolerance.
    expect(breaches.map((b) => b.metric)).toEqual(['RETURN_5Y']);

    // And the same boundary asserted directly on the predicate, so a future
    // change to it fails here rather than only through the seeded fixture.
    expect(isReturnBreach(toDecimal('15.20'), toDecimal('15.10'))).toBe(false);
    expect(isReturnBreach(toDecimal('15.21'), toDecimal('15.10'))).toBe(true);
    expect(isReturnBreach(toDecimal('15.05'), toDecimal('15.10'))).toBe(false);
    expect(RETURN_TOLERANCE_PP.toString()).toBe('0.1');

    const rows = await failures();
    expect(rows.some((r) => r.sourceRef === 'mf-recon:994503:RETURN_1Y:2026-08')).toBe(false);
    expect(rows.some((r) => r.sourceRef === 'mf-recon:994503:RETURN_3Y:2026-08')).toBe(false);
    expect(rows.some((r) => r.sourceRef === 'mf-recon:994503:RETURN_5Y:2026-08')).toBe(true);
  });

  it('fires on a TER mismatch and on an AUM mismatch, each as its own failure', async () => {
    const rows = await failures();

    const ter = rows.find((r) => r.sourceRef === 'mf-recon:994504:TER:2026-08');
    expect(ter, 'a TER drift row for 994504').toBeDefined();
    expect(ter!.errorMessage).toContain('994504');
    expect(ter!.errorMessage).toContain('0.750000pp');
    expect(ter!.errorMessage).toContain('0.62pp');
    // TER is disclosed daily, so `06 §2` expects exact agreement — evaluated at
    // the scale the publisher used, not bit-equality against Decimal(12,6).
    expect(ter!.errorMessage).toContain('exact at the published scale');

    const aum = rows.find((r) => r.sourceRef === 'mf-recon:994504:AUM:2026-08');
    expect(aum, 'an AUM drift row for 994504').toBeDefined();
    // Ours is stored in rupees and compared in crore; 1,234 crore against a
    // published 1,000.00 crore.
    expect(aum!.errorMessage).toContain('1234.0000cr');
    expect(aum!.errorMessage).toContain('1000.00cr');

    // 994501 stores 0.620004 against a published 0.62 and must NOT fire: that
    // is the publisher's rounding, not a disagreement about the TER.
    expect(rows.some((r) => r.sourceRef === 'mf-recon:994501:TER:2026-08')).toBe(false);
    expect(rows.some((r) => r.sourceRef === 'mf-recon:994501:AUM:2026-08')).toBe(false);
  });

  it('raises one admin alert for the run rather than one per breach', async () => {
    const alerts = await runAsSystem(() =>
      prisma.alert.findMany({ where: { userId: opsUserId }, select: { title: true } }),
    );
    // Four breaches, one alert. Ninety alerts is an alert nobody reads; the
    // per-breach detail lives in the DLQ, which is where `06 §2` puts it.
    expect(alerts.filter((a) => a.title.startsWith('MF reconciliation drift'))).toHaveLength(1);
    expect(alerts[0]!.title).toContain('4 breach(es) 2026-08');
  });

  it('is idempotent: a second run on the same month writes no duplicate DLQ rows', async () => {
    const before = await failures();

    const second = await runMfReconciliationJob({
      monthEnd: MONTH_END,
      now: RUN_AT,
      opsUserId,
      panel: MAIN_PANEL,
      fetchPublished,
    });

    // The comparisons happen again — the job is not caching a verdict — but the
    // DLQ is deduped on (scheme, metric, period) via `sourceRef` plus message.
    expect(second.drifted).toBe(4);
    expect(second.dlqWritten).toBe(0);

    const after = await failures();
    expect(after).toHaveLength(before.length);
  });

  it('reports COULD_NOT_RECONCILE when the feed is unavailable, and never a pass', async () => {
    const run = await runMfReconciliationJob({
      monthEnd: MONTH_END,
      now: RUN_AT,
      opsUserId,
      // 994505's fixture is an HTML error page served with a 200 — the failure
      // mode that would otherwise be parsed into silence.
      panel: [panelEntry('994505', 'TEST-RECON Dead Feed Fund - Direct Plan - Growth')],
      fetchPublished,
    });

    expect(run.comparisons).toBe(0);
    expect(run.matched).toBe(0);
    expect(run.drifted).toBe(0);
    // The distinction the whole job exists for: nothing compared is NOT
    // "nothing disagreed".
    expect(run.coverage).toBe('NONE');
    expect(run.outcome).toBe('COULD_NOT_RECONCILE');
    expect(run.unreconciledByReason['feed_unavailable']).toBe(5);

    const rows = await failures();
    const runRow = rows.find((r) => r.sourceRef === `mf-recon:run:${PERIOD}`);
    expect(runRow, 'a run-level could_not_reconcile row').toBeDefined();
    expect(runRow!.errorMessage).toContain('could_not_reconcile');
    expect(runRow!.errorMessage).toContain('This is not a clean run');

    // The per-scheme feed failure names the scheme too, so the operator knows
    // which source went dark.
    const feedRow = rows.find((r) => r.sourceRef === `mf-recon:994505:FEED:${PERIOD}`);
    expect(feedRow, 'a per-scheme feed failure row').toBeDefined();
    expect(feedRow!.errorMessage).toContain('reconciliation_feed_unavailable');
    expect(feedRow!.errorMessage).toContain('994505');
    expect(feedRow!.errorMessage).toContain('NOT_JSON');

    const alerts = await runAsSystem(() =>
      prisma.alert.findMany({
        where: { userId: opsUserId, title: { startsWith: 'MF reconciliation could not run' } },
        select: { description: true },
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.description).toContain('UNVERIFIED');
  });

  it('classifies an off-by-a-day window, and counts an unpublished figure as unreconciled', async () => {
    const run = await runMfReconciliationJob({
      monthEnd: MONTH_END,
      now: RUN_AT,
      opsUserId,
      panel: [panelEntry('994506', 'TEST-RECON Flexicap Fund - Direct Plan - Growth')],
      fetchPublished,
    });

    // The fixture publishes 3y only. The other four figures are un-reconciled,
    // never matched — a source that is silent about a number has not agreed
    // with us about it.
    expect(run.comparisons).toBe(1);
    expect(run.unreconciledByReason['not_published']).toBe(4);
    expect(run.coverage).toBe('PARTIAL');
    expect(run.outcome).toBe('DRIFT_DETECTED');

    expect(run.breaches).toHaveLength(1);
    // Our 2026-08-30 row agrees with the publisher while our 2026-08-31 row does
    // not, which is proof rather than a guess.
    expect(run.breaches[0]!.cause).toBe('WINDOW_START_OFF_BY_A_DAY');
    expect(run.breaches[0]!.causeEvidence).toContain('2026-08-30');
  });
});

describe('reconciliation panel fixture', () => {
  it('loads the 30-scheme panel `06 §2` requires, with unique codes', async () => {
    const loaded = await loadReconciliationPanel();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.entries).toHaveLength(30);
    expect(new Set(loaded.entries.map((e) => e.schemeCode)).size).toBe(30);
    // Spread across categories, so drift confined to one metric family shows up
    // as a pattern rather than as scattered noise.
    expect(new Set(loaded.entries.map((e) => e.sebiSubCategory)).size).toBeGreaterThanOrEqual(15);
    // Honest about itself: no code has been checked against a live AMFI file.
    expect(loaded.entries.every((e) => !e.codeVerified)).toBe(true);
  });
});
