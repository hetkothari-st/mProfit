/**
 * Repair the window where the AMFI NAV sync imported nothing.
 *
 * AMFI added Plan and Option columns to NAVAll.txt. The parser read "Direct
 * Plan" where the NAV belonged, every row failed `isNaN(Number(nav))`, and the
 * job reported success while writing zero rows. MFNav simply stopped growing,
 * and every mutual-fund valuation in that period was carried at a stale NAV.
 *
 * This script does three things, in order, and prints what it found:
 *
 *   1. DETECT  — reads MFNav day counts (and FeedRunLog, where it exists) to
 *                find the first date the sync went quiet and the last one.
 *   2. BACKFILL — pulls AMFI's historical NAV report for that window, month by
 *                month, and upserts MFNav. Idempotent: the unique key is
 *                (fundId, date), so a second run writes the same rows.
 *   3. FLAG    — marks NetWorthSnapshot rows in the window as ESTIMATED.
 *                It does NOT recompute them, and it never touches the stored
 *                totals. getDashboardNetWorth() reads live HoldingProjection
 *                and takes no asOf, so there is no way to recompute what a
 *                past day was worth; overwriting those numbers with today's
 *                would be inventing history. See §"Never silently overwrite".
 *
 * Usage
 *   pnpm --filter @everypaisa/api tsx src/scripts/backfillAmfiNavGap.ts
 *   ... --from 2026-08-01 --to 2026-09-17   # explicit window
 *   ... --dry-run                           # detect and report, write nothing
 *   ... --detect-only                       # just the gap report
 *
 * Connects as the APPLICATION role by default (see lib/opsDatabase.ts). MFNav
 * is market data with no owner and needs nothing more. The NetWorthSnapshot
 * flagging DOES span every user, so that step runs inside `runAsSystem`
 * explicitly rather than relying on the connection's privileges — which is
 * what silently made this a superuser script before.
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { opsPrisma } from '../lib/opsDatabase.js';
import { runAsSystem } from '../lib/requestContext.js';
import {
  fetchAmfiNavHistory,
  parseAmfiNavHistoryText,
} from '../priceFeeds/amfiNavHistory.js';
import { findNavGap, monthWindows, type DayCount } from '../priceFeeds/amfiNavGap.js';
import { buildTradingCalendar } from '../services/advisor/fundRanking/navGaps.js';
import { judgeCalendar } from '../services/advisor/fundRanking/calendarIntegrity.js';

/** The window the fund-scoring engine reads. Kept in step with
 *  scoringRun.service.ts's NAV_LOOKBACK_YEARS. */
const NAV_SCORING_WINDOW_YEARS = 5;

const { prisma: prisma, disconnect } = opsPrisma();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function readDayCounts(): Promise<DayCount[]> {
  const rows = await prisma.$queryRaw<{ date: Date; funds: bigint }[]>`
    SELECT "date", COUNT(DISTINCT "fundId") AS funds
    FROM "MFNav"
    GROUP BY "date"
    ORDER BY "date" ASC
  `;
  // eslint-disable-next-line everypaisa/no-money-coercion -- a COUNT(*), not money
  return rows.map((r) => ({ date: r.date, funds: Number(r.funds) }));
}

/**
 * What the run log says, when there is one. FeedRunLog only starts recording
 * from the deploy that introduced it, so on a database that predates the
 * canary this returns nothing — the MFNav day counts are the evidence that
 * goes back far enough.
 */
async function readFeedLogEvidence(): Promise<string> {
  const zeroRuns = await prisma.feedRunLog.findMany({
    where: { feed: 'amfi_nav', rowsImported: 0 },
    orderBy: { startedAt: 'asc' },
    take: 1,
  });
  if (zeroRuns.length === 0) {
    return 'FeedRunLog has no zero-import amfi_nav run (the table postdates the outage)';
  }
  return `FeedRunLog: first zero-import amfi_nav run at ${zeroRuns[0]!.startedAt.toISOString()}`;
}

// ─── 2. Backfill ────────────────────────────────────────────────────

export interface BackfillResult {
  /** Tags every row this run INSERTS. Reversal is a delete by this id. */
  batchId: string;
  monthsFetched: number;
  rowsParsed: number;
  parseFailures: number;
  /** Rows actually inserted. Existing rows are left untouched. */
  navsWritten: number;
  /** Rows the report carried that were already in the table. */
  rowsAlreadyPresent: number;
  unknownSchemeCodes: Set<string>;
  datesCovered: Set<string>;
  /** Months that failed twice. The rest of the run continued. */
  failedMonths: Array<{ month: string; reason: string }>;
}

/**
 * Pause between write chunks, so a long backfill does not crowd out the live
 * app's request traffic — and the chunk size it pauses between.
 *
 * Both are tunable because the right values depend entirely on where the
 * script runs. Inside the API container, on the private network, 2,000-row
 * chunks with a 120ms pause sustained ~53,000 rows/min while leaving the app
 * responsive. Run from a laptop through Railway's public TCP proxy, every
 * chunk pays an internet round-trip instead: the same settings managed only
 * ~6,300 rows/min, which turns a one-hour job into a nine-hour one.
 *
 * Over the proxy the round-trip IS the throttle, so the pause buys nothing
 * and larger chunks amortise the latency. Defaults are the container values;
 * BACKFILL_CHUNK_SIZE and BACKFILL_CHUNK_PAUSE_MS override them.
 */
const CHUNK_PAUSE_MS = Number.parseInt(process.env.BACKFILL_CHUNK_PAUSE_MS ?? '120', 10);
const MONTH_PAUSE_MS = 1_000;
const RETRY_PAUSE_MS = 5_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function backfillWindow(from: Date, to: Date, dryRun: boolean): Promise<BackfillResult> {
  const result: BackfillResult = {
    batchId: `amfi-hist-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    monthsFetched: 0,
    rowsParsed: 0,
    parseFailures: 0,
    navsWritten: 0,
    rowsAlreadyPresent: 0,
    unknownSchemeCodes: new Set(),
    datesCovered: new Set(),
    failedMonths: [],
  };

  // schemeCode → MutualFundMaster.id. A code we have never seen is not
  // created here: this script repairs NAV history, it does not invent funds.
  const masters = await prisma.mutualFundMaster.findMany({
    select: { id: true, schemeCode: true },
  });
  const idByCode = new Map(masters.map((m) => [m.schemeCode, m.id]));
  console.log(`[backfill] ${idByCode.size} known scheme codes`);

  const batchId = result.batchId;
  console.log(`[backfill] batch id ${batchId}`);

  for (const w of monthWindows(from, to)) {
    const label = `${iso(w.from)}..${iso(w.to)}`;
    const startedAt = new Date();

    // One FeedRunLog row per month, so progress and failure are visible from
    // the ops page while this is still running — a backfill that takes hours
    // and reports only at the end is a backfill nobody can supervise.
    const runRow = dryRun
      ? null
      : await prisma.feedRunLog.create({
          data: {
            feed: 'amfi_nav_backfill',
            startedAt,
            status: 'RUNNING',
            reason: `month ${label}`,
            details: { batchId, month: label },
          },
        });

    let parsed: ReturnType<typeof parseAmfiNavHistoryText> | null = null;
    // Fetch, and retry ONCE. A month that fails twice is recorded and the
    // rest continue: one unreadable month should not cost the other sixty.
    for (let attempt = 1; attempt <= 2 && parsed === null; attempt++) {
      try {
        console.log(`[backfill] fetching ${label}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`);
        const text = await fetchAmfiNavHistory(w.from, w.to);
        const p = parseAmfiNavHistoryText(text);
        if (p.rows.length === 0 && p.dataLines > 0) {
          throw new Error(`parsed 0 of ${p.dataLines} data lines`);
        }
        parsed = p;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (attempt === 2) {
          result.failedMonths.push({ month: label, reason });
          console.log(`[backfill]   FAILED ${label}: ${reason}`);
          if (runRow) {
            await prisma.feedRunLog.update({
              where: { id: runRow.id },
              data: { status: 'FAILED', finishedAt: new Date(), reason },
            });
          }
        } else {
          console.log(`[backfill]   ${label} failed (${reason}) — retrying once`);
          await sleep(RETRY_PAUSE_MS);
        }
      }
    }
    if (parsed === null) continue;

    result.monthsFetched++;
    result.rowsParsed += parsed.rows.length;
    result.parseFailures += parsed.parseFailures;
    console.log(
      `[backfill]   ${parsed.rows.length} rows, ${parsed.parseFailures} unreadable ` +
        `of ${parsed.dataLines} data lines`,
    );

    // A month's report is one row per scheme per day. Keep only the dates
    // inside the requested window and the schemes we actually track.
    const writes: { fundId: string; date: Date; nav: Prisma.Decimal }[] = [];
    for (const row of parsed.rows) {
      if (row.date < from || row.date > to) continue;
      const fundId = idByCode.get(row.schemeCode);
      if (!fundId) {
        result.unknownSchemeCodes.add(row.schemeCode);
        continue;
      }
      result.datesCovered.add(iso(row.date));
      writes.push({ fundId, date: row.date, nav: new Prisma.Decimal(row.nav) });
    }

    if (dryRun) {
      console.log(`[backfill]   dry run — would insert up to ${writes.length} NAV rows`);
      result.navsWritten += writes.length;
      continue;
    }

    // INSERT ONLY, never overwrite.
    //
    // `createMany({ skipDuplicates: true })` leaves an existing (fundId,date)
    // exactly as it is. That matters for two reasons: a NAV already recorded
    // by the nightly sync is the one that was actually published that day and
    // must not be restated from a historical report, and a row the backfill
    // did not create must never carry this batch id — otherwise reversing the
    // batch would delete data the backfill never added.
    const CHUNK = Number.parseInt(process.env.BACKFILL_CHUNK_SIZE ?? '2000', 10);
    let inserted = 0;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const slice = writes.slice(i, i + CHUNK);
      const res = await prisma.mFNav.createMany({
        data: slice.map((x) => ({ ...x, backfillBatchId: batchId })),
        skipDuplicates: true,
      });
      inserted += res.count;
      result.navsWritten += res.count;
      result.rowsAlreadyPresent += slice.length - res.count;
      // Throttle: this runs against the live database while people are using
      // the app. A short pause between chunks keeps the write load from
      // crowding out request traffic.
      await sleep(CHUNK_PAUSE_MS);
    }
    console.log(
      `[backfill]   inserted ${inserted}, already present ${writes.length - inserted}`,
    );
    if (runRow) {
      await prisma.feedRunLog.update({
        where: { id: runRow.id },
        data: {
          status: 'OK',
          finishedAt: new Date(),
          rowsParsed: parsed.dataLines,
          rowsImported: inserted,
          parseFailures: parsed.parseFailures,
          reason: null,
          details: {
            batchId,
            month: label,
            alreadyPresent: writes.length - inserted,
          },
        },
      });
    }
    await sleep(MONTH_PAUSE_MS);
  }

  return result;
}

// ─── 3. Flag ────────────────────────────────────────────────────────

const FLAG_REASON =
  'Mutual fund NAVs did not reach us on this date, so this figure was ' +
  'calculated from the last prices we had. Treat it as an estimate.';

/**
 * Flag the snapshots in the window.
 *
 * Wrapped in `runAsSystem` because `NetWorthSnapshot` is user-scoped and this
 * crosses every tenant. It used to work only because the connection happened
 * to be the owner role — which meant a read-only sizing check on the app role
 * reported ZERO rows in the same window this then modified 303 of. Saying so
 * explicitly is the difference between a decision and an accident.
 */
async function flagSnapshots(from: Date, to: Date, dryRun: boolean) {
  return runAsSystem(() => flagSnapshotsInner(from, to, dryRun));
}

async function flagSnapshotsInner(from: Date, to: Date, dryRun: boolean) {
  const where = {
    asOf: { gte: from, lte: to },
    // Never re-stamp a row that is already flagged: dataQualityAt is the
    // audit trail of when we first knew, and moving it loses that.
    dataQuality: 'OK',
  };
  const affected = await prisma.netWorthSnapshot.findMany({
    where,
    select: { id: true, userId: true, asOf: true },
  });
  if (dryRun) {
    console.log(`[flag] dry run — would flag ${affected.length} snapshots as ESTIMATED`);
    return affected;
  }
  // Only the three quality columns are written. The totals are left exactly
  // as they were recorded: they are the record of what the user was shown.
  const { count } = await prisma.netWorthSnapshot.updateMany({
    where,
    data: {
      dataQuality: 'ESTIMATED',
      dataQualityReason: FLAG_REASON,
      dataQualityAt: new Date(),
    },
  });
  console.log(`[flag] flagged ${count} snapshots as ESTIMATED (totals untouched)`);
  return affected;
}

// ─── main ───────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const dryRun = hasFlag('dry-run');
  const detectOnly = hasFlag('detect-only');

  console.log('─── AMFI NAV gap ───────────────────────────────────');
  console.log(await readFeedLogEvidence());

  const days = await readDayCounts();
  const detected = findNavGap(days);
  console.log(`MFNav evidence: ${detected.basis}`);
  if (detected.start && detected.end) {
    console.log(
      `Gap: ${iso(detected.start)} → ${iso(detected.end)} ` +
        `(${detected.emptyDays} empty days, ${detected.thinDays} thin days)`,
    );
  } else {
    console.log('No gap detected from MFNav day counts.');
  }

  const fromArg = arg('from');
  const toArg = arg('to');

  // The whole scoring window plus a buffer, for a database whose NAV history
  // is too sparse for the gap detector to bound anything — which is the state
  // production was in: 314 trading days across five years, so "the gap" was
  // most of the history and there was no healthy day on either side of it.
  const fullHistory = hasFlag('full-history');
  const bufferMonths = Number.parseInt(arg('buffer-months') ?? '3', 10);
  let from = fromArg ? utcDay(fromArg) : detected.start;
  let to = toArg ? utcDay(toArg) : detected.end;
  if (fullHistory) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - NAV_SCORING_WINDOW_YEARS);
    start.setUTCMonth(start.getUTCMonth() - bufferMonths);
    from = start;
    to = end;
    console.log(
      `
Full history requested: ${NAV_SCORING_WINDOW_YEARS} year scoring window ` +
        `plus ${bufferMonths} months of buffer.`,
    );
  }

  if (detectOnly) return;
  if (!from || !to) {
    console.log('Nothing to backfill. Pass --from/--to to force a window.');
    return;
  }

  console.log(`\n─── Backfill ${iso(from)} → ${iso(to)} ${dryRun ? '(dry run)' : ''} ───`);
  const backfilled = await backfillWindow(from, to, dryRun);
  console.log(
    `\nBackfilled ${backfilled.navsWritten} NAV rows across ${backfilled.datesCovered.size} dates ` +
      `from ${backfilled.monthsFetched} monthly reports ` +
      `(${backfilled.parseFailures} unreadable lines, ` +
      `${backfilled.unknownSchemeCodes.size} scheme codes we do not track).`,
  );

  console.log(`\n─── Snapshots ───`);
  const affected = await flagSnapshots(from, to, dryRun);
  const users = new Set(affected.map((a) => a.userId));
  console.log(
    `${affected.length} NetWorthSnapshot rows across ${users.size} users fall in the window.`,
  );
  console.log(
    'They are flagged, not recomputed: getDashboardNetWorth() has no asOf, so a ' +
      'past day cannot be revalued without stamping today onto it.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
