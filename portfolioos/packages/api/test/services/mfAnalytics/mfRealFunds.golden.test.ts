/**
 * `02-METRICS.md §10.4` — real-fund golden fixtures with PUBLISHED reference
 * figures.
 *
 * Three real schemes, ~13 years of daily NAV each, run through OUR math at the
 * AMC factsheet's own as-of date and compared against numbers the AMC computed
 * itself. Everything else in `mfMetricsMath.test.ts` derives the expected
 * value from the same formula the implementation uses; this file is the one
 * place the expected value comes from an independent calculation. That is
 * also why the fixtures carry two NAV series per scheme and why some `it`s
 * below are `it.fails` — see "Honesty rule" at the bottom of this header.
 *
 * Reference source: each AMC's monthly factsheet PDF (URL, page and SHA-256 in
 * `published.json`; the extracted text in `published.txt`). All three editions
 * carry data "as on 31 July 2026", so `asOf` is 2026-07-31 for every scheme.
 * Provenance for NAV (MFAPI), benchmark (NSE via the local feed) and risk-free
 * (FBIL via the local feed) is in `test/fixtures/mf/real-funds/README.md`.
 *
 * Tolerances are the doc's, verbatim: returns ±0.05 pp, σ ±0.1 pp, Sharpe
 * ±0.03. The doc is silent on beta; ±0.03 is used because beta is a unit-free
 * ratio of the same order as Sharpe and that is the closest analogue. Every
 * comparison is done in `Decimal` — a ±0.03 gate decided by IEEE-754 is the
 * wrong instrument for a numeric-drift check.
 *
 * Which plan? The AMCs compute their risk ratios on the REGULAR plan. Mirae
 * prints this ("details provided herein are of Regular Plan - Growth Option");
 * HDFC and Nippon do not say, but their published Sharpe is reproduced to the
 * printed precision from the Regular-plan NAV and misses from the Direct-plan
 * NAV (README, comparison tables). So: point-to-point returns are checked for
 * every plan the factsheet prints; the 3-year ratios are checked on the
 * Regular plan as the like-for-like comparison, and again on the Direct plan
 * because that is the fixture scheme — with the caveat, where it applies, that
 * a Direct-plan pass is the product of two offsetting differences.
 *
 * Honesty rule (task 2.2): a figure outside tolerance is left at the doc's
 * tolerance and marked `it.fails` with the observed delta and the suspected
 * methodology cause in its name. Widening a tolerance, tweaking the math, or
 * swapping schemes to get green would turn this file into the circular test
 * it exists to replace.
 *
 * DB-free: `mfMetricsMath.ts` is pure by contract (`06 §1`).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal, toDecimal } from '@portfolioos/shared';

import {
  toDailySeries,
  toMonthEndSeries,
  toMonthlyReturns,
  forwardFillRiskFree,
  annualisedRiskFreeSeriesToMonthly,
  alignReturns,
  horizonCagr,
  windowStartPoint,
  stdDevAnn,
  sharpe,
  beta,
  type SeriesPoint,
  type MetricResult,
} from '../../../src/services/mfAnalytics/mfMetricsMath.js';

// ---------------------------------------------------------------------------
// Tolerances (02 §10.4)
// ---------------------------------------------------------------------------

/** Returns are compared in percentage points, as the factsheets print them. */
const RETURN_TOL_PP = new Decimal('0.05');
const STDDEV_TOL_PP = new Decimal('0.1');
const SHARPE_TOL = new Decimal('0.03');
/** Not in the doc; see file header for why Sharpe's tolerance is borrowed. */
const BETA_TOL = new Decimal('0.03');

const HUNDRED = new Decimal(100);
const TWELVE = new Decimal(12);
const RISK_ADJUSTED_MONTHS = 36;

// ---------------------------------------------------------------------------
// Fixture shapes
// ---------------------------------------------------------------------------

interface MfapiFixture {
  meta: { scheme_code: number; scheme_name: string };
  data: ReadonlyArray<{ date: string; nav: string }>;
}

interface BenchmarkFixture {
  indexCode: string;
  data: ReadonlyArray<{ date: string; value: string }>;
}

interface RiskFreeFixture {
  series: string;
  data: ReadonlyArray<{ date: string; ratePct: string }>;
}

type HorizonKey = 'return1y' | 'return3y' | 'return5y' | 'return10y';
type PublishedHorizons = Partial<Record<HorizonKey, string>>;

interface PublishedFixture {
  asOf: string;
  schemeCode: number;
  schemeName: string;
  regularPlanCode: number;
  category: string;
  benchmarkIndexCode: string;
  /** Annual MIBOR the factsheet states it used, in percent; null when it names the source but not the value. */
  riskFreeAnnualPct: string | null;
  returns: {
    regular: PublishedHorizons | null;
    direct: PublishedHorizons | null;
    benchmark: PublishedHorizons;
  };
  stdDev3y: string;
  sharpe3y: string;
  beta3y: string;
}

const HORIZONS: ReadonlyArray<{ key: HorizonKey; years: number }> = [
  { key: 'return1y', years: 1 },
  { key: 'return3y', years: 3 },
  { key: 'return5y', years: 5 },
  { key: 'return10y', years: 10 },
];

// ---------------------------------------------------------------------------
// Known misses — the honesty table
// ---------------------------------------------------------------------------

/**
 * Figures observed outside the doc tolerance on 2026-09-07, with the delta
 * (ours − published) and the suspected cause. Keyed by `<plan>.<figure>`.
 * An entry here turns the matching `it` into `it.fails`, so if a later change
 * to the math or the fixtures brings the figure inside tolerance, vitest
 * reports the now-passing test as a failure and someone has to come and
 * delete the row on purpose.
 */
interface KnownMiss {
  delta: string;
  cause: string;
}

interface SchemeSpec {
  code: string;
  label: string;
  knownMisses: Readonly<Record<string, KnownMiss>>;
}

const SCHEMES: readonly SchemeSpec[] = [
  {
    code: '118825',
    label: 'Mirae Asset Large Cap Fund — Large Cap — Nifty 100 TRI',
    knownMisses: {
      // Mirae's 0.26 is reproduced by (CAGR_3y − rf)/σ, i.e. a geometric
      // numerator, not the doc's arithmetic mean(e_m)×12. With the arithmetic
      // numerator and the factsheet's own rf the figure is 0.30.
      'regular.sharpe3y.factsheetRf': {
        delta: '+0.044',
        cause: 'arithmetic mean×12 numerator (doc §4) vs the geometric CAGR-based numerator that reproduces the printed 0.26 exactly',
      },
      // Direct plan earns ~1.07 pp/yr more than Regular over this window (the
      // 0.80 pp TER gap plus compounding); the AMC's ratio is on Regular.
      'direct.sharpe3y.docConvention': {
        delta: '+0.074',
        cause: 'plan mismatch: published ratio is on the Regular plan (factsheet p.25 note 1); the Regular-plan figure under the same convention is within 0.004',
      },
    },
  },
  {
    code: '118955',
    label: 'HDFC Flexi Cap Fund — Flexi Cap — Nifty 500 TRI',
    knownMisses: {
      // The doc's rf is the FBIL 3M T-bill series forward-filled month by
      // month (window average 6.14%, range 5.23–7.02%). HDFC subtracts a
      // single spot MIBOR of 5.41% dated 31 Jul 2026. 0.73 pp of rf over a
      // 12.9% σ is 0.057 of Sharpe; geometric vs arithmetic de-annualisation
      // of rf gives back 0.01.
      'regular.sharpe3y.docConvention': {
        delta: '-0.043',
        cause: 'rf: forward-filled FBIL 3M T-bill series (avg 6.14%) vs factsheet spot MIBOR 5.41%; with the factsheet rf the figure matches to 3 dp',
      },
    },
  },
  {
    code: '118668',
    label: 'Nippon India Growth Mid Cap Fund — Mid Cap — Nifty Midcap 150 TRI',
    knownMisses: {
      'regular.sharpe3y.docConvention': {
        delta: '-0.036',
        cause: 'rf: forward-filled FBIL 3M T-bill series (avg 6.14%) vs factsheet spot MIBOR 5.41%; with the factsheet rf the figure is within 0.005',
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const fixturesRoot = resolve(here, '../../fixtures/mf/real-funds');

function readJson<T>(code: string, file: string): T {
  const path = resolve(fixturesRoot, code, file);
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`${path}: expected a JSON object at the top level`);
  }
  return parsed as T;
}

/**
 * MFAPI prints dates day-first (`DD-MM-YYYY`). A month-first misparse does not
 * throw — it silently turns 04-09-2026 into April 9th — so the format is
 * pinned with a regex and anything else is an error, not a guess.
 */
const DAY_FIRST = /^(\d{2})-(\d{2})-(\d{4})$/;

function dayFirstDate(s: string): Date {
  const m = DAY_FIRST.exec(s);
  if (m === null) throw new Error(`expected DD-MM-YYYY, got ${JSON.stringify(s)}`);
  const [, dd, mm, yyyy] = m;
  return new Date(
    Date.UTC(toDecimal(yyyy).toNumber(), toDecimal(mm).toNumber() - 1, toDecimal(dd).toNumber()),
  );
}

function isoDate(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`expected YYYY-MM-DD, got ${JSON.stringify(s)}`);
  return d;
}

/** Truncate a series to `asOf` inclusive — the captures run to 2026-09-04. */
function upTo(series: readonly SeriesPoint[], asOf: Date): SeriesPoint[] {
  return series.filter((p) => p.date.getTime() <= asOf.getTime());
}

interface LoadedScheme {
  published: PublishedFixture;
  asOf: Date;
  /** Direct plan (the fixture scheme). */
  direct: SeriesPoint[];
  /** Regular plan (the plan the AMC's ratios are computed on). */
  regular: SeriesPoint[];
  benchmark: SeriesPoint[];
  /** FBIL 3M T-bill, annualised, as a fraction (not percent). */
  riskFreeAnnual: SeriesPoint[];
}

function loadScheme(code: string): LoadedScheme {
  const published = readJson<PublishedFixture>(code, 'published.json');
  const nav = readJson<MfapiFixture>(code, 'nav.json');
  const navRegular = readJson<MfapiFixture>(code, 'nav-regular.json');
  const bench = readJson<BenchmarkFixture>(code, 'benchmark.json');
  const rf = readJson<RiskFreeFixture>(code, 'riskfree.json');

  // The fixture must be the scheme it claims to be. A swapped file would
  // otherwise fail three tests with an unhelpful numeric diff.
  expect(nav.meta.scheme_code).toBe(published.schemeCode);
  expect(navRegular.meta.scheme_code).toBe(published.regularPlanCode);
  expect(bench.indexCode).toBe(published.benchmarkIndexCode);
  expect(rf.series).toBe('FBIL_TBILL_3M');

  const asOf = isoDate(published.asOf);
  const toNav = (rows: MfapiFixture['data']): SeriesPoint[] =>
    upTo(
      toDailySeries(rows.map((r) => ({ date: dayFirstDate(r.date), value: toDecimal(r.nav) }))),
      asOf,
    );

  return {
    published,
    asOf,
    direct: toNav(nav.data),
    regular: toNav(navRegular.data),
    benchmark: upTo(
      toDailySeries(bench.data.map((r) => ({ date: isoDate(r.date), value: toDecimal(r.value) }))),
      asOf,
    ),
    riskFreeAnnual: rf.data.map((r) => ({
      date: isoDate(r.date),
      value: toDecimal(r.ratePct).dividedBy(HUNDRED),
    })),
  };
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

interface ThreeYearWindow {
  dates: Date[];
  fund: Decimal[];
  bench: Decimal[];
  /** Doc convention: FBIL 3M T-bill forward-filled to each month end, de-annualised geometrically. */
  rfDoc: Decimal[];
}

/**
 * The factsheets' window: 36 monthly returns ending on the as-of month end
 * (Aug 2023 … Jul 2026). Both AMC methodologies say "monthly" and "three
 * years"/"36 months", which is exactly the doc's monthly series, so no
 * re-sampling is needed to align the windows — only the truncation at `asOf`.
 */
function threeYearWindow(fund: readonly SeriesPoint[], loaded: LoadedScheme): ThreeYearWindow {
  const fundReturns = toMonthlyReturns(toMonthEndSeries(fund)).slice(-RISK_ADJUSTED_MONTHS);
  const benchReturns = toMonthlyReturns(toMonthEndSeries(loaded.benchmark)).slice(
    -RISK_ADJUSTED_MONTHS,
  );
  const aligned = alignReturns(fundReturns, benchReturns);
  const rfAnnual = forwardFillRiskFree(loaded.riskFreeAnnual, aligned.dates);
  const rfMonthly = annualisedRiskFreeSeriesToMonthly(rfAnnual);
  const rfDoc: Decimal[] = rfMonthly.map((r, i) => {
    if (r === null) {
      throw new Error(`no risk-free rate on or before ${aligned.dates[i]!.toISOString()}`);
    }
    return r;
  });
  return { dates: aligned.dates, fund: aligned.a, bench: aligned.b, rfDoc };
}

/**
 * The factsheet's rf as a monthly series: a single annual MIBOR divided by 12.
 * Arithmetic, not geometric, because that is what reproduces HDFC's printed
 * Sharpe to three decimals (geometric lands 0.010 higher) — the AMCs subtract
 * the annual rate from the annualised mean, which is the same thing.
 */
function constantMonthlyRf(annualPct: string, months: number): Decimal[] {
  const monthly = toDecimal(annualPct).dividedBy(HUNDRED).dividedBy(TWELVE);
  return Array.from({ length: months }, () => monthly);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function valueOf(result: MetricResult, what: string): Decimal {
  if (result.value === null) {
    throw new Error(`${what}: unavailable (${result.reason ?? 'no reason'})`);
  }
  return result.value;
}

function expectWithin(actual: Decimal, published: string, tol: Decimal, what: string): void {
  const expected = toDecimal(published);
  const delta = actual.minus(expected);
  expect(
    delta.abs().lessThanOrEqualTo(tol),
    `${what}: ours ${actual.toFixed(4)} vs published ${expected.toString()} (delta ${delta.toFixed(4)}, tolerance ±${tol.toString()})`,
  ).toBe(true);
}

/** Fraction → percentage points, the unit the factsheets print returns and σ in. */
const pp = (x: Decimal): Decimal => x.times(HUNDRED);

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

for (const spec of SCHEMES) {
  describe(`§10.4 ${spec.label} (${spec.code}) — asOf 2026-07-31`, () => {
    const loaded = loadScheme(spec.code);
    const { published, asOf } = loaded;

    /**
     * `it` normally; `it.fails` when the figure is in the honesty table, with
     * the delta and cause appended so a reader of the vitest summary does not
     * need to open this file to learn why.
     */
    function itOrKnownMiss(key: string, name: string, body: () => void): void {
      const miss = spec.knownMisses[key];
      if (miss === undefined) {
        it(name, body);
      } else {
        it.fails(`${name} — KNOWN MISS delta ${miss.delta}: ${miss.cause}`, body);
      }
    }

    it('window: 36 aligned monthly returns Aug 2023 → Jul 2026', () => {
      const w = threeYearWindow(loaded.regular, loaded);
      expect(w.dates).toHaveLength(RISK_ADJUSTED_MONTHS);
      expect(w.dates[0]!.toISOString().slice(0, 10)).toBe('2023-08-31');
      expect(w.dates[RISK_ADJUSTED_MONTHS - 1]!.toISOString().slice(0, 10)).toBe('2026-07-31');
      // The last NAV on or before asOf must BE asOf: 31 Jul 2026 was a
      // trading day and every factsheet quotes its NAV. If the capture were
      // missing that day the "3-year" window would silently end a day early.
      expect(loaded.direct[loaded.direct.length - 1]!.date.getTime()).toBe(asOf.getTime());
      expect(loaded.regular[loaded.regular.length - 1]!.date.getTime()).toBe(asOf.getTime());
    });

    describe('point-to-point returns (02 §2.1, ±0.05 pp)', () => {
      const plans: ReadonlyArray<{ plan: string; series: SeriesPoint[]; figures: PublishedHorizons | null }> = [
        { plan: 'direct', series: loaded.direct, figures: published.returns.direct },
        { plan: 'regular', series: loaded.regular, figures: published.returns.regular },
        { plan: 'benchmark', series: loaded.benchmark, figures: published.returns.benchmark },
      ];
      for (const { plan, series, figures } of plans) {
        if (figures === null) continue;
        for (const { key, years } of HORIZONS) {
          const target = figures[key];
          if (target === undefined) continue;
          if (plan === 'benchmark' && years === 10) {
            // The NSE TRI capture starts 2016-09-06; a 10-year window from
            // 2026-07-31 needs 2016-07-29. Assert the gap is reported, not
            // papered over with a since-inception figure.
            it(`benchmark 10y: unavailable (TRI series starts after the window start)`, () => {
              expect(windowStartPoint(series, asOf, 10)).toBeNull();
              expect(horizonCagr(series, asOf, 10).reason).toBe('insufficient_observations');
            });
            continue;
          }
          itOrKnownMiss(`${plan}.${key}`, `${plan} ${years}y = ${target}%`, () => {
            const ours = pp(valueOf(horizonCagr(series, asOf, years), `${plan} ${years}y`));
            expectWithin(ours, target, RETURN_TOL_PP, `${plan} ${years}y return (pp)`);
          });
        }
      }
    });

    describe('3-year ratios on the Regular plan — the plan the AMC computed on', () => {
      const w = threeYearWindow(loaded.regular, loaded);

      itOrKnownMiss('regular.stdDev3y', `σ (annualised, ±0.1 pp) = ${published.stdDev3y}%`, () => {
        expectWithin(pp(valueOf(stdDevAnn(w.fund), 'σ')), published.stdDev3y, STDDEV_TOL_PP, 'σ 3y (pp)');
      });

      itOrKnownMiss('regular.beta3y', `β vs ${published.benchmarkIndexCode} (±0.03) = ${published.beta3y}`, () => {
        expectWithin(valueOf(beta(w.fund, w.bench, w.rfDoc), 'β'), published.beta3y, BETA_TOL, 'β 3y');
      });

      itOrKnownMiss(
        'regular.sharpe3y.docConvention',
        `Sharpe, doc convention (FBIL 3M T-bill series, geometric monthly rf; ±0.03) = ${published.sharpe3y}`,
        () => {
          expectWithin(valueOf(sharpe(w.fund, w.rfDoc), 'Sharpe'), published.sharpe3y, SHARPE_TOL, 'Sharpe 3y');
        },
      );

      // Attribution, not a second chance: the same function with the AMC's
      // own rf isolates how much of any gap is the risk-free series. Mirae
      // does not print its rate; 5.41% is the FBIL overnight MIBOR HDFC and
      // Nippon both quote for the same date.
      const factsheetRf = published.riskFreeAnnualPct ?? '5.41';
      itOrKnownMiss(
        'regular.sharpe3y.factsheetRf',
        `Sharpe with the factsheet's rf (constant ${factsheetRf}% MIBOR, ÷12; ±0.03) = ${published.sharpe3y}`,
        () => {
          const rf = constantMonthlyRf(factsheetRf, w.fund.length);
          expectWithin(valueOf(sharpe(w.fund, rf), 'Sharpe'), published.sharpe3y, SHARPE_TOL, 'Sharpe 3y (factsheet rf)');
        },
      );
    });

    describe('3-year ratios on the Direct plan — the fixture scheme', () => {
      const w = threeYearWindow(loaded.direct, loaded);

      // σ and β barely see the plan: the TER gap is a near-constant drag on
      // returns, and neither statistic depends on the level.
      itOrKnownMiss('direct.stdDev3y', `σ (annualised, ±0.1 pp) = ${published.stdDev3y}%`, () => {
        expectWithin(pp(valueOf(stdDevAnn(w.fund), 'σ')), published.stdDev3y, STDDEV_TOL_PP, 'σ 3y (pp)');
      });

      itOrKnownMiss('direct.beta3y', `β vs ${published.benchmarkIndexCode} (±0.03) = ${published.beta3y}`, () => {
        expectWithin(valueOf(beta(w.fund, w.bench, w.rfDoc), 'β'), published.beta3y, BETA_TOL, 'β 3y');
      });

      // Sharpe does see the plan. For HDFC and Nippon this passes, and it
      // passes for the wrong reason: the Direct plan's ~0.7–1 pp/yr higher
      // return and the T-bill series' ~0.7 pp higher rf cancel. The README's
      // comparison tables show both halves; the Regular-plan `it` above is
      // the evidence, this one is the fixture-scheme record.
      itOrKnownMiss(
        'direct.sharpe3y.docConvention',
        `Sharpe, doc convention (±0.03) = ${published.sharpe3y} (Direct plan; see header — a pass here is offsetting differences)`,
        () => {
          expectWithin(valueOf(sharpe(w.fund, w.rfDoc), 'Sharpe'), published.sharpe3y, SHARPE_TOL, 'Sharpe 3y');
        },
      );
    });
  });
}
