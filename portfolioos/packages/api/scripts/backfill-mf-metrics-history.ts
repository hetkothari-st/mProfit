/**
 * Historical `MfSchemeMetrics` backfill — the input the Task 2.7 backtest
 * needs and that nothing currently produces.
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/backfill-mf-metrics-history.ts
 *
 * Options (env):
 *   MFMH_FIRST_MONTH      first month-end, YYYY-MM-DD (default 2016-01-31)
 *   MFMH_LAST_MONTH       last month-end (default: the last completed month)
 *   MFMH_SCHEME_CODES     comma-separated scheme codes; overrides selection
 *   MFMH_SCHEME_LIMIT     cap the scheme cross-section
 *   MFMH_ONLY_WITH_NAV=1  restrict to schemes that actually have MFNav rows
 *                         (default 1 — see "WHY THIS DEFAULTS ON")
 *   MFMH_INCLUDE_DEAD=0   exclude non-ACTIVE schemes (default: INCLUDE them —
 *                         see "SURVIVORSHIP BIAS", this is the whole point)
 *   MFMH_MAX_RUN_MS       wall-clock ceiling; the run stops on a month boundary
 *   MFMH_RESUME=0         recompute months that already have rows (default: skip)
 *   MFMH_DRY_RUN=1        print the plan and exit
 *
 * ===========================================================================
 * WHY THIS SCRIPT EXISTS
 * ===========================================================================
 *
 * `mfMetricsJob` computes metrics at ONE `asOf` — today's. Run nightly, it
 * produces a rolling window of recent rows and nothing else. The backtest
 * (`scripts/mf-backtest.ts`) needs the opposite shape: a metrics row at every
 * MONTH-END going back to 2016, so it can rank a cross-section as it would
 * have looked at each historical date and then measure what happened over the
 * following three years.
 *
 * There is no way to derive those rows later. A metric at 2016-01-31 is a
 * function of the NAV series up to 2016-01-31; computing it in 2026 from
 * today's row is not an approximation, it is impossible. So the backtest
 * cannot run at all until something writes them, and that something is this.
 *
 * The compute itself is NOT reimplemented here. `runMfMetricsJob` already
 * accepts an `asOf`, and `computeMetricsForScheme` reads every input with
 * `lte: asOf` (NAV, benchmark, risk-free, TER, AUM), so it is already
 * lookahead-free at a past date. This script is a driver: it decides WHICH
 * dates and WHICH schemes, and it exists as a script rather than a cron
 * because it is a one-time historical fill, not a recurring operation.
 *
 * ===========================================================================
 * MONTH-ENDS MUST MATCH THE BACKTEST'S, EXACTLY
 * ===========================================================================
 *
 * `mf-backtest.ts` selects rows with
 *   `asOf > t − METRIC_STALENESS_DAYS AND asOf <= t`,  staleness = 10 days,
 * where `t = new Date(Date.UTC(year, monthIndex + 1, 0))` — the last calendar
 * day of the month at UTC midnight.
 *
 * `monthEnd()` in `backfill-mf-metrics-history.math.ts` is that same
 * expression, deliberately duplicated rather than imported, because
 * `mf-backtest.ts` does not export it. If one of the two ever changes, the
 * rows still land within the 10-day window for most months and silently miss
 * for others — so the invariant is asserted in
 * `test/scripts/backfillMfMetricsHistory.test.ts` rather than left to a
 * comment.
 *
 * ===========================================================================
 * ⚠ SURVIVORSHIP BIAS — the thing this script must get right
 * ===========================================================================
 *
 * `mfMetricsJob` selects `where: { status: 'ACTIVE' }`. That is correct for a
 * nightly job (recomputing a dead fund's Sharpe every night is waste) and
 * WRONG for a historical backfill, in a way that is invisible and that biases
 * the backtest in the flattering direction.
 *
 * A fund that wound up or was merged away in 2021 was ACTIVE and choosable in
 * 2018. If it has no 2018 metrics row, it silently vanishes from the 2018
 * universe — and the funds that vanish are disproportionately the ones whose
 * forward three years were WORST, because that is why they were merged away.
 * Drop them and the backtest measures a universe from which the losers were
 * removed with hindsight, and reports a methodology edge that does not exist.
 * `02 §6` names this; `mf-backtest.ts` refuses to emit a coefficient if no
 * dead fund was ever ranked, which is a precondition this script has to
 * satisfy rather than dodge.
 *
 * So the default is `MFMH_INCLUDE_DEAD=1`: every scheme is included regardless
 * of today's status, and `wasAliveAt` reconstructs status at each month-end
 * from `status` + `statusChangedAt`, mirroring the backtest's own `statusAsOf`.
 *
 * The honest limit, stated rather than assumed away: `statusChangedAt` is only
 * as good as the day the metadata job first noticed a scheme had gone. For a
 * scheme that died before this database existed there is no death date at all,
 * and — exactly as the backtest does — an unknown death resolves to ALIVE.
 * That errs toward inclusion, which is the unbiased direction: including a
 * fund slightly past its death adds a little noise, whereas excluding it
 * removes a known-bad outcome and inflates the result.
 *
 * What this CANNOT fix: a scheme AMFI dropped before this database's first
 * metadata run has no `MfSchemeMeta` row at all, so it is not in any universe
 * here and no amount of status logic recovers it. That is a real, bounded
 * residual bias. It is reported in the summary as `deadSchemesIncluded` so the
 * backtest's precondition check has a number to work with instead of an
 * assumption.
 *
 * ===========================================================================
 * WHY `MFMH_ONLY_WITH_NAV` DEFAULTS ON
 * ===========================================================================
 *
 * A scheme with no `MFNav` rows produces six `INSUFFICIENT_DATA` rows at every
 * one of ~130 month-ends. Over AMFI's ~8,700 schemes that is ~6.8 M rows that
 * say nothing, and days of compute to write them. Restricting to schemes that
 * have NAV history costs nothing real: a scheme with no NAV cannot be scored
 * at any `asOf`, so its absence and its `INSUFFICIENT_DATA` row carry the same
 * information.
 *
 * This is a filter on NAV EXISTENCE, never on NAV quality or on outcome — it
 * cannot reintroduce survivorship bias, because a dead fund with history still
 * has its history.
 *
 * ===========================================================================
 * ⚠ WHY THE "DID IT EXIST YET" TEST IS `firstNavDate`, NOT `inceptionDate`
 * ===========================================================================
 *
 * The obvious gate is `MfSchemeMeta.inceptionDate > asOf -> skip`. It is
 * wrong here, and using it silently produced 17 schemes instead of 148 on the
 * first real run of this script.
 *
 * `mfMetadataJob` seeds `inceptionDate` at INSERT from the earliest `MFNav`
 * row it can find, falling back to the NAV date on the AMFI row it is
 * inserting from. It is deliberately create-only, so it never self-corrects.
 * That is sound — except that the natural bootstrap order is metadata first
 * (to learn which schemes exist), NAV history second (to fetch them), which
 * means at insert time there is NO NAV history to derive from and every scheme
 * is stamped with today's date. Measured on this database: 134 of 148 schemes
 * carry an `inceptionDate` in 2026 for funds with real NAV back to 2013.
 *
 * So `inceptionDate` is unreliable on any database whose metadata job ran
 * before its NAV backfill — i.e. every database. `firstNavDate`, computed
 * below from `MFNav` itself, is both the honest answer to "can this scheme be
 * computed at `asOf`" and immune to the ordering. `wasAliveAt` is therefore
 * only about STATUS; the arrow of time is enforced by `firstNavDate <= asOf`
 * in `main`.
 *
 * The underlying `inceptionDate` rows are still wrong for anything else that
 * reads them; `scripts/backfill-mf-nav-history.ts` has an opt-in repair
 * (`NAVBF_REPAIR_INCEPTION=1`) to run once after a NAV backfill.
 */

import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { runMfMetricsJob } from '../src/jobs/mfMetricsJob.js';
import type { MfSchemeStatus } from '@prisma/client';
import {
  monthEnd,
  monthEndsBetween,
  wasAliveAt,
} from './backfill-mf-metrics-history.math.js';

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function envDate(name: string, fallback: Date): Date {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) throw new Error(`${name} must be YYYY-MM-DD, got "${raw}"`);
  return new Date(
    Date.UTC(
      Number.parseInt(m[1] ?? '', 10),
      Number.parseInt(m[2] ?? '', 10) - 1,
      Number.parseInt(m[3] ?? '', 10),
    ),
  );
}

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

interface UniverseScheme {
  schemeCode: string;
  status: MfSchemeStatus;
  statusChangedAt: Date | null;
  inceptionDate: Date;
  /** Earliest NAV date we hold. A month-end before it cannot be computed. */
  firstNavDate: Date | null;
}

async function loadUniverse(): Promise<UniverseScheme[]> {
  const explicit = (process.env.MFMH_SCHEME_CODES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const includeDead = envFlag('MFMH_INCLUDE_DEAD', true);
  const limit = envInt('MFMH_SCHEME_LIMIT', 0);

  const schemes = await prisma.mfSchemeMeta.findMany({
    where: {
      ...(explicit.length > 0 ? { schemeCode: { in: explicit } } : {}),
      ...(includeDead ? {} : { status: 'ACTIVE' as MfSchemeStatus }),
    },
    select: { schemeCode: true, status: true, statusChangedAt: true, inceptionDate: true },
    orderBy: { schemeCode: 'asc' },
  });

  // Earliest NAV per scheme, via the documented two-hop join
  // (MfSchemeMeta.schemeCode -> MutualFundMaster.id -> MFNav.fundId). One
  // grouped query rather than a point read per scheme.
  const masters = await prisma.mutualFundMaster.findMany({
    where: { schemeCode: { in: schemes.map((s) => s.schemeCode) } },
    select: { id: true, schemeCode: true },
  });
  const codeByFundId = new Map(masters.map((m) => [m.id, m.schemeCode]));
  const firstNavByCode = new Map<string, Date>();
  if (masters.length > 0) {
    const grouped = await prisma.mFNav.groupBy({
      by: ['fundId'],
      // Quarantined rows are excluded by every metric consumer, so a scheme
      // whose only rows are quarantined has no usable history and must not
      // look like it does.
      where: { fundId: { in: masters.map((m) => m.id) }, isQuarantined: false },
      _min: { date: true },
    });
    for (const g of grouped) {
      const code = codeByFundId.get(g.fundId);
      if (code && g._min.date) firstNavByCode.set(code, g._min.date);
    }
  }

  let universe: UniverseScheme[] = schemes.map((s) => ({
    ...s,
    firstNavDate: firstNavByCode.get(s.schemeCode) ?? null,
  }));

  if (envFlag('MFMH_ONLY_WITH_NAV', true)) {
    universe = universe.filter((s) => s.firstNavDate !== null);
  }
  if (limit > 0) universe = universe.slice(0, limit);
  return universe;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

interface MonthSummary {
  asOf: Date;
  schemes: number;
  computed: number;
  failed: number;
  rowsWritten: number;
  skipped: boolean;
  ms: number;
}

async function main(): Promise<void> {
  const firstMonth = envDate('MFMH_FIRST_MONTH', new Date(Date.UTC(2016, 0, 31)));

  // Default upper bound is the END of the LAST COMPLETED month. Including the
  // current, partial month would write a row whose `asOf` is in the future
  // relative to the NAV we hold, which is not wrong so much as meaningless —
  // and the backtest needs a 3-year forward window after each month anyway.
  const now = new Date();
  const defaultLast = monthEnd(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const lastMonth = envDate('MFMH_LAST_MONTH', defaultLast);

  const months = monthEndsBetween(firstMonth, lastMonth);
  const universe = await runAsSystem(loadUniverse);
  const resume = envFlag('MFMH_RESUME', true);
  const maxRunMs = envInt('MFMH_MAX_RUN_MS', 0);
  const t0 = Date.now();

  const deadIncluded = universe.filter((s) => s.status !== 'ACTIVE').length;

  console.log('--- historical MF metrics backfill ---------------------------');
  console.log(`  months        ${months.length}  (${months[0]?.toISOString().slice(0, 10)} .. ${months[months.length - 1]?.toISOString().slice(0, 10)})`);
  console.log(`  schemes       ${universe.length}`);
  console.log(`  of which dead ${deadIncluded}  (included — see survivorship note)`);
  console.log(`  resume        ${resume ? 'on (skip months already written)' : 'off (recompute)'}`);

  if (universe.length === 0) {
    console.error('Empty universe. Has the NAV backfill run? (scripts/backfill-mf-nav-history.ts)');
    process.exitCode = 1;
    return;
  }
  if (envFlag('MFMH_DRY_RUN', false)) {
    console.log('  DRY RUN — nothing written');
    return;
  }

  const summaries: MonthSummary[] = [];
  let totalRows = 0;
  let budgetExhausted = false;

  for (const asOf of months) {
    if (maxRunMs > 0 && Date.now() - t0 > maxRunMs) {
      budgetExhausted = true;
      console.log(`  [budget] stopping before ${asOf.toISOString().slice(0, 10)}`);
      break;
    }

    // A scheme is computed at `asOf` only if it was alive then AND we hold NAV
    // from before then. The second test is what keeps the run tractable: in
    // January 2016 that is a handful of schemes, not all 148.
    const codes = universe
      .filter(
        (s) =>
          wasAliveAt(s, asOf) &&
          s.firstNavDate !== null &&
          s.firstNavDate.getTime() <= asOf.getTime(),
      )
      .map((s) => s.schemeCode);

    if (codes.length === 0) {
      summaries.push({ asOf, schemes: 0, computed: 0, failed: 0, rowsWritten: 0, skipped: true, ms: 0 });
      continue;
    }

    if (resume) {
      // Resume at MONTH granularity, not scheme granularity. A month is either
      // done or not; a half-written month is re-done in full. That is cheaper
      // to reason about than a per-scheme diff and costs at most one month of
      // recompute after an interrupted run.
      const existing = await runAsSystem(() =>
        prisma.mfSchemeMetrics.count({ where: { asOf, schemeCode: { in: codes } } }),
      );
      if (existing >= codes.length * 6) {
        summaries.push({
          asOf, schemes: codes.length, computed: 0, failed: 0, rowsWritten: 0, skipped: true, ms: 0,
        });
        continue;
      }
    }

    const mt0 = Date.now();
    // `schemeCodes` is the lever that makes this possible at all: passing it
    // bypasses the job's own `status: ACTIVE` selection, which is exactly the
    // survivorship filter this script must not inherit.
    const res = await runMfMetricsJob({ asOf, schemeCodes: codes });
    const ms = Date.now() - mt0;
    totalRows += res.rowsWritten;
    summaries.push({
      asOf, schemes: codes.length, computed: res.computed, failed: res.failed,
      rowsWritten: res.rowsWritten, skipped: false, ms,
    });
    console.log(
      `  ${asOf.toISOString().slice(0, 10)}  schemes ${String(codes.length).padStart(4)}  ` +
        `computed ${String(res.computed).padStart(4)}  failed ${String(res.failed).padStart(3)}  ` +
        `rows ${String(res.rowsWritten).padStart(5)}  ${(ms / 1000).toFixed(1)}s`,
    );
  }

  const ran = summaries.filter((s) => !s.skipped);
  console.log('');
  console.log('--- summary --------------------------------------------------');
  console.log(`  months computed   ${ran.length}`);
  console.log(`  months skipped    ${summaries.length - ran.length}`);
  console.log(`  metric rows       ${totalRows}`);
  console.log(`  dead schemes      ${deadIncluded} included`);
  console.log(`  failures          ${ran.reduce((a, s) => a + s.failed, 0)}`);
  console.log(`  budget exhausted  ${budgetExhausted}`);
  console.log(`  duration          ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (deadIncluded === 0) {
    // Not fatal here, but the backtest REFUSES a run in which no dead fund was
    // ever ranked, so saying it now beats discovering it after a long run.
    console.log('');
    console.log('  ⚠ No non-ACTIVE schemes are in this universe, so every historical');
    console.log('    cross-section is survivorship-biased and mf-backtest.ts will');
    console.log('    refuse to emit a coefficient. This is expected on a database');
    console.log('    whose metadata history is younger than the backtest window.');
  }
}

main()
  .catch((err: unknown) => {
    // Never swallowed: a partial backfill that reported success would send the
    // backtest into a cross-section with silent holes in it.
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
