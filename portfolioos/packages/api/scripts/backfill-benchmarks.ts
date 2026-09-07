/**
 * Ten-year backfill for every seeded benchmark index plus the risk-free series
 * — `07-IMPLEMENTATION-PLAN.md` Task 1.3 ("backfill script for 10 years
 * (`scripts/backfill-benchmarks.ts`)"; done when "backfill populates >= 10y for
 * all seeded indices locally").
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/backfill-benchmarks.ts
 *
 * Options (env):
 *   BACKFILL_YEARS=10          how far back to go
 *   BACKFILL_INDEX_CODES=A,B   restrict to these codes
 *   BACKFILL_OPS_USER_ID       owner of the IngestionFailure rows written
 *   BACKFILL_FROM_SCRATCH=1    ignore per-index resume points, re-fetch the lot
 *   BACKFILL_SKIP_RISK_FREE=1  indices only
 *   BACKFILL_DRY_RUN=1         report current coverage and exit
 *
 * The work itself is `runBenchmarkPrices` / `runRiskFreeRates` — the same code
 * paths the nightly and weekly jobs use, so the backfill cannot drift from the
 * jobs. This script only widens the window, raises the wall-clock budget, and
 * prints a summary.
 *
 * RE-RUNNABLE AND RESUMABLE BY CONSTRUCTION. Every write is an upsert on the
 * natural key plus a value-diff, so re-running writes nothing new; and each
 * index is processed independently, resuming from its own latest stored
 * observation, so a run that dies (or is killed) halfway leaves a correct
 * prefix that the next run continues from. `BACKFILL_FROM_SCRATCH=1` forces the
 * full window when you actually want to re-verify old rows against the source.
 *
 * HONESTY ABOUT WHAT THIS CAN POPULATE. Several seeded codes have no verified
 * free daily TRI download (`BENCHMARK_TRI_NOT_FREELY_AVAILABLE`), and the
 * `.v1.ts` fetchers' URLs are themselves marked UNVERIFIED. The summary below
 * therefore states plainly, per index, whether anything came back — an index
 * reported as `NOTHING RETURNED` is information, not a silent zero. Reporting
 * "success, 0 rows" for a feed we cannot reach is how a benchmark ends up
 * quietly missing from the ratings for a year.
 */

import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import {
  runBenchmarkPrices,
  type BenchmarkIndexRunSummary,
} from '../src/jobs/benchmarkPriceJob.js';
import {
  runRiskFreeRates,
  DEFAULT_RISK_FREE_SERIES,
  type RiskFreeRateJobResult,
} from '../src/jobs/riskFreeRateJob.js';
import { BENCHMARK_TRI_NOT_FREELY_AVAILABLE } from '../src/priceFeeds/benchmarkIndexSeed.js';

const YEARS = Number.parseInt(process.env.BACKFILL_YEARS ?? '10', 10);
const DAY_MS = 86_400_000;

/**
 * One index at a time gets a generous budget. The nightly job is capped at ~5
 * minutes because it must fit inside Bull's lock window; a backfill is a
 * one-shot operator action with nothing waiting on its lock, so the cap only
 * exists to stop a hung socket running until morning.
 */
const PER_INDEX_BUDGET_MS = 30 * 60 * 1000;

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function padStart(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

interface Coverage {
  code: string;
  rows: number;
  earliest: string | null;
  latest: string | null;
}

async function indexCoverage(codes: readonly string[]): Promise<Coverage[]> {
  return runAsSystem(async () => {
    const out: Coverage[] = [];
    for (const code of codes) {
      const rows = await prisma.benchmarkIndexPrice.count({ where: { indexCode: code } });
      const first = await prisma.benchmarkIndexPrice.findFirst({
        where: { indexCode: code },
        orderBy: { date: 'asc' },
        select: { date: true },
      });
      const last = await prisma.benchmarkIndexPrice.findFirst({
        where: { indexCode: code },
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      out.push({
        code,
        rows,
        earliest: first ? first.date.toISOString().slice(0, 10) : null,
        latest: last ? last.date.toISOString().slice(0, 10) : null,
      });
    }
    return out;
  });
}

async function main(): Promise<void> {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - YEARS * 365.25 * DAY_MS);
  const fromScratch = process.env.BACKFILL_FROM_SCRATCH === '1';
  const opsUserId = process.env.BACKFILL_OPS_USER_ID;

  const restrict = process.env.BACKFILL_INDEX_CODES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const seeded = await runAsSystem(() =>
    prisma.benchmarkIndex.findMany({
      where: restrict ? { code: { in: restrict } } : undefined,
      select: { code: true, provider: true },
      orderBy: { code: 'asc' },
    }),
  );

  if (seeded.length === 0) {
    console.error(
      '[fatal] No BenchmarkIndex rows. Apply migration 20260904180000_benchmark_index_seed first.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[plan]  ${seeded.length} seeded index/indices, window ${from.toISOString().slice(0, 10)} .. ${to.toISOString().slice(0, 10)} (${YEARS}y)` +
      `${fromScratch ? ', FROM SCRATCH (resume points ignored)' : ', resuming from each index’s latest stored row'}`,
  );

  const before = await indexCoverage(seeded.map((s) => s.code));
  console.log('[pre]   current coverage:');
  for (const c of before) {
    console.log(
      `          ${pad(c.code, 42)} rows=${padStart(String(c.rows), 6)}  ${c.earliest ?? '   —   '} .. ${c.latest ?? '   —   '}`,
    );
  }

  if (process.env.BACKFILL_DRY_RUN === '1') {
    console.log('[dry-run] BACKFILL_DRY_RUN=1 — no fetches, no writes.');
    return;
  }

  // One index per call. A per-index invocation means a failure, a hang or a
  // Ctrl-C costs one index, not the whole run, and the summary can attribute
  // every number to the index that produced it.
  const summaries: BenchmarkIndexRunSummary[] = [];
  const t0 = Date.now();

  for (const index of seeded) {
    process.stdout.write(`[fetch] ${pad(index.code, 42)} `);
    const r = await runBenchmarkPrices({
      indexCodes: [index.code],
      from,
      to,
      fullRange: fromScratch,
      maxRunMs: PER_INDEX_BUDGET_MS,
      ...(opsUserId ? { opsUserId } : {}),
      // The staleness alert is the nightly job's business. A backfill of a
      // decade-old window would otherwise raise an alert for every index whose
      // feed we already know we do not have, which is precisely the noise
      // `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` exists to prevent.
      staleBusinessDayThreshold: Number.MAX_SAFE_INTEGER,
    });
    const s = r.indices[0];
    if (!s) {
      console.log('no summary returned (index vanished mid-run?)');
      continue;
    }
    summaries.push(s);
    console.log(
      `${pad(s.status, 24)} seen=${padStart(String(s.rowsSeen), 5)} ins=${padStart(String(s.rowsInserted), 5)} upd=${padStart(String(s.rowsUpdated), 5)} skip=${padStart(String(s.rowsSkipped), 5)} bad=${padStart(String(s.rowsFailed), 4)}`,
    );
  }

  let riskFree: RiskFreeRateJobResult | null = null;
  if (process.env.BACKFILL_SKIP_RISK_FREE !== '1') {
    process.stdout.write(`[fetch] ${pad(DEFAULT_RISK_FREE_SERIES + ' (risk-free)', 42)} `);
    riskFree = await runRiskFreeRates({
      from,
      to,
      fullRange: fromScratch,
      ...(opsUserId ? { opsUserId } : {}),
    });
    console.log(
      `${pad(riskFree.status, 24)} seen=${padStart(String(riskFree.rowsSeen), 5)} ins=${padStart(String(riskFree.rowsInserted), 5)} upd=${padStart(String(riskFree.rowsUpdated), 5)} skip=${padStart(String(riskFree.rowsSkipped), 5)} bad=${padStart(String(riskFree.rowsFailed), 4)}`,
    );
  }

  const after = await indexCoverage(seeded.map((s) => s.code));
  const afterByCode = new Map(after.map((c) => [c.code, c]));
  const knownUnavailable = new Set(BENCHMARK_TRI_NOT_FREELY_AVAILABLE);

  console.log('');
  console.log('==================== backfill summary ====================');
  console.log(
    `  window            ${from.toISOString().slice(0, 10)} .. ${to.toISOString().slice(0, 10)}  (${YEARS}y)`,
  );
  console.log(`  elapsed           ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('');
  console.log(
    `  ${pad('index', 42)} ${pad('status', 24)} ${padStart('seen', 6)} ${padStart('ins', 6)} ${padStart('skip', 6)} ${padStart('bad', 5)}  coverage`,
  );

  const populated: string[] = [];
  const empty: string[] = [];

  for (const s of summaries) {
    const cov = afterByCode.get(s.code);
    const rows = cov?.rows ?? 0;
    if (rows > 0) populated.push(s.code);
    else empty.push(s.code);
    console.log(
      `  ${pad(s.code, 42)} ${pad(s.status, 24)} ${padStart(String(s.rowsSeen), 6)} ${padStart(String(s.rowsInserted), 6)} ${padStart(String(s.rowsSkipped), 6)} ${padStart(String(s.rowsFailed), 5)}  ` +
        (rows > 0
          ? `${rows} rows, ${cov?.earliest} .. ${cov?.latest}`
          : 'NOTHING RETURNED — 0 rows stored'),
    );
    if (s.failureReason) {
      console.log(`  ${' '.repeat(42)} └─ ${s.failureReason.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }

  console.log('');
  console.log(`  populated         ${populated.length}/${summaries.length}`);
  if (empty.length > 0) {
    console.log('');
    console.log('  THESE INDICES RETURNED NOTHING — no rows are stored for them:');
    for (const code of empty) {
      console.log(
        `    - ${pad(code, 42)} ${
          knownUnavailable.has(code)
            ? 'EXPECTED: listed in BENCHMARK_TRI_NOT_FREELY_AVAILABLE (no free daily TRI source).'
            : 'UNEXPECTED: a feed we believe should work did not return data. Check /ops/ingestion-failures.'
        }`,
      );
    }
    console.log('');
    console.log(
      '  Schemes benchmarked against an empty index must degrade to BENCHMARK_UNAVAILABLE',
    );
    console.log(
      '  (02-METRICS.md §1) — never compare against nothing and never substitute another index.',
    );
  }

  if (riskFree) {
    console.log('');
    console.log(
      `  risk-free ${DEFAULT_RISK_FREE_SERIES}: ${riskFree.status}, ${riskFree.rowsSeen} observed row(s), latest ${riskFree.latestDate ?? 'NONE'}`,
    );
    if (riskFree.failureReason) {
      console.log(`    └─ ${riskFree.failureReason.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
    console.log(
      '    Only OBSERVED weekly rows are stored. Forward-filling to daily happens in the',
    );
    console.log('    math layer at read time (01 §3) — never here.');
  }

  console.log('');
  console.log(
    '  NOTE: every URL in nseIndices.v1.ts / bseIndices.v1.ts / rbiRiskFree.v1.ts is marked',
  );
  console.log(
    '  UNVERIFIED. A run that populates nothing is far more likely to be a wrong endpoint',
  );
  console.log('  than an absent market. Verify against the live sources before trusting these.');
  console.log('==========================================================');
}

main()
  .catch((err: unknown) => {
    // Rethrowing here would print an unhandled-rejection trace with no context;
    // logging and setting a non-zero exit code is the useful behaviour for an
    // operator script, and the error itself is still printed in full.
    console.error('[fatal] backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
