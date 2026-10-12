/**
 * Daily live-loan-rates job (EMI calculator spec s5.4): 07:30 IST, one request per page.
 *
 * For each AUTO page reader: fetch the page (allow-listed, robots-aware, capped - fetchPage.ts), read it
 * (pure readers, sources/*.ts), and append each reading through the store's sanity and supersede rules.
 * Nothing here throws out of a page: a fetch error, a reader that finds nothing, or a source missing from
 * its page writes one IngestionFailure row and the source's lastError*, and the run moves on. The last good
 * rate stays displayed. After the pages, AUTO sources with no success for 7 days raise one ops alert per day.
 *
 * Runs under runAsSystem: the rate tables are global, and IngestionFailure, Alert and User are user-scoped
 * tables this job writes or reads for the ops admin.
 *
 * REGISTRATION: startLoanRatesJob() is called from src/index.ts (beside startMfScoreJob, outside the startup
 * sync, so ENABLE_STARTUP_SYNC does not gate it). ENABLE_LOAN_RATES_CRON=false disables it (the test env sets
 * that).
 */
import cron from 'node-cron';
import type { LoanRateSource, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import { FetchPageError, fetchPage } from '../services/loanRates/fetchPage.js';
import { isSourceStale, istDate, STALE_AFTER_DAYS } from '../services/loanRates/sanity.js';
import { ensureLoanRateSources } from '../services/loanRates/sourceList.js';
import { PAGE_READERS } from '../services/loanRates/sources/index.js';
import { clean, loadPage } from '../services/loanRates/sources/parseUtil.js';
import { dateOnly, recordReading } from '../services/loanRates/store.js';
import type { PageReader } from '../services/loanRates/types.js';

const TZ = 'Asia/Kolkata';
export const LOAN_RATES_ALERT_SOURCE = 'loan-rates';
/** spec s5.4: raw payload kept in the DLQ, truncated to 8 KB. */
export const DLQ_EXCERPT_BYTES = 8 * 1024;

export interface LoanRatesRunOptions {
  /** Limit the run to these page readers (admin "Run now" for one source). Default: every reader. */
  readerIds?: string[];
  now?: Date;
  /** Transport seam for tests: url -> page text. Default: fetchPage with one robots cache for the run. */
  fetchHtml?: (url: string) => Promise<string>;
  /** Owner of IngestionFailure and Alert rows. Default: the oldest active ADMIN; null = log only. */
  opsUserId?: string | null;
  /**
   * Writer for LoanRateSource fetch state (lastSuccessAt / lastError*). Seam for tests that need it to fail;
   * default: one updateMany on the given ids.
   */
  updateSources?: SourceStateWriter;
}

export type SourceStateWriter = (ids: string[], data: Prisma.LoanRateSourceUpdateManyMutationInput) => Promise<unknown>;

const writeSourceState: SourceStateWriter = (ids, data) =>
  prisma.loanRateSource.updateMany({ where: { id: { in: ids } }, data });

export interface PageRunResult {
  readerId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  active: number;
  suspect: number;
  unchanged: number;
  /** Sources of this page that got no reading this run. */
  missing: string[];
  error: string | null;
}

export interface LoanRatesRunResult {
  pages: PageRunResult[];
  staleSources: string[];
  dlqRows: number;
  alerted: boolean;
}

let running = false;

/** True while a run (cron, run-now-all or run-now-single) is in progress. */
export function isLoanRatesRunning(): boolean {
  return running;
}

/**
 * Single-flight for every caller (cron, admin run-now-all, run-now-single): returns null, without fetching
 * anything, when a run is already in progress.
 */
export async function runLoanRates(options: LoanRatesRunOptions = {}): Promise<LoanRatesRunResult | null> {
  if (running) {
    logger.warn('[loanRates] run already in progress - skipping');
    return null;
  }
  running = true;
  try {
    return await runAsSystem(() => runInner(options));
  } finally {
    running = false;
  }
}

/** Cron entry point. Null when a run is already in progress. */
export async function runLoanRatesJob(): Promise<LoanRatesRunResult | null> {
  try {
    const result = await runLoanRates();
    if (result) {
      logger.info({ pages: result.pages.map((p) => `${p.readerId}:${p.status}`), stale: result.staleSources.length }, '[cron] loan rates done');
    }
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] loan rates job failed');
    throw err;
  }
}

export function startLoanRatesJob(): void {
  if (process.env.ENABLE_LOAN_RATES_CRON === 'false') {
    logger.info('[cron] loan rates job disabled via ENABLE_LOAN_RATES_CRON=false');
    return;
  }
  cron.schedule(
    '30 7 * * *',
    () => {
      runLoanRatesJob().catch((err: unknown) => logger.error({ err }, '[cron] loan rates run rejected'));
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: loan rates @07:30 IST');
}

/** Keep at most `maxBytes` of UTF-8, never ending in half a character. */
export function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.byteLength <= maxBytes) return text;
  return bytes.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/, '');
}

async function runInner(options: LoanRatesRunOptions): Promise<LoanRatesRunResult> {
  const now = options.now ?? new Date();
  await ensureLoanRateSources(true);
  const robotsCache = new Map<string, string>();
  const fetchHtml = options.fetchHtml ?? ((url: string) => fetchPage(url, { robotsCache }));
  const opsUserId = options.opsUserId !== undefined ? options.opsUserId : await resolveOpsUserId();
  const updateSources = options.updateSources ?? writeSourceState;

  const sources = await prisma.loanRateSource.findMany({ where: { mode: 'AUTO' } });
  const pages: PageRunResult[] = [];
  let dlqRows = 0;
  for (const reader of PAGE_READERS) {
    if (options.readerIds && !options.readerIds.includes(reader.id)) continue;
    const own = sources.filter((s) => s.adapter === reader.id);
    if (own.length === 0) continue;
    const outcome = await runPage(reader, own, fetchHtml, now, opsUserId, updateSources);
    pages.push(outcome.result);
    dlqRows += outcome.dlqRows;
  }

  const fresh = await prisma.loanRateSource.findMany({ where: { mode: 'AUTO' }, orderBy: { id: 'asc' } });
  const staleSources = fresh.filter((s) => isSourceStale(s, now)).map((s) => s.id);
  const alerted = staleSources.length > 0 ? await raiseStaleAlert(opsUserId, staleSources, now) : false;
  return { pages, staleSources, dlqRows, alerted };
}

async function runPage(
  reader: PageReader,
  own: LoanRateSource[],
  fetchHtml: (url: string) => Promise<string>,
  now: Date,
  opsUserId: string | null,
  updateSources: SourceStateWriter,
): Promise<{ result: PageRunResult; dlqRows: number }> {
  const ownIds = own.map((s) => s.id);
  /** Sources whose every reading on this page has been recorded. */
  const recorded = new Set<string>();
  const suspectIds = new Set<string>();
  let html = '';
  try {
    html = await fetchHtml(reader.url);
    const readings = reader.read(html).filter((r) => ownIds.includes(r.sourceId));
    if (readings.length === 0) throw new PageReadError(`No readings found on ${reader.url}`);

    const counts = { active: 0, suspect: 0, unchanged: 0 };
    for (const [i, reading] of readings.entries()) {
      const source = own.find((s) => s.id === reading.sourceId)!;
      const { outcome } = await recordReading(source, reading, reader, now);
      if (outcome === 'ACTIVE') counts.active++;
      else if (outcome === 'SUSPECT' || outcome === 'UNCHANGED_SUSPECT') {
        // A repeat of a held reading is still held: not a success.
        counts.suspect++;
        suspectIds.add(source.id);
      } else counts.unchanged++;
      if (!readings.slice(i + 1).some((r) => r.sourceId === source.id)) recorded.add(source.id);
    }

    const missing = ownIds.filter((id) => !recorded.has(id));
    await markRecorded(updateSources, recorded, suspectIds, now);
    let dlqRows = 0;
    if (missing.length > 0) {
      const message = `No reading for ${missing.join(', ')} on ${reader.url}`;
      await updateSources(missing, { lastErrorAt: now, lastError: message });
      dlqRows = await writeDlq(opsUserId, reader, message, html, missing);
    }
    return {
      result: { readerId: reader.id, status: missing.length > 0 ? 'PARTIAL' : 'OK', ...counts, missing, error: null },
      dlqRows,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, readerId: reader.id }, '[loanRates] page failed - last good rates stay displayed');
    const failedIds = ownIds.filter((id) => !recorded.has(id));
    let dlqRows = 0;
    try {
      // Readings recorded before the failure still count (a throw on the last source must not cost the others).
      await markRecorded(updateSources, recorded, suspectIds, now);
      if (failedIds.length > 0) await updateSources(failedIds, { lastErrorAt: now, lastError: message.slice(0, 500) });
      if (!isTransient(err)) dlqRows = await writeDlq(opsUserId, reader, err instanceof Error ? err : message, html, failedIds);
    } catch (recordErr) {
      logger.error({ err: recordErr, readerId: reader.id }, '[loanRates] could not record the page failure - continuing with the next page');
    }
    return {
      result: { readerId: reader.id, status: 'FAILED', active: 0, suspect: 0, unchanged: 0, missing: failedIds, error: message },
      dlqRows,
    };
  }
}

/** Fully recorded sources: a success clears any earlier error; a held (SUSPECT) one keeps its last success. */
async function markRecorded(updateSources: SourceStateWriter, recorded: Set<string>, suspectIds: Set<string>, now: Date): Promise<void> {
  const okIds = [...recorded].filter((id) => !suspectIds.has(id));
  const heldIds = [...recorded].filter((id) => suspectIds.has(id));
  if (okIds.length > 0) await updateSources(okIds, { lastSuccessAt: now, lastErrorAt: null, lastError: null });
  if (heldIds.length > 0) await updateSources(heldIds, { lastErrorAt: now, lastError: SUSPECT_ERROR });
}

const SUSPECT_ERROR = 'reading held for review (SUSPECT)';
const TRANSIENT_FETCH_CODES: ReadonlySet<string> = new Set(['ROBOTS_UNAVAILABLE', 'TIMEOUT', 'NETWORK']);

class PageReadError extends Error {}

/**
 * Transient fetch errors need no DLQ row: they set lastError only, and the 7-day stale rule alerts if they
 * persist. Everything structural (disallowed, bad status, no readings, parse errors) is DLQ-ed.
 */
function isTransient(err: unknown): boolean {
  return err instanceof FetchPageError && TRANSIENT_FETCH_CODES.has(err.code);
}

/** Visible text only (no head, scripts, styles), starting just before the first '%' token, capped at 8 KB. */
export function sanitizedExcerpt(html: string): string {
  if (html === '') return '';
  const $ = loadPage(html);
  $('head').remove();
  const text = clean($.root().text());
  const at = text.indexOf('%');
  return truncateUtf8(text.slice(at < 0 ? 0 : Math.max(0, at - 200)), DLQ_EXCERPT_BYTES);
}

async function writeDlq(
  opsUserId: string | null,
  reader: PageReader,
  error: Error | string,
  html: string,
  sourceIds: string[],
): Promise<number> {
  if (opsUserId === null) {
    logger.error({ readerId: reader.id, sourceIds }, '[loanRates] no ADMIN user to own the IngestionFailure - DLQ write skipped');
    return 0;
  }
  const row = await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: `loanrates.${reader.id}`,
    adapterVersion: reader.version,
    sourceRef: reader.url,
    error,
    // Public bank page, no PII; the excerpt is what an admin needs to see what changed.
    rawPayload: { url: reader.url, sourceIds, htmlExcerpt: sanitizedExcerpt(html) },
  });
  return row ? 1 : 0;
}

/**
 * IngestionFailure and Alert need a userId; this is fleet-wide work owned by nobody, so it is attributed to
 * the oldest active ADMIN (same rule as mfOpsAlertsJob and benchmarkPriceJob).
 */
async function resolveOpsUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/** One alert per IST day: dedupe key (userId, CUSTOM, title, triggerDate), as the other ops alerts use. */
async function raiseStaleAlert(opsUserId: string | null, staleSources: string[], now: Date): Promise<boolean> {
  const day = istDate(now);
  const title = `Loan rates stale: ${day}`;
  const description =
    `${staleSources.length} loan-rate source(s) have had no successful reading for more than ${STALE_AFTER_DAYS} days: ` +
    `${staleSources.join(', ')}. Users still see the last good rate, marked stale. Check Settings - Loan rates and the ` +
    `ingestion failures list.`;
  if (opsUserId === null) {
    logger.error({ staleSources }, `[loanRates] ${description} (no ADMIN user to alert)`);
    return false;
  }
  const triggerDate = dateOnly(day);
  const existing = await prisma.alert.findFirst({
    where: { userId: opsUserId, type: 'CUSTOM', title, triggerDate },
    select: { id: true },
  });
  if (existing === null) {
    await prisma.alert.create({
      data: {
        userId: opsUserId,
        type: 'CUSTOM',
        title,
        description,
        triggerDate,
        metadata: { source: LOAN_RATES_ALERT_SOURCE, staleSources },
      },
    });
  }
  logger.warn({ staleSources }, '[loanRates] stale sources');
  return true;
}
