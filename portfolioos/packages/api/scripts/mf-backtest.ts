/**
 * Methodology backtest — `06-QUALITY-COMPLIANCE.md §3`, `07` Task 2.7.
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/mf-backtest.ts
 *
 * Options (env):
 *   BACKTEST_FIRST_MONTH     first month-end, YYYY-MM-DD (default 2016-01-31)
 *   BACKTEST_FORWARD_YEARS   forward measurement window (default 3)
 *   BACKTEST_SCHEME_LIMIT    cap the scheme cross-section (debugging only)
 *   BACKTEST_REPORT_DIR      output dir (default docs/mf-analytics/backtests)
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCRIPT DOES NOT DO: it does not write `REPLACEMENT_EXPECTED_EDGE`.
 * ---------------------------------------------------------------------------
 *
 * The coefficient this produces is the denominator of `05 §5`'s break-even:
 *
 *     breakEvenMonths = (exitLoadInr + taxInr)
 *                     / (replacementExpectedEdge × currentValue / 12)
 *
 * and while `REPLACEMENT_EXPECTED_EDGE` is `null`, `breakEvenMonths` is null,
 * `05 §5` row 3 cannot match, and no `SWITCH_CANDIDATE` verdict naming a
 * replacement can be justified. Every fund that would otherwise be one falls
 * through to `REVIEW` — "this needs your attention" without "and here is what
 * to buy instead".
 *
 * Making that constant non-null therefore switches on live switch
 * recommendations: regulated advice under SEBI's IA regulations (`06 §4`),
 * gated behind `RIA_VERDICTS_ENABLED`, that tells a real person to sell a real
 * fund. That is a decision a human makes after reading the report, not a side
 * effect of a script exiting 0. So this script PRINTS the coefficient and the
 * exact edit to make, and touches no source file other than the markdown
 * report.
 *
 * ---------------------------------------------------------------------------
 * THE TWO WAYS A BACKTEST LIES
 * ---------------------------------------------------------------------------
 *
 * **1. Lookahead.** Every input to a score at month-end `t` is read with
 * `asOf <= t`:
 *
 *   - `MfSchemeMetrics` rows are selected by `asOf > t − staleness AND asOf <= t`.
 *     Never the latest row; never a row dated after `t`.
 *   - Percentiles are recomputed here against the as-of-`t` cross-section
 *     rather than read from `MfPeerRank`, and the structural inputs rank raw
 *     `terPct` / `aum` rather than the stored `terPercentile`, because the
 *     stored percentile is whatever universe the job saw when it last ran.
 *   - NAV after `t` is touched in exactly one place, `forwardOutcome`, which
 *     measures the result being predicted. Nothing derived from it re-enters a
 *     composite: every composite for month `t` is computed before any forward
 *     outcome for month `t` is asked for.
 *
 * **2. Survivorship.** Universe membership is evaluated as of `t`. A fund that
 * wound up in 2021 was ACTIVE and choosable in 2018, so it belongs in the 2018
 * universe; dropping it is exactly the bias `02 §6` warns about, and here it
 * would inflate the backtest's own result, because the funds that vanish are
 * disproportionately the ones whose forward three years were worst.
 *
 * `statusAsOf` reconstructs each scheme's status at `t` from `status` +
 * `statusChangedAt` and unknown death dates resolve to ACTIVE — always erring
 * toward inclusion, because the exclusion direction is the biased one. There
 * is a hard limit on how far that can be pushed from stored data, and the
 * script measures it rather than assuming it away: `deadSchemesRanked` vs
 * `deadSchemesInWindow` is a precondition, and a run in which no dead fund was
 * ever ranked is REFUSED.
 *
 * ---------------------------------------------------------------------------
 * REFUSAL
 * ---------------------------------------------------------------------------
 *
 * `checkPreconditions` (in `mf-backtest.math.ts`, with the reasoning for each
 * threshold) decides whether the run may emit a coefficient at all. If it may
 * not, the script prints exactly what is missing and what would satisfy it,
 * writes a report whose first line is `INSUFFICIENT DATA — NOT ELIGIBLE TO
 * SHIP`, emits NO coefficient, and exits non-zero. A confident-looking number
 * derived from eight months of thin history would be worse than no number,
 * because it would be wired straight into a recommendation that moves money.
 *
 * Memory note: the forward-drawdown measurement needs the *daily* series
 * (`02 §3` — monthly sampling understates March 2020 by ~15pp), so each
 * candidate scheme's adjusted-NAV history is loaded once and cached for the
 * whole run. At ~1,500 schemes × ~13 years that is the largest allocation in
 * the process; `BACKTEST_SCHEME_LIMIT` exists for bisecting on a small box.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  toDecimal,
  MIN_UNIVERSE_SIZE,
  SEBI_SUBCATEGORY_MAP,
  UNMAPPED_SUBCATEGORY,
  type MfCurrentProfile,
  type MfHorizonMetrics,
  type MfModelKey,
  type SebiSubCategory,
} from '@portfolioos/shared';
import type { MfSchemeStatus } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { toDailySeries, type SeriesPoint } from '../src/services/mfAnalytics/mfMetricsMath.js';
import { modelForKey } from '../src/services/mfAnalytics/mfScoring/models/registry.js';
import { ACTIVE_EQUITY_MODEL } from '../src/services/mfAnalytics/mfScoring/models/activeEquity.js';
import {
  ACCEPTANCE,
  PRECONDITIONS,
  checkPreconditions,
  forwardOutcome,
  monthOutcome,
  olsSlope,
  regressionPointsFor,
  renderModelReport,
  renderRefusalReport,
  scoreUniverseAsOf,
  REFUSAL_BANNER,
  type BacktestCoverage,
  type BacktestMember,
  type MonthOutcome,
  type RegressionPoint,
  type ReportContext,
  type SchemeAsOfInputs,
  type UniverseMonth,
} from './mf-backtest.math.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FIRST_MONTH = new Date(
  `${process.env.BACKTEST_FIRST_MONTH ?? ACCEPTANCE.firstMonthEnd}T00:00:00.000Z`,
);
const FORWARD_YEARS = Number.parseInt(
  process.env.BACKTEST_FORWARD_YEARS ?? String(ACCEPTANCE.forwardYears),
  10,
);
const SCHEME_LIMIT = process.env.BACKTEST_SCHEME_LIMIT
  ? Number.parseInt(process.env.BACKTEST_SCHEME_LIMIT, 10)
  : null;
const REPORT_DIR =
  process.env.BACKTEST_REPORT_DIR ??
  path.resolve(process.cwd(), '../../docs/mf-analytics/backtests');

/**
 * How stale an `MfSchemeMetrics` row may be and still count as "the state of
 * knowledge at `t`".
 *
 * `mfMetricsJob` runs nightly, so in a healthy database the row dated exactly
 * `t` exists. Ten days absorbs a job outage or a month-end that fell in a
 * holiday cluster without ever reaching back into the *previous* month, which
 * would blur one month's cross-section into the next.
 */
const METRIC_STALENESS_DAYS = 10;

/** Chunk size for the NAV load; mirrors `NAV_FETCH_CHUNK_SIZE` upstream. */
const NAV_CHUNK = 25;

// ---------------------------------------------------------------------------
// Date helpers (UTC throughout — CONTEXT.md §14.2)
// ---------------------------------------------------------------------------

function monthEnd(year: number, monthIndex: number): Date {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function endOfMonthFor(d: Date): Date {
  return monthEnd(d.getUTCFullYear(), d.getUTCMonth());
}

function minusYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()));
}

function minusDays(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 86_400_000);
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Loading (the thin shell; all arithmetic lives in mf-backtest.math.ts)
// ---------------------------------------------------------------------------

interface Candidate {
  schemeCode: string;
  sebiSubCategory: string;
  planType: string;
  status: MfSchemeStatus;
  inceptionDate: Date;
  statusChangedAt: Date | null;
  modelKey: MfModelKey;
  universeKey: string;
}

/**
 * `03 §1`: `universeKey = "<sebiSubCategory>|<planType>"`. Inlined rather than
 * imported because `mfPeerRank.service.ts` does not export its builder and
 * importing that module would pull Prisma persistence helpers into the pure
 * path this script tries to keep narrow.
 */
function buildUniverseKey(sub: string, plan: string): string {
  return `${sub}|${plan}`;
}

/**
 * The scheme's status at `t`, reconstructed from today's row.
 *
 * An unknown `statusChangedAt` on a dead scheme resolves to ACTIVE at every
 * `t`. That is deliberately the inclusive direction: excluding a fund because
 * its death date is unrecorded reintroduces exactly the survivorship hole the
 * reconstruction exists to close. A fund that actually died before `t` has no
 * metric row at `t` and drops out on that test instead, which is the honest
 * reason to drop it.
 */
function statusAsOf(c: Candidate, t: Date): MfSchemeStatus {
  if (c.status === 'ACTIVE') return 'ACTIVE';
  if (c.statusChangedAt === null) return 'ACTIVE';
  return c.statusChangedAt.getTime() > t.getTime() ? 'ACTIVE' : c.status;
}

async function loadCandidates(): Promise<Candidate[]> {
  const rows = await runAsSystem(() =>
    prisma.mfSchemeMeta.findMany({
      where: {
        optionType: 'GROWTH',
        sebiSubCategory: { not: UNMAPPED_SUBCATEGORY },
      },
      select: {
        schemeCode: true,
        sebiSubCategory: true,
        planType: true,
        status: true,
        inceptionDate: true,
        statusChangedAt: true,
      },
      orderBy: { schemeCode: 'asc' },
      ...(SCHEME_LIMIT !== null ? { take: SCHEME_LIMIT } : {}),
    }),
  );

  const out: Candidate[] = [];
  for (const r of rows) {
    const spec = SEBI_SUBCATEGORY_MAP[r.sebiSubCategory as SebiSubCategory];
    // A sub-category the shared map does not know is not scoreable by any
    // model, and guessing one would score a fund against the wrong weights.
    if (spec === undefined) continue;
    out.push({
      schemeCode: r.schemeCode,
      sebiSubCategory: r.sebiSubCategory,
      planType: r.planType,
      status: r.status,
      inceptionDate: r.inceptionDate,
      statusChangedAt: r.statusChangedAt,
      modelKey: spec.modelKey,
      universeKey: buildUniverseKey(r.sebiSubCategory, r.planType),
    });
  }
  return out;
}

/**
 * Daily adjusted-NAV series per scheme, cleaned exactly as the metrics service
 * cleans it: `adjustedNav` only (never `nav` — `01 §2`), quarantined rows
 * excluded (`01 §6`), deduped and ascending.
 *
 * The two-hop join `MfSchemeMeta.schemeCode → MutualFundMaster.id → MFNav.fundId`
 * is documented on the schema; there is no relation to shortcut it.
 */
async function loadNavSeries(schemeCodes: readonly string[]): Promise<Map<string, SeriesPoint[]>> {
  const out = new Map<string, SeriesPoint[]>();

  for (let i = 0; i < schemeCodes.length; i += NAV_CHUNK) {
    const chunk = schemeCodes.slice(i, i + NAV_CHUNK);
    const masters = await runAsSystem(() =>
      prisma.mutualFundMaster.findMany({
        where: { schemeCode: { in: [...chunk] } },
        select: { id: true, schemeCode: true },
      }),
    );
    if (masters.length === 0) continue;

    const byFundId = new Map(masters.map((m) => [m.id, m.schemeCode]));
    const rows = await runAsSystem(() =>
      prisma.mFNav.findMany({
        where: {
          fundId: { in: masters.map((m) => m.id) },
          isQuarantined: false,
          adjustedNav: { not: null },
        },
        select: { fundId: true, date: true, adjustedNav: true },
        orderBy: { date: 'asc' },
      }),
    );

    const grouped = new Map<string, SeriesPoint[]>();
    for (const r of rows) {
      const code = byFundId.get(r.fundId);
      if (code === undefined) continue;
      const list = grouped.get(code) ?? [];
      list.push({ date: r.date, value: toDecimal(r.adjustedNav) });
      grouped.set(code, list);
    }
    for (const [code, points] of grouped) out.set(code, toDailySeries(points));
  }

  return out;
}

interface MonthMetricRow {
  schemeCode: string;
  horizonYears: number;
  asOf: Date;
  status: string;
  metrics: unknown;
}

/**
 * Every metrics row visible at `t`: `asOf` in `(t − staleness, t]`, latest per
 * `(scheme, horizon)`.
 *
 * The upper bound is the no-lookahead guarantee and the lower bound is what
 * stops last quarter's numbers from standing in for this month's.
 */
async function loadMetricsAsOf(t: Date): Promise<Map<string, Map<number, MonthMetricRow>>> {
  const rows = (await runAsSystem(() =>
    prisma.mfSchemeMetrics.findMany({
      where: { asOf: { gt: minusDays(t, METRIC_STALENESS_DAYS), lte: t } },
      select: {
        schemeCode: true,
        horizonYears: true,
        asOf: true,
        status: true,
        metrics: true,
      },
      orderBy: { asOf: 'asc' },
    }),
  )) as unknown as MonthMetricRow[];

  const out = new Map<string, Map<number, MonthMetricRow>>();
  for (const r of rows) {
    // Ascending `asOf`, so a later row for the same (scheme, horizon)
    // overwrites an earlier one and the map ends up holding the freshest row
    // that is still not in the future.
    const byHorizon = out.get(r.schemeCode) ?? new Map<number, MonthMetricRow>();
    byHorizon.set(r.horizonYears, r);
    out.set(r.schemeCode, byHorizon);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

interface ModelRun {
  modelKey: MfModelKey;
  methodologyVersion: string;
  months: UniverseMonth[];
  compositeOutcomes: MonthOutcome[];
  pillarOutcomes: Map<string, MonthOutcome[]>;
  regression: RegressionPoint[];
}

interface RunResult {
  firstMonth: Date;
  lastMonth: Date | null;
  monthsAttempted: number;
  byModel: Map<MfModelKey, ModelRun>;
  coverage: BacktestCoverage;
  missingInputs: Map<MfModelKey, Set<string>>;
}

async function run(): Promise<RunResult> {
  const candidates = await loadCandidates();
  console.warn(`[load] ${candidates.length} scoreable scheme candidates`);

  const navByScheme = await loadNavSeries(candidates.map((c) => c.schemeCode));
  console.warn(`[load] NAV series for ${navByScheme.size} schemes`);

  // The last month we can score is bounded by the forward window: measuring a
  // 3-year outcome from `t` needs NAV out to `t + 3y`. Bounding by "today"
  // instead would silently produce months whose forward return is truncated,
  // which is the same lie as annualising a partial window.
  let maxNavDate: Date | null = null;
  for (const series of navByScheme.values()) {
    const last = series.at(-1);
    if (last !== undefined && (maxNavDate === null || last.date > maxNavDate)) {
      maxNavDate = last.date;
    }
  }
  const lastMonth = maxNavDate === null ? null : endOfMonthFor(minusYears(maxNavDate, FORWARD_YEARS));

  const byModel = new Map<MfModelKey, ModelRun>();
  const missingInputs = new Map<MfModelKey, Set<string>>();
  const distinctSchemes = new Set<string>();
  const gateModelSchemes = new Set<string>();
  const scoredMonths = new Set<string>();
  const gateModelMonths = new Set<string>();
  const deadRanked = new Set<string>();
  let quintileEligibleUniverseMonths = 0;
  let tooSmallUniverseMonths = 0;
  let monthsAttempted = 0;

  const deadInWindow = candidates.filter(
    (c) =>
      c.status !== 'ACTIVE' &&
      c.statusChangedAt !== null &&
      c.statusChangedAt.getTime() >= FIRST_MONTH.getTime(),
  );
  const deadCodes = new Set(deadInWindow.map((d) => d.schemeCode));

  for (
    let t = endOfMonthFor(FIRST_MONTH);
    lastMonth !== null && t.getTime() <= lastMonth.getTime();
    t = monthEnd(t.getUTCFullYear(), t.getUTCMonth() + 1)
  ) {
    monthsAttempted += 1;
    const metricsAsOf = await loadMetricsAsOf(t);

    // Group the as-of-`t` universes. Membership is decided here and nowhere
    // else; everything downstream consumes the result.
    const universes = new Map<string, { modelKey: MfModelKey; members: Candidate[] }>();
    for (const c of candidates) {
      if (c.inceptionDate.getTime() > t.getTime()) continue;
      if (statusAsOf(c, t) !== 'ACTIVE') continue;

      // Per-horizon membership (`03 §1`): the 3-year row is the minimum for a
      // rateable fund, and its `status: OK` is the metrics layer saying the
      // window was computable. Re-deriving coverage from NAV here would be a
      // second opinion that can disagree with the numbers being ranked.
      const threeYear = metricsAsOf.get(c.schemeCode)?.get(3);
      if (threeYear === undefined || threeYear.status !== 'OK') continue;

      const bucket = universes.get(c.universeKey) ?? { modelKey: c.modelKey, members: [] };
      bucket.members.push(c);
      universes.set(c.universeKey, bucket);
    }

    for (const [universeKey, { modelKey, members }] of universes) {
      if (members.length < MIN_UNIVERSE_SIZE) continue;
      if (members.length < PRECONDITIONS.minUniverseSizeForQuintiles) {
        tooSmallUniverseMonths += 1;
        continue;
      }

      const model = modelForKey(modelKey);
      const inputs: SchemeAsOfInputs[] = members.map((c) => {
        const rows = metricsAsOf.get(c.schemeCode);
        const horizonMetrics = new Map<number, MfHorizonMetrics>();
        let structural: MfCurrentProfile | null = null;
        if (rows !== undefined) {
          for (const [horizon, row] of rows) {
            if (row.status !== 'OK') continue;
            if (horizon === 0) structural = row.metrics as MfCurrentProfile;
            else horizonMetrics.set(horizon, row.metrics as MfHorizonMetrics);
          }
        }
        const series = navByScheme.get(c.schemeCode) ?? [];
        const firstNav = series[0];
        return {
          schemeCode: c.schemeCode,
          horizonMetrics,
          structural,
          historyMonths: firstNav === undefined ? 0 : monthsBetween(firstNav.date, t),
        };
      });

      const scored = scoreUniverseAsOf({ universeKey, modelKey, model, members: inputs });

      const missing = missingInputs.get(modelKey) ?? new Set<string>();
      for (const m of scored.missingInputs) missing.add(m);
      missingInputs.set(modelKey, missing);

      // Only now — every composite for this universe-month is fixed — do we
      // look at what happened afterwards. Keeping the two passes separate is
      // what makes the no-lookahead claim checkable by reading the code.
      const backtestMembers: BacktestMember[] = [];
      for (const s of scored.scores) {
        if (s.composite === null) continue;
        const series = navByScheme.get(s.schemeCode);
        if (series === undefined) continue;
        const fwd = forwardOutcome(series, t, FORWARD_YEARS);
        if (fwd.forwardCagr === null) continue;
        backtestMembers.push({
          schemeCode: s.schemeCode,
          composite: s.composite,
          pillars: s.pillars,
          forwardCagr: fwd.forwardCagr,
          forwardMaxDrawdown: fwd.forwardMaxDrawdown,
        });
      }

      if (backtestMembers.length < PRECONDITIONS.minUniverseSizeForQuintiles) {
        tooSmallUniverseMonths += 1;
        continue;
      }

      quintileEligibleUniverseMonths += 1;
      scoredMonths.add(iso(t));
      if (modelKey === ACCEPTANCE.gateModelKey) gateModelMonths.add(iso(t));

      const month: UniverseMonth = {
        monthEnd: t,
        universeKey,
        modelKey,
        methodologyVersion: model.methodologyVersion,
        members: backtestMembers,
      };

      const entry = byModel.get(modelKey) ?? {
        modelKey,
        methodologyVersion: model.methodologyVersion,
        months: [],
        compositeOutcomes: [],
        pillarOutcomes: new Map<string, MonthOutcome[]>(),
        regression: [],
      };
      entry.months.push(month);
      entry.compositeOutcomes.push(monthOutcome(month));
      for (const pillar of model.pillars) {
        const list = entry.pillarOutcomes.get(pillar.key) ?? [];
        list.push(monthOutcome(month, (m) => m.pillars[pillar.key] ?? null));
        entry.pillarOutcomes.set(pillar.key, list);
      }
      entry.regression.push(...regressionPointsFor(month));
      byModel.set(modelKey, entry);

      for (const m of backtestMembers) {
        distinctSchemes.add(m.schemeCode);
        if (modelKey === ACCEPTANCE.gateModelKey) gateModelSchemes.add(m.schemeCode);
        if (deadCodes.has(m.schemeCode)) deadRanked.add(m.schemeCode);
      }
    }
  }

  const allRegression = [...byModel.values()].flatMap((m) => m.regression);
  const pooled = olsSlope(allRegression);

  return {
    firstMonth: endOfMonthFor(FIRST_MONTH),
    lastMonth,
    monthsAttempted,
    byModel,
    missingInputs,
    coverage: {
      scoredMonths: scoredMonths.size,
      gateModelMonths: gateModelMonths.size,
      quintileEligibleUniverseMonths,
      tooSmallUniverseMonths,
      distinctSchemes: distinctSchemes.size,
      gateModelDistinctSchemes: gateModelSchemes.size,
      regressionObservations: allRegression.length,
      regressionXVariance: pooled.xVariance,
      deadSchemesInWindow: deadInWindow.length,
      deadSchemesRanked: deadRanked.size,
    },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  console.warn(
    `[mf-backtest] window from ${iso(endOfMonthFor(FIRST_MONTH))}, forward ${FORWARD_YEARS}y`,
  );

  const result = await run();
  const gate = checkPreconditions(result.coverage);

  // Rendering is pure and lives in the math module (see its section 9): the
  // report is the deliverable `06 §3` persists and `03 §9` treats as the
  // authorisation to make a version default, so it must be unit-testable
  // rather than only ever exercised against a live database.
  const ctx: ReportContext = {
    runDate: new Date(),
    firstMonth: result.firstMonth,
    lastMonth: result.lastMonth,
    monthsAttempted: result.monthsAttempted,
    forwardYears: FORWARD_YEARS,
    metricStalenessDays: METRIC_STALENESS_DAYS,
    gateVersionLabel: ACTIVE_EQUITY_MODEL.methodologyVersion,
  };

  await mkdir(REPORT_DIR, { recursive: true });

  if (!gate.ok) {
    console.error('');
    console.error(`=== ${REFUSAL_BANNER} ===`);
    console.error('');
    console.error('No coefficient was produced. REPLACEMENT_EXPECTED_EDGE stays null, and no');
    console.error('SWITCH_CANDIDATE verdict naming a replacement can be justified.');
    console.error('');
    for (const f of gate.failures) {
      console.error(`  [${f.code}]`);
      console.error(`    required : ${f.requirement}`);
      console.error(`    observed : ${f.observed}`);
      console.error(`    to fix   : ${f.remedy}`);
      console.error('');
    }
    const file = path.join(REPORT_DIR, `${ACTIVE_EQUITY_MODEL.methodologyVersion}.md`);
    await writeFile(file, renderRefusalReport(ctx, result.coverage, gate), 'utf8');
    console.error(`Report: ${file}`);
    return 1;
  }

  for (const modelRun of result.byModel.values()) {
    const regression = olsSlope(modelRun.regression);
    const file = path.join(REPORT_DIR, `${modelRun.methodologyVersion}.md`);
    await writeFile(
      file,
      renderModelReport(ctx, {
        modelKey: modelRun.modelKey,
        methodologyVersion: modelRun.methodologyVersion,
        universeMonths: modelRun.months.length,
        compositeOutcomes: modelRun.compositeOutcomes,
        pillarOutcomes: modelRun.pillarOutcomes,
        regression,
        missingInputs: [...(result.missingInputs.get(modelRun.modelKey) ?? [])],
        coverage: result.coverage,
        preconditionsOk: gate.ok,
      }),
      'utf8',
    );
    console.warn(`[report] ${file}`);

    if (modelRun.modelKey === ACCEPTANCE.gateModelKey && regression.slope !== null) {
      console.warn('');
      console.warn('=== COEFFICIENT ===');
      console.warn(`  slope (annual return per composite point): ${regression.slope.toFixed(8)}`);
      console.warn(`  r²: ${regression.r2 === null ? '—' : regression.r2.toFixed(4)}`);
      console.warn(`  n : ${regression.n}`);
      console.warn('');
      console.warn('  This script does NOT edit constants.ts. Making the edit below switches on');
      console.warn('  live SWITCH_CANDIDATE recommendations; that is a human decision.');
      console.warn('');
      console.warn('  packages/api/src/services/mfAnalytics/constants.ts');
      console.warn(
        `  export const REPLACEMENT_EXPECTED_EDGE: Decimal | null = new Decimal('${regression.slope.toFixed(8)}');`,
      );
      console.warn('');
    }
  }

  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('[mf-backtest] failed', err);
    await prisma.$disconnect();
    process.exit(2);
  });
