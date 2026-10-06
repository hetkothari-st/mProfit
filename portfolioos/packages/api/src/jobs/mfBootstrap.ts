/**
 * First-deploy bootstrap: rate funds from the NAV history production already
 * holds, instead of waiting for the 15th's scheduled run.
 *
 * Runs once, in the background after the API is listening (it takes on the
 * order of an hour, which a boot script must not block). An AppSetting marker
 * makes it single-flight and run-once:
 *
 *   - DONE      → later boots skip it.
 *   - RUNNING   → another instance (or this one before a restart) is on it;
 *                 skipped, unless it started more than STALE_AFTER_MS ago — a
 *                 redeploy kills the process mid-run and nothing else would
 *                 ever finish it.
 *   - FAILED    → retried on the next boot.
 *
 * Inputs first, in dependency order, then the rating chain for each requested
 * month-end, oldest first.
 *
 * REQUIRED (a failure stops the run, marks it FAILED, retries next boot):
 *   - scheme metadata — without it there is no universe;
 *   - benchmark and risk-free history over the full window — the nightly jobs
 *     only fetch 45/90 days into an empty table, and the 3/5/10-year metrics
 *     behind the PERFORMANCE and TRACKING pillars need years of both;
 *   - the IDCW NAV adjustment — without it every IDCW fund's returns are
 *     understated by its distributions: a wrong rating, worse than none.
 * BEST-EFFORT: the NAV history top-up (production already holds most of it)
 * and factsheets (cost data; no rating-required pillar depends on it).
 *
 * Bump MF_BOOTSTRAP_KEY to run it again after a change that invalidates the
 * stored ratings.
 */
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';

export const MF_BOOTSTRAP_KEY = 'mf.bootstrap.2026-10-v1';
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
export const MAX_BOOTSTRAP_MONTHS = 12;

export interface MfBootstrapDeps {
  metadata: () => Promise<unknown>;
  benchmarks: () => Promise<unknown>;
  riskFree: () => Promise<unknown>;
  navHistory: () => Promise<unknown>;
  navAdjustment: () => Promise<unknown>;
  factsheets: () => Promise<unknown>;
  /** Rate one month-end. Returns false when the chain declined to score. */
  ratingChain: (asOf: Date) => Promise<boolean>;
}

export interface MfBootstrapResult {
  status: 'DONE' | 'SKIPPED' | 'FAILED';
  rated?: string[];
  notRated?: string[];
  skippedSteps?: string[];
  error?: string;
}

/** The last `months` month-ends before `now`, oldest first. */
export function bootstrapMonthEnds(now: Date, months: number): Date[] {
  const n = Math.max(1, Math.min(MAX_BOOTSTRAP_MONTHS, Math.floor(months)));
  const out: Date[] = [];
  for (let i = n; i >= 1; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)));
  }
  return out;
}

async function defaultDeps(historyStart: Date): Promise<MfBootstrapDeps> {
  const [metadata, bench, rfr, history, adjust, factsheet, chain] = await Promise.all([
    import('./mfMetadataJob.js'),
    import('./benchmarkPriceJob.js'),
    import('./riskFreeRateJob.js'),
    import('./mfNavHistoryBackfillJob.js'),
    import('./mfNavAdjustmentJob.js'),
    import('./mfFactsheetJob.js'),
    import('./mfMonthlyRatingChain.js'),
  ]);
  return {
    metadata: () => metadata.runMfMetadataJob(),
    // Ten-year horizon plus a year of slack before the oldest month rated.
    benchmarks: () => bench.runBenchmarkPrices({ from: historyStart, fullRange: true }),
    riskFree: () => rfr.runRiskFreeRates({ from: historyStart, fullRange: true }),
    // Only schemes short of three years of NAVs; production already holds
    // most of the history. Bounded so a slow source cannot hold up ratings.
    navHistory: () =>
      history.runMfNavHistoryBackfill({ skipIfNavRowsAtLeast: 750, maxRunMs: 45 * 60_000 }),
    navAdjustment: () => adjust.runMfNavAdjustment(),
    factsheets: () => factsheet.runMfFactsheetJob(),
    ratingChain: (asOf) => chain.runRatingChainFor(asOf),
  };
}

/** Claim the marker. True when this process should run the bootstrap. */
async function claim(now: Date): Promise<boolean> {
  const running = { status: 'RUNNING', startedAt: now.toISOString() };
  try {
    await prisma.appSetting.create({ data: { key: MF_BOOTSTRAP_KEY, value: running } });
    return true;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
  const row = await prisma.appSetting.findUnique({ where: { key: MF_BOOTSTRAP_KEY } });
  const value = (row?.value ?? {}) as { status?: string; startedAt?: string };
  if (value.status === 'DONE') return false;
  if (value.status === 'RUNNING') {
    const started = value.startedAt ? Date.parse(value.startedAt) : 0;
    if (now.getTime() - started < STALE_AFTER_MS) return false;
  }
  await prisma.appSetting.update({ where: { key: MF_BOOTSTRAP_KEY }, data: { value: running } });
  return true;
}

export async function runMfBootstrapOnce(
  opts: { now?: Date; months?: number; deps?: MfBootstrapDeps } = {},
): Promise<MfBootstrapResult> {
  const now = opts.now ?? new Date();
  return runAsSystem(async () => {
    if (!(await claim(now))) {
      logger.info({ key: MF_BOOTSTRAP_KEY }, '[mf] bootstrap: already done or in progress — skipping');
      return { status: 'SKIPPED' };
    }
    const months = bootstrapMonthEnds(now, opts.months ?? 1);
    const oldest = months[0]!;
    const historyStart = new Date(Date.UTC(oldest.getUTCFullYear() - 11, oldest.getUTCMonth(), 1));
    const deps = opts.deps ?? (await defaultDeps(historyStart));
    const started = Date.now();
    logger.info(
      { key: MF_BOOTSTRAP_KEY, months: months.map((d) => d.toISOString().slice(0, 10)) },
      '[mf] bootstrap: start',
    );

    const skippedSteps: string[] = [];
    const best = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        skippedSteps.push(name);
        logger.warn({ err, step: name }, '[mf] bootstrap: optional step failed — continuing');
      }
    };

    try {
      await deps.metadata();
      await deps.benchmarks();
      await deps.riskFree();
      await best('navHistory', deps.navHistory);
      await deps.navAdjustment();
      await best('factsheets', deps.factsheets);

      const rated: string[] = [];
      const notRated: string[] = [];
      for (const asOf of months) {
        const iso = asOf.toISOString().slice(0, 10);
        ((await deps.ratingChain(asOf)) ? rated : notRated).push(iso);
      }

      const result: MfBootstrapResult = { status: 'DONE', rated, notRated, skippedSteps };
      await prisma.appSetting.update({
        where: { key: MF_BOOTSTRAP_KEY },
        data: { value: { ...result, finishedAt: new Date().toISOString(), ms: Date.now() - started } },
      });
      logger.info({ ...result, ms: Date.now() - started }, '[mf] bootstrap: done');
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await prisma.appSetting.update({
        where: { key: MF_BOOTSTRAP_KEY },
        data: { value: { status: 'FAILED', error, failedAt: new Date().toISOString() } },
      });
      logger.error({ err }, '[mf] bootstrap: failed — will retry on the next boot');
      return { status: 'FAILED', error, skippedSteps };
    }
  });
}
