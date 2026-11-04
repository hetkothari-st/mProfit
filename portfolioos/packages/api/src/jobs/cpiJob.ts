/**
 * Daily CPI job — MoSPI consumer price index → `CpiObservation`.
 *
 * Feeds the Personal Inflation feature (services/personalInflation). I/O and
 * failure policy only; parsing is in `priceFeeds/mospiCpi.parse.ts`, URLs in
 * `priceFeeds/mospiCpi.v1.ts`.
 *
 * WHY DAILY. MoSPI releases CPI around the 12th, but not on a fixed weekday,
 * and occasionally late. A daily run costs ONE request on a quiet day (probe
 * All India for the next month; "No Data Found" ends the run), so polling daily
 * is cheap and picks a release up within a day.
 *
 * WHAT A RUN DOES
 *  1. Current series (base 2024). Find the newest month stored for All India.
 *     Probe the month after it. If released: re-fetch the previous month for
 *     every state (MoSPI revises provisional figures with the next release),
 *     then fetch the new month for every state. Repeat until a probe is empty.
 *     On an empty table it starts from the series' first month (Jan 2026).
 *     It also fills any state missing from the newest month (a failed fetch
 *     on a previous run).
 *  2. Previous series (base 2012), once per state: the YoY history the
 *     long-run rate compounds. ~21 pages per state. Rows are written only
 *     after every page of a state arrives, so "rows exist" means "complete".
 *
 * Idempotent: upsert on the natural key with a value-diff, so a re-run is a
 * no-op. A missing reading is no row, never zero (see the parser header).
 * Failures go to IngestionFailure, attributed to the oldest ADMIN, as with the
 * other reference-data jobs.
 */

import cron from 'node-cron';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { CPI_STATES, CPI_ALL_INDIA_STATE_CODE, CPI_LONG_RUN_YEARS } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/imports/ingestionFailures.service.js';
import {
  fetchCpi2024StateMonth,
  fetchCpi2012StateYears,
  MOSPI_CPI_ADAPTER_ID,
  MOSPI_CPI_ADAPTER_VERSION,
  type CpiFetchOutcome,
} from '../priceFeeds/mospiCpi.v1.js';
import type { CpiRow, CpiParseFailure } from '../priceFeeds/mospiCpi.parse.js';

const TZ = 'Asia/Kolkata';

/** First month of the base-2024 series. Earlier months return no data. */
export const CPI2024_FIRST = { year: 2026, month: 1 } as const;
/** Last year of the base-2012 series. */
export const CPI2012_LAST_YEAR = 2025;

const MAX_ROW_FAILURES_DLQ = 10;
const DEFAULT_THROTTLE_MS = 250;

export interface CpiJobOptions {
  now?: Date;
  /** Injectable transport for tests — nothing in the suite reaches MoSPI. */
  fetch2024?: typeof fetchCpi2024StateMonth;
  fetch2012?: typeof fetchCpi2012StateYears;
  /** Pause between requests; tests pass 0. */
  throttleMs?: number;
  /** Restrict to these base-2024 state codes (tests). Defaults to all 37. */
  stateCodes?: readonly number[];
  opsUserId?: string;
}

export interface CpiJobResult {
  status: 'OK' | 'PARTIAL';
  monthsFetched: string[];
  latest: string | null;
  legacyStatesBackfilled: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  failures: number;
  ms: number;
}

let running = false;

export function isCpiJobRunning(): boolean {
  return running;
}

export async function runCpiRefresh(options: CpiJobOptions = {}): Promise<CpiJobResult> {
  return runAsSystem(() => runInner(options));
}

/** Single-flight wrapper used by cron and the admin "refresh now" endpoint. */
export async function runCpiJob(options: CpiJobOptions = {}): Promise<CpiJobResult | null> {
  if (running) {
    logger.warn('[cron] CPI job already running — skipping');
    return null;
  }
  running = true;
  try {
    const result = await runCpiRefresh(options);
    logger.info(result, '[cron] CPI refresh done');
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] CPI job failed');
    throw err;
  } finally {
    running = false;
  }
}

/** Daily 07:00 IST. NOT self-registering: called from index.ts. */
export function startCpiJob(): void {
  if (process.env.ENABLE_PRICE_CRONS === 'false') {
    logger.info('[cron] CPI job disabled via ENABLE_PRICE_CRONS=false');
    return;
  }
  cron.schedule('0 7 * * *', () => void runCpiJob().catch(() => undefined), { timezone: TZ });
  logger.info('[cron] scheduled: CPI (MoSPI) @07:00 IST daily');
  // Catch up once per boot: a fresh deploy (empty table) loads straight away
  // instead of waiting for tomorrow's 07:00, and a restart that slept through
  // the cron fills the gap. When nothing is new this costs one MoSPI request.
  setTimeout(() => void runCpiJob().catch(() => undefined), BOOT_DELAY_MS).unref();
}

/** Let the server finish booting and take traffic before the catch-up run. */
const BOOT_DELAY_MS = 30_000;

// ---------------------------------------------------------------------------

interface YM { year: number; month: number }

const ymKey = (p: YM) => `${p.year}-${String(p.month).padStart(2, '0')}`;
const nextYm = (p: YM): YM => (p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 });
const prevYm = (p: YM): YM => (p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 });
const ymLte = (a: YM, b: YM) => a.year < b.year || (a.year === b.year && a.month <= b.month);

/** Calendar month in IST — a run at 00:30 IST on the 1st is already next month. */
function istMonth(now: Date): YM {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

async function runInner(options: CpiJobOptions): Promise<CpiJobResult> {
  const t0 = Date.now();
  const fetch2024 = options.fetch2024 ?? fetchCpi2024StateMonth;
  const fetch2012 = options.fetch2012 ?? fetchCpi2012StateYears;
  const throttle = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const states = CPI_STATES.filter((s) => !options.stateCodes || options.stateCodes.includes(s.code));
  const otherStates = states.filter((s) => s.code !== CPI_ALL_INDIA_STATE_CODE);
  const current = istMonth(options.now ?? new Date());
  const opsUserId = await resolveOpsUserId(options.opsUserId);

  const result: CpiJobResult = {
    status: 'OK', monthsFetched: [], latest: null, legacyStatesBackfilled: 0,
    rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, failures: 0, ms: 0,
  };

  const handle = async (outcome: CpiFetchOutcome): Promise<boolean> => {
    if (!outcome.ok) {
      result.status = 'PARTIAL';
      result.failures += 1;
      await recordFailure(opsUserId, outcome.sourceRef, `[${outcome.reason}] ${outcome.detail}`, {
        reason: outcome.reason, httpStatus: outcome.httpStatus ?? null, bodySample: outcome.bodySample ?? null,
      });
      return false;
    }
    if ('noData' in outcome) return false;
    const w = await persistRows(outcome.rows);
    result.rowsInserted += w.inserted;
    result.rowsUpdated += w.updated;
    result.rowsSkipped += w.skipped;
    if (outcome.failures.length > 0) await recordRowFailures(opsUserId, outcome.sourceRef, outcome.failures);
    return outcome.rows.length > 0;
  };

  const fetchMonthForStates = async (ym: YM, list: typeof states) => {
    for (const s of list) {
      await sleep(throttle);
      await handle(await fetch2024({ stateCode: s.code, ...ym }));
    }
  };

  // ── 1. current series ──────────────────────────────────────────────────
  let latest = await latestStored();
  let probe: YM = latest ? nextYm(latest) : { ...CPI2024_FIRST };
  while (ymLte(probe, current)) {
    const released = await handle(await fetch2024({ stateCode: CPI_ALL_INDIA_STATE_CODE, ...probe }));
    if (!released) break;
    // Revisions to the previous month — unless this run just fetched it
    // (initial backfill), where re-reading it would double the requests.
    if (latest && !result.monthsFetched.includes(ymKey(latest))) await fetchMonthForStates(latest, states);
    await fetchMonthForStates(probe, otherStates);
    result.monthsFetched.push(ymKey(probe));
    latest = probe;
    probe = nextYm(probe);
  }

  // States missing from the newest month (a fetch that failed last run).
  if (latest) {
    const present = await prisma.cpiObservation.findMany({
      where: { baseYear: 2024, year: latest.year, month: latest.month },
      distinct: ['stateCode'],
      select: { stateCode: true },
    });
    const have = new Set(present.map((p) => p.stateCode));
    await fetchMonthForStates(latest, states.filter((s) => !have.has(s.code)));
  }

  // ── 2. previous series, once per state ─────────────────────────────────
  const anchorYear = (latest ?? prevYm(current)).year;
  const years: number[] = [];
  for (let y = anchorYear - (CPI_LONG_RUN_YEARS - 1); y <= CPI2012_LAST_YEAR; y += 1) years.push(y);
  if (years.length > 0) {
    for (const s of states) {
      if (s.legacyCode === null) continue;
      const exists = await prisma.cpiObservation.findFirst({
        where: { baseYear: 2012, stateCode: s.code, year: years[0]! },
        select: { id: true },
      });
      if (exists) continue;
      await sleep(throttle);
      const wrote = await handle(await fetch2012({ stateCode: s.code, legacyStateCode: s.legacyCode, years }));
      if (wrote) result.legacyStatesBackfilled += 1;
    }
  }

  result.latest = latest ? ymKey(latest) : null;
  result.ms = Date.now() - t0;
  return result;
}

async function latestStored(): Promise<YM | null> {
  const row = await prisma.cpiObservation.findFirst({
    where: { baseYear: 2024, stateCode: CPI_ALL_INDIA_STATE_CODE },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  });
  return row ? { year: row.year, month: row.month } : null;
}

const fixed2 = (d: Decimal) => d.toFixed(2, Decimal.ROUND_HALF_EVEN);

function sourceHash(r: CpiRow): string {
  return createHash('sha256')
    .update(`cpi:${r.baseYear}:${r.stateCode}:${r.sector}:${r.divisionCode}:${r.year}-${r.month}:${fixed2(r.inflationPct)}:${r.indexValue ? fixed2(r.indexValue) : '-'}`)
    .digest('hex');
}

const rowKey = (r: { baseYear: number; stateCode: number; sector: string; divisionCode: string; year: number; month: number }) =>
  `${r.baseYear}|${r.stateCode}|${r.sector}|${r.divisionCode}|${r.year}|${r.month}`;

/**
 * Upsert with a value-diff. Not one long transaction — reference-data upserts
 * are individually idempotent and a half-finished run converges on the next.
 */
async function persistRows(rows: readonly CpiRow[]): Promise<{ inserted: number; updated: number; skipped: number }> {
  const out = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length === 0) return out;

  const existing = await prisma.cpiObservation.findMany({
    where: {
      baseYear: { in: [...new Set(rows.map((r) => r.baseYear))] },
      stateCode: { in: [...new Set(rows.map((r) => r.stateCode))] },
      year: { in: [...new Set(rows.map((r) => r.year))] },
      month: { in: [...new Set(rows.map((r) => r.month))] },
    },
    select: { id: true, baseYear: true, stateCode: true, sector: true, divisionCode: true, year: true, month: true, sourceHash: true },
  });
  const byKey = new Map(existing.map((e) => [rowKey(e), e]));

  const toInsert = [];
  for (const r of rows) {
    const hash = sourceHash(r);
    const data = {
      inflationPct: fixed2(r.inflationPct),
      indexValue: r.indexValue ? fixed2(r.indexValue) : null,
      sourceHash: hash,
    };
    const cur = byKey.get(rowKey(r));
    if (!cur) {
      toInsert.push({
        baseYear: r.baseYear, stateCode: r.stateCode, sector: r.sector,
        divisionCode: r.divisionCode, year: r.year, month: r.month, ...data,
      });
    } else if (cur.sourceHash === hash) {
      out.skipped += 1;
    } else {
      await prisma.cpiObservation.update({ where: { id: cur.id }, data });
      out.updated += 1;
    }
  }
  if (toInsert.length > 0) {
    const res = await prisma.cpiObservation.createMany({ data: toInsert, skipDuplicates: true });
    out.inserted += res.count;
    out.skipped += toInsert.length - res.count;
  }
  return out;
}

async function recordRowFailures(opsUserId: string | null, sourceRef: string, failures: readonly CpiParseFailure[]): Promise<void> {
  const sample = failures.slice(0, MAX_ROW_FAILURES_DLQ);
  await recordFailure(
    opsUserId,
    sourceRef,
    `${failures.length} CPI row(s) rejected: ${sample.map((f) => f.reason).join(', ')}. A rejected reading is stored as no row — never as zero.`,
    { rowFailures: sample.map((f) => ({ reason: f.reason, raw: f.raw.slice(0, 200) })), total: failures.length },
  );
}

async function recordFailure(opsUserId: string | null, sourceRef: string, error: string, rawPayload: Record<string, unknown>): Promise<void> {
  if (opsUserId === null) {
    logger.error({ error, sourceRef }, '[cpi] no ADMIN user to attribute the IngestionFailure to — DLQ write skipped');
    return;
  }
  await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: MOSPI_CPI_ADAPTER_ID,
    adapterVersion: MOSPI_CPI_ADAPTER_VERSION,
    sourceRef: `CpiObservation:${sourceRef}`,
    error,
    rawPayload,
  });
}

let cachedOpsUserId: string | null | undefined;

async function resolveOpsUserId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  if (cachedOpsUserId !== undefined) return cachedOpsUserId;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  cachedOpsUserId = admin?.id ?? null;
  return cachedOpsUserId;
}
