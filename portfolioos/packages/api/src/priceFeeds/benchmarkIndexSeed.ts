/**
 * Seed list of benchmark indices used by the MF analytics layer
 * (`docs/mf-analytics/01-DATA-FOUNDATION.md` §3, Task 1.3 in `07`).
 *
 * PURE MODULE. No Prisma, no network, no fs. The seed migration and
 * `benchmarkPriceJob` import this array; this file must stay importable from a
 * unit test with no database.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE REFUSES PRICE-RETURN INDICES (read before adding an entry)
 * ---------------------------------------------------------------------------
 * A Price Return Index (PRI) tracks only the price movement of its
 * constituents. A Total Return Index (TRI) additionally reinvests every
 * dividend the constituents pay, on the ex-date, back into the index.
 *
 * A mutual fund's NAV is, by construction, a total-return series: when a
 * portfolio company pays a dividend the cash lands in the scheme and lifts the
 * NAV. So a fund NAV is only comparable to a TRI. Measuring a fund against a
 * PRI compares a series that keeps its dividends against one that throws them
 * away, and hands the fund the entire dividend yield of the market as free
 * outperformance.
 *
 * For Indian equity that yield has run roughly 1.2%-1.5% p.a. over the last
 * decade. Every downstream number inherits it:
 *
 *   - alpha            overstated by ~the dividend yield
 *   - information ratio overstated (numerator inflated, denominator unchanged)
 *   - "% of periods beating the benchmark" — a closet index fund flips from
 *     losing to winning purely on this artefact
 *   - up/down capture, M2, the consistency pillar of `03-SCORING.md`
 *   - and therefore the star rating we show the user
 *
 * The failure is silent and undetectable by the user: the numbers look
 * plausible, they are internally consistent, and they are all wrong in the same
 * direction. SEBI mandated the TRI switch in Feb 2018 for exactly this reason —
 * AMCs were benchmarking against PRIs and reporting alpha that did not exist.
 *
 * Hence: `isTotalReturn: false` is rejected at **seed time**
 * (`01 §6`: "Benchmark index `isTotalReturn = false` used as benchmark →
 * reject at seed time"), not at metric time. A bad benchmark must never reach
 * the database, because once a `MfSchemeMetric` row is computed against it, the
 * error is baked into a persisted, `asOf`-stamped, append-only artefact.
 * `test/invariants/mf-benchmark-tri-only.test.ts` (`06 §1`) pins this.
 *
 * ---------------------------------------------------------------------------
 * AVAILABILITY: this seed is NOT fully populated from free sources
 * ---------------------------------------------------------------------------
 * Seeding an index code says "this is a legitimate benchmark", not "we can
 * download ten years of it tonight". The codes listed in
 * `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` have no verified free daily TRI
 * download; the backfill will produce zero or partial rows for them, and any
 * scheme benchmarked to one of them must degrade to `BENCHMARK_UNAVAILABLE`
 * (`02-METRICS.md §1`) rather than silently comparing against nothing.
 * Do not assume a seeded code implies a populated series.
 */

/** Who publishes the index. Determines which parser/feed fetches it. */
export type BenchmarkProvider = 'NSE' | 'BSE' | 'CRISIL';

/**
 * Shape kept to exactly the four fields the seed migration writes. Extra
 * metadata (availability) lives in a sibling constant rather than on the entry,
 * so a `createMany` over this array cannot fail on an unknown column.
 */
export interface BenchmarkIndexSeedEntry {
  /** Stable internal code. Referenced by `MfSchemeMeta.benchmarkIndexCode`. */
  readonly code: string;
  /** Human-facing name, as the provider publishes it. */
  readonly name: string;
  readonly provider: BenchmarkProvider;
  /** MUST be true. See the essay above. Kept as a field, not hard-coded true,
   *  precisely so `assertTotalReturnIndex` has something to reject — a future
   *  contributor adding a PRI will hit a throw, not a silent acceptance. */
  readonly isTotalReturn: boolean;
}

/**
 * Thrown by `assertTotalReturnIndex`. A distinct class so the seed migration
 * can fail loudly and a test can assert on the type rather than a message.
 */
export class PriceReturnIndexRejectedError extends Error {
  constructor(public readonly code: string) {
    super(
      `Benchmark "${code}" is a price-return index. Price-return indices are ` +
        `rejected at seed time: fund NAVs are total-return series, so alpha ` +
        `measured against a PRI is overstated by roughly the market's ` +
        `dividend yield (~1.2-1.5% p.a. in India) and every rating derived ` +
        `from it is inflated in a way no user can detect. Source a TRI series ` +
        `for this index, or do not benchmark against it.`,
    );
    this.name = 'PriceReturnIndexRejectedError';
  }
}

/**
 * Gate every benchmark before it is written or used. Throws on a PRI.
 *
 * Call sites: the seed migration (once per entry), and any code path that
 * resolves a scheme's `benchmarkIndexCode` to an index row before computing a
 * relative metric. Cheap enough to call on both.
 */
export function assertTotalReturnIndex(
  entry: Pick<BenchmarkIndexSeedEntry, 'code' | 'isTotalReturn'>,
): void {
  if (!entry.isTotalReturn) {
    throw new PriceReturnIndexRejectedError(entry.code);
  }
}

/**
 * The seed. Codes are exactly those listed in `01 §3` plus a BSE Sensex TRI.
 *
 * NSE fixed-income indices (`NIFTY_SHORT_DURATION_DEBT`,
 * `NIFTY_CORPORATE_BOND`, `NIFTY_LIQUID`) are marked `isTotalReturn: true`
 * because NSE's bond indices are total-return **by construction** — they
 * accrue coupon income into the index level; there is no separate PRI variant,
 * which is why their published names carry no "TRI" suffix. The
 * "name must contain TRI" heuristic in `01 §3` explicitly allows a whitelist,
 * and this is it. Do not "fix" the names by appending TRI.
 */
export const BENCHMARK_INDEX_SEED: readonly BenchmarkIndexSeedEntry[] = [
  // --- NSE broad-market equity TRI (niftyindices.com historical CSV) --------
  { code: 'NIFTY50_TRI', name: 'Nifty 50 TRI', provider: 'NSE', isTotalReturn: true },
  { code: 'NIFTY100_TRI', name: 'Nifty 100 TRI', provider: 'NSE', isTotalReturn: true },
  { code: 'NIFTY200_TRI', name: 'Nifty 200 TRI', provider: 'NSE', isTotalReturn: true },
  { code: 'NIFTY500_TRI', name: 'Nifty 500 TRI', provider: 'NSE', isTotalReturn: true },
  {
    code: 'NIFTY_MIDCAP150_TRI',
    name: 'Nifty Midcap 150 TRI',
    provider: 'NSE',
    isTotalReturn: true,
  },
  {
    code: 'NIFTY_SMALLCAP250_TRI',
    name: 'Nifty Smallcap 250 TRI',
    provider: 'NSE',
    isTotalReturn: true,
  },
  {
    code: 'NIFTY_LARGEMIDCAP250_TRI',
    name: 'Nifty LargeMidcap 250 TRI',
    provider: 'NSE',
    isTotalReturn: true,
  },
  {
    code: 'NIFTY_MIDSMALLCAP400_TRI',
    name: 'Nifty MidSmallcap 400 TRI',
    provider: 'NSE',
    isTotalReturn: true,
  },

  // --- NSE hybrid ----------------------------------------------------------
  // The SEBI-prescribed benchmark for aggressive hybrid / balanced advantage
  // schemes. Published by NSE under multi-asset indices, but NOT served by the
  // public historical-data endpoints (probed 2026-09-07 — see
  // BENCHMARK_TRI_NOT_FREELY_AVAILABLE).
  {
    code: 'NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI',
    name: 'NIFTY 50 Hybrid Composite Debt 65:35 Index TRI',
    provider: 'NSE',
    isTotalReturn: true,
  },

  // --- NSE debt (total-return by construction; see note above) --------------
  {
    code: 'NIFTY_SHORT_DURATION_DEBT',
    name: 'Nifty Short Duration Debt Index',
    provider: 'NSE',
    isTotalReturn: true,
  },
  {
    code: 'NIFTY_CORPORATE_BOND',
    name: 'Nifty Corporate Bond Index',
    provider: 'NSE',
    isTotalReturn: true,
  },
  { code: 'NIFTY_LIQUID', name: 'Nifty Liquid Index', provider: 'NSE', isTotalReturn: true },

  // --- CRISIL --------------------------------------------------------------
  // The most commonly mandated debt-fund benchmark in India. CRISIL licenses
  // its index history; there is no free daily download. Seeded so schemes can
  // reference the correct benchmark code, but see the availability list below.
  {
    code: 'CRISIL_COMPOSITE_BOND',
    name: 'CRISIL Composite Bond Fund Index',
    provider: 'CRISIL',
    isTotalReturn: true,
  },

  // --- BSE -----------------------------------------------------------------
  // Seeded so a scheme can name the correct benchmark, but NOT populated: BSE
  // publishes no free total-return series (verified 2026-09-07 — see
  // BENCHMARK_TRI_NOT_FREELY_AVAILABLE below and `bseIndices.v1.ts`).
  { code: 'SENSEX_TRI', name: 'S&P BSE SENSEX TRI', provider: 'BSE', isTotalReturn: true },
];

/**
 * Codes with **no free daily TRI feed**. Every entry below was probed against
 * the live sources on **2026-09-07**; this list is findings, not guesses.
 *
 * What IS available (so, deliberately absent from this list): the eight
 * broad-market NSE equity TRI codes, all confirmed to return real rows from
 * `POST niftyindices.com/BackPage/getTotalReturnIndexString`. See
 * `NSE_INDEX_REQUEST_NAME` in `nseIndices.v1.ts` for the exact names.
 *
 * - `CRISIL_COMPOSITE_BOND` — CRISIL licenses its index history as a paid
 *   product. There is no provider endpoint to probe. Nothing will backfill it.
 *
 * - `NIFTY_SHORT_DURATION_DEBT`, `NIFTY_CORPORATE_BOND`, `NIFTY_LIQUID`,
 *   `NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI` — real NSE indices, but the
 *   public historical-data tool does not serve them. Each was requested under
 *   several spellings from BOTH `/BackPage/getTotalReturnIndexString` and
 *   `/BackPage/getHistoricaldatatabletoString`, and every attempt returned an
 *   empty array with HTTP 200 (the same answer a nonsense index name gets).
 *   They are absent from the site's own `IndexMapping.json` too, which lists
 *   258 indices including dozens of other bond series. NSE puts fixed-income
 *   and hybrid history behind its paid data subscription. The earlier belief
 *   that these sat on a "separate niftyindices path" was wrong: the
 *   fixed-income G-Sec series that ARE public (e.g. "Nifty GS Compsite")
 *   answer on the very same endpoint, so there is no other path to find.
 *
 * - `SENSEX_TRI` — **newly added to this list.** BSE publishes no free
 *   total-return series at all. Its archive picker (`FillddlIndex`) lists 149
 *   indices and not one is a TR variant; eight plausible TR codes all returned
 *   `{"Table":[]}`; and its daily all-index snapshot CSV is price-return only.
 *   The available `SENSEX` code is the PRICE-RETURN index (72,271.94 on
 *   01-Jan-2024, roughly 38,000 points below the Sensex TRI that day) and must
 *   never be substituted — see the essay above and `bseIndices.v1.ts`.
 *
 * `benchmarkPriceJob` should not raise the `06 §7` "no new row for > 3 business
 * days" alert for a code in this list — an alert that fires every day for a
 * source we know we do not have is noise that trains people to ignore alerts.
 */
export const BENCHMARK_TRI_NOT_FREELY_AVAILABLE: readonly string[] = [
  'CRISIL_COMPOSITE_BOND',
  'NIFTY_SHORT_DURATION_DEBT',
  'NIFTY_CORPORATE_BOND',
  'NIFTY_LIQUID',
  'NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI',
  'SENSEX_TRI',
];

/** Lookup by code. Returns `undefined` for an unknown code — callers decide
 *  whether that is `BENCHMARK_UNAVAILABLE` or a hard error. */
export function findBenchmarkSeed(code: string): BenchmarkIndexSeedEntry | undefined {
  return BENCHMARK_INDEX_SEED.find((e) => e.code === code);
}
