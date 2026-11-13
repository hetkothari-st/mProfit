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
 * An NSE index that index funds track, with everything needed to price it and
 * to recognise it in a fund's name.
 */
export interface NseTrackedIndex {
  readonly code: string;
  readonly name: string;
  /** The `Trading_Index_Name` niftyindices.com answers to, upper-cased. */
  readonly requestName: string;
  /**
   * How a scheme name spells the index once the AMC and wrapper words are
   * stripped. Compared after `normaliseIndexName` in `amfiSchemeMaster.v1.ts`,
   * so spacing ("Nifty50" / "Nifty 50"), hyphens and `&` need no variants.
   */
  readonly aliases: readonly string[];
}

/**
 * Sectoral, thematic and factor indices that Indian index funds and ETFs
 * track, beyond the eight broad-market ones.
 *
 * Every entry was probed live on 2026-10-26 against
 * `POST niftyindices.com/BackPage/getTotalReturnIndexString` with its
 * `requestName` and returned 2,663+ daily TRI rows from 01-Jan-2016 to
 * 30-Sep-2026. The list is the indices that the unbenchmarked index funds
 * in the AMFI master actually name (Next 50 alone covers 31 schemes) — not
 * the full catalogue of 260, most of which no fund tracks.
 *
 * Deliberately absent, because no free TRI exists: BSE indices (Sensex,
 * BSE 500 — see `SENSEX_TRI` below), target-maturity SDL / G-Sec ladders,
 * gold and silver, and overseas indices (S&P 500, NASDAQ 100, Hang Seng).
 * Those funds stay unbenchmarked and unrated, which is the honest answer.
 */
export const NSE_TRACKED_INDICES: readonly NseTrackedIndex[] = [
  { code: 'NIFTY_NEXT50_TRI', name: 'Nifty Next 50 TRI', requestName: 'NIFTY NEXT 50', aliases: ['nifty next 50'] },
  { code: 'NIFTY_MIDCAP50_TRI', name: 'Nifty Midcap 50 TRI', requestName: 'NIFTY MIDCAP 50', aliases: ['nifty midcap 50'] },
  { code: 'NIFTY_MIDCAP100_TRI', name: 'Nifty Midcap 100 TRI', requestName: 'NIFTY MIDCAP 100', aliases: ['nifty midcap 100'] },
  { code: 'NIFTY_SMALLCAP50_TRI', name: 'Nifty Smallcap 50 TRI', requestName: 'NIFTY SMLCAP 50', aliases: ['nifty smallcap 50'] },
  { code: 'NIFTY_MICROCAP250_TRI', name: 'Nifty Microcap 250 TRI', requestName: 'NIFTY MICROCAP250', aliases: ['nifty microcap 250'] },
  // Sectoral
  { code: 'NIFTY_BANK_TRI', name: 'Nifty Bank TRI', requestName: 'NIFTY BANK', aliases: ['nifty bank'] },
  { code: 'NIFTY_PRIVATE_BANK_TRI', name: 'Nifty Private Bank TRI', requestName: 'NIFTY PVT BANK', aliases: ['nifty private bank', 'nifty pvt bank'] },
  { code: 'NIFTY_PSU_BANK_TRI', name: 'Nifty PSU Bank TRI', requestName: 'NIFTY PSU BANK', aliases: ['nifty psu bank'] },
  { code: 'NIFTY_FIN_SERVICES_TRI', name: 'Nifty Financial Services TRI', requestName: 'NIFTY FIN SERVICE', aliases: ['nifty financial services'] },
  { code: 'NIFTY_FIN_SERVICES_EX_BANK_TRI', name: 'Nifty Financial Services Ex-Bank TRI', requestName: 'NIFTY FINSEREXBNK', aliases: ['nifty financial services ex bank'] },
  { code: 'NIFTY_IT_TRI', name: 'Nifty IT TRI', requestName: 'NIFTY IT', aliases: ['nifty it'] },
  { code: 'NIFTY_PHARMA_TRI', name: 'Nifty Pharma TRI', requestName: 'NIFTY PHARMA', aliases: ['nifty pharma'] },
  { code: 'NIFTY_HEALTHCARE_TRI', name: 'Nifty Healthcare TRI', requestName: 'NIFTY HEALTHCARE', aliases: ['nifty healthcare'] },
  { code: 'NIFTY_AUTO_TRI', name: 'Nifty Auto TRI', requestName: 'NIFTY AUTO', aliases: ['nifty auto'] },
  { code: 'NIFTY_FMCG_TRI', name: 'Nifty FMCG TRI', requestName: 'NIFTY FMCG', aliases: ['nifty fmcg'] },
  // Thematic
  { code: 'NIFTY_INDIA_CONSUMPTION_TRI', name: 'Nifty India Consumption TRI', requestName: 'NIFTY CONSUMPTION', aliases: ['nifty india consumption'] },
  { code: 'NIFTY_INFRA_TRI', name: 'Nifty Infrastructure TRI', requestName: 'NIFTY INFRA', aliases: ['nifty infrastructure', 'nifty infra'] },
  { code: 'NIFTY_COMMODITIES_TRI', name: 'Nifty Commodities TRI', requestName: 'NIFTY COMMODITIES', aliases: ['nifty commodities'] },
  { code: 'NIFTY_MNC_TRI', name: 'Nifty MNC TRI', requestName: 'NIFTY MNC', aliases: ['nifty mnc'] },
  { code: 'NIFTY_INDIA_MANUFACTURING_TRI', name: 'Nifty India Manufacturing TRI', requestName: 'NIFTY INDIA MFG', aliases: ['nifty india manufacturing'] },
  { code: 'NIFTY_INDIA_DIGITAL_TRI', name: 'Nifty India Digital TRI', requestName: 'NIFTY IND DIGITAL', aliases: ['nifty india digital'] },
  { code: 'NIFTY100_ESG_SECTOR_LEADERS_TRI', name: 'Nifty100 ESG Sector Leaders TRI', requestName: 'NIFTY100ESGSECLDR', aliases: ['nifty 100 esg sector leaders'] },
  { code: 'NIFTY50_SHARIAH_TRI', name: 'Nifty50 Shariah TRI', requestName: 'NIFTY50 SHARIAH', aliases: ['nifty 50 shariah'] },
  // Factor / strategy
  { code: 'NIFTY50_EQUAL_WEIGHT_TRI', name: 'Nifty50 Equal Weight TRI', requestName: 'NIFTY50 EQL WGT', aliases: ['nifty 50 equal weight'] },
  { code: 'NIFTY100_EQUAL_WEIGHT_TRI', name: 'Nifty100 Equal Weight TRI', requestName: 'NIFTY100 EQL WGT', aliases: ['nifty 100 equal weight'] },
  { code: 'NIFTY50_VALUE20_TRI', name: 'Nifty50 Value 20 TRI', requestName: 'NIFTY50 VALUE 20', aliases: ['nifty 50 value 20'] },
  { code: 'NIFTY500_VALUE50_TRI', name: 'Nifty500 Value 50 TRI', requestName: 'NIFTY500 VALUE 50', aliases: ['nifty 500 value 50'] },
  { code: 'NIFTY100_LOW_VOL30_TRI', name: 'Nifty100 Low Volatility 30 TRI', requestName: 'NIFTY100 LOWVOL30', aliases: ['nifty 100 low volatility 30'] },
  { code: 'NIFTY100_QUALITY30_TRI', name: 'Nifty100 Quality 30 TRI', requestName: 'NIFTY100 QUALTY30', aliases: ['nifty 100 quality 30'] },
  { code: 'NIFTY200_QUALITY30_TRI', name: 'Nifty200 Quality 30 TRI', requestName: 'NIFTY200 QUALITY 30', aliases: ['nifty 200 quality 30'] },
  { code: 'NIFTY200_MOMENTUM30_TRI', name: 'Nifty200 Momentum 30 TRI', requestName: 'NIFTY200MOMENTM30', aliases: ['nifty 200 momentum 30'] },
  { code: 'NIFTY_MIDCAP150_MOMENTUM50_TRI', name: 'Nifty Midcap150 Momentum 50 TRI', requestName: 'NIFTYM150MOMNTM50', aliases: ['nifty midcap 150 momentum 50'] },
  { code: 'NIFTY_MIDCAP150_QUALITY50_TRI', name: 'Nifty Midcap150 Quality 50 TRI', requestName: 'NIFTY M150 QLTY50', aliases: ['nifty midcap 150 quality 50'] },
  { code: 'NIFTY_ALPHA50_TRI', name: 'Nifty Alpha 50 TRI', requestName: 'NIFTY ALPHA 50', aliases: ['nifty alpha 50'] },
  { code: 'NIFTY_ALPHA_LOW_VOL30_TRI', name: 'Nifty Alpha Low-Volatility 30 TRI', requestName: 'NIFTY ALPHALOWVOL', aliases: ['nifty alpha low volatility 30'] },
];

/**
 * The seed. Codes are exactly those listed in `01 §3` plus a BSE Sensex TRI,
 * plus the index-fund benchmarks in `NSE_TRACKED_INDICES`.
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

  // --- NSE sectoral, thematic and factor TRI (index-fund benchmarks) ---------
  ...NSE_TRACKED_INDICES.map(
    (i): BenchmarkIndexSeedEntry => ({
      code: i.code,
      name: i.name,
      provider: 'NSE',
      isTotalReturn: true,
    }),
  ),

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
