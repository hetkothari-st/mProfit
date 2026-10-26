/**
 * First-deploy bootstrap: rate funds from the NAV history production already
 * holds, instead of waiting for the 15th's scheduled run.
 *
 * Runs once, in the background after the API is listening (it takes on the
 * order of an hour, which a boot script must not block). An AppSetting marker
 * makes it single-flight and run-once:
 *
 *   - DONE      → later boots skip it.
 *   - RUNNING   → another instance is on it; skipped, unless its heartbeat
 *                 (written every minute) is older than STALE_AFTER_MS — a
 *                 redeploy killed it. Then this boot takes over and resumes
 *                 after the steps already finished.
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
const STALE_AFTER_MS = 10 * 60 * 1000;
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

interface Marker {
  status?: string;
  startedAt?: string;
  heartbeatAt?: string;
  /** Steps finished by this or an earlier (interrupted) run. */
  done?: string[];
}

/**
 * Claim the marker. Returns the steps already finished (to skip), or null when
 * this process should not run.
 *
 * A RUNNING marker whose heartbeat is older than STALE_AFTER_MS belongs to a
 * process that died — in practice a redeploy, which on this project happens
 * several times a day. The first version waited six hours to take over, so a
 * run killed by a deploy sat abandoned while every later boot skipped it.
 */
async function claim(now: Date): Promise<string[] | null> {
  const fresh: Marker = { status: 'RUNNING', startedAt: now.toISOString(), heartbeatAt: now.toISOString(), done: [] };
  try {
    await prisma.appSetting.create({ data: { key: MF_BOOTSTRAP_KEY, value: fresh as object } });
    return [];
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
  const row = await prisma.appSetting.findUnique({ where: { key: MF_BOOTSTRAP_KEY } });
  const value = (row?.value ?? {}) as Marker;
  if (value.status === 'DONE') return null;
  if (value.status === 'RUNNING') {
    const beat = Date.parse(value.heartbeatAt ?? value.startedAt ?? '') || 0;
    if (now.getTime() - beat < STALE_AFTER_MS) return null;
  }
  const done = value.status === 'RUNNING' ? value.done ?? [] : [];
  await prisma.appSetting.update({
    where: { key: MF_BOOTSTRAP_KEY },
    data: { value: { ...fresh, done } as object },
  });
  return done;
}

export async function runMfBootstrapOnce(
  opts: { now?: Date; months?: number; deps?: MfBootstrapDeps; heartbeatMs?: number } = {},
): Promise<MfBootstrapResult> {
  const now = opts.now ?? new Date();
  return runAsSystem(async () => {
    const alreadyDone = await claim(now);
    if (alreadyDone === null) {
      logger.info({ key: MF_BOOTSTRAP_KEY }, '[mf] bootstrap: already done or in progress — skipping');
      return { status: 'SKIPPED' };
    }
    const months = bootstrapMonthEnds(now, opts.months ?? 1);
    const oldest = months[0]!;
    const historyStart = new Date(Date.UTC(oldest.getUTCFullYear() - 11, oldest.getUTCMonth(), 1));
    const deps = opts.deps ?? (await defaultDeps(historyStart));
    const started = Date.now();
    const done = new Set(alreadyDone);
    logger.info(
      {
        key: MF_BOOTSTRAP_KEY,
        months: months.map((d) => d.toISOString().slice(0, 10)),
        resumingAfter: [...done],
      },
      '[mf] bootstrap: start',
    );

    // Heartbeat + progress, so a run killed by a deploy is picked up by the
    // next boot from where it stopped.
    const save = async () =>
      prisma.appSetting.update({
        where: { key: MF_BOOTSTRAP_KEY },
        data: {
          value: {
            status: 'RUNNING',
            startedAt: now.toISOString(),
            heartbeatAt: new Date().toISOString(),
            done: [...done],
          } as object,
        },
      });
    const beat = setInterval(() => {
      save().catch((err: unknown) => logger.warn({ err }, '[mf] bootstrap: heartbeat write failed'));
    }, opts.heartbeatMs ?? 60_000);
    beat.unref?.();

    const skippedSteps: string[] = [];
    const step = async (name: string, fn: () => Promise<unknown>, optional = false) => {
      if (done.has(name)) return;
      try {
        await fn();
      } catch (err) {
        if (!optional) throw err;
        skippedSteps.push(name);
        logger.warn({ err, step: name }, '[mf] bootstrap: optional step failed — continuing');
      }
      done.add(name);
      await save();
    };

    try {
      await step('metadata', deps.metadata);
      await step('benchmarks', deps.benchmarks);
      await step('riskFree', deps.riskFree);
      await step('navHistory', deps.navHistory, true);
      await step('navAdjustment', deps.navAdjustment);

      // Rate before factsheets: no rating-required pillar needs them, and the
      // factsheet pass is the slow, failure-heavy one (one DLQ row per scheme
      // whose AMC page is missing) — it must not stand between users and
      // ratings.
      const rated: string[] = [];
      const notRated: string[] = [];
      for (const asOf of months) {
        const iso = asOf.toISOString().slice(0, 10);
        const key = `rate:${iso}`;
        if (done.has(key)) {
          rated.push(iso);
          continue;
        }
        if (await deps.ratingChain(asOf)) {
          rated.push(iso);
          done.add(key);
          await save();
        } else {
          notRated.push(iso);
        }
      }

      await step('factsheets', deps.factsheets, true);

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
    } finally {
      clearInterval(beat);
    }
  });
}
