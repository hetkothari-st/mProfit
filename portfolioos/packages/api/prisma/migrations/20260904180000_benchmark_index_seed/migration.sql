-- =============================================================================
-- Benchmark index seed — docs/mf-analytics/01-DATA-FOUNDATION.md §3 and §6,
-- 00-README.md invariant 9, 07-IMPLEMENTATION-PLAN.md Task 1.3.
--
-- Seeds the 14 rows of `BENCHMARK_INDEX_SEED`
-- (packages/api/src/priceFeeds/benchmarkIndexSeed.ts) into `BenchmarkIndex`,
-- and makes it STRUCTURALLY IMPOSSIBLE for a price-return index to be seeded.
-- =============================================================================
--
-- -----------------------------------------------------------------------------
-- WHY A PRICE-RETURN INDEX IS REJECTED IN THE DATABASE AND NOT ONLY IN CODE
-- -----------------------------------------------------------------------------
-- A Price Return Index (PRI) tracks only the price movement of its
-- constituents. A Total Return Index (TRI) additionally reinvests every
-- dividend those constituents pay, on the ex-date, back into the index level.
--
-- A mutual fund's NAV is, by construction, a total-return series. When a
-- portfolio company pays a dividend the cash lands in the scheme and lifts the
-- NAV. So a fund NAV is comparable to a TRI and to nothing else. Measuring a
-- fund against a PRI compares a series that KEEPS its dividends against one
-- that THROWS THEM AWAY, and hands the fund the entire dividend yield of the
-- market as free, permanent, invented outperformance.
--
-- For Indian equity that yield has run roughly 1.2%-1.5% per year over the last
-- decade. Every number downstream inherits it:
--
--   * alpha                 overstated by ~the dividend yield, every year
--   * information ratio     numerator inflated, denominator untouched
--   * "% of periods beating the benchmark" — a closet index fund flips from
--                           losing to winning purely on this artefact
--   * up/down capture, M2, and the consistency pillar of 03-SCORING.md
--   * and therefore the star rating shown to the user
--
-- The failure is silent and undetectable by the person harmed by it: the
-- numbers look plausible, they are internally consistent with each other, and
-- they are all wrong in the same direction. This is not hypothetical — SEBI
-- mandated the industry-wide switch to TRI benchmarks in February 2018 for
-- exactly this reason. AMCs had been benchmarking against PRIs and reporting
-- alpha that did not exist.
--
-- 01 §6 therefore specifies rejection "at seed time", not at metric time. Once
-- a `MfSchemeMetrics` row has been computed against a bad benchmark, the error
-- is baked into a persisted, `asOf`-stamped, append-only artefact
-- (00-README invariant 7) that will be read for years by code that has no way
-- to know it is poisoned.
--
-- `assertTotalReturnIndex()` enforces this in TypeScript. That is necessary and
-- not sufficient: application code can be bypassed by a migration, a psql
-- session, an ops script, a data fix, or the next contributor who writes a
-- second insert path and does not know the rule exists. The constraint below is
-- the half that cannot be bypassed. Belt AND braces, deliberately, because the
-- cost of the belt failing is silently wrong advice about other people's money.
--
-- -----------------------------------------------------------------------------
-- WHY A CHECK CONSTRAINT AND NOT A TRIGGER
-- -----------------------------------------------------------------------------
-- A CHECK is declarative, visible in `\d "BenchmarkIndex"`, costs nothing, and
-- cannot be accidentally disabled by a session setting. `isTotalReturn` stays a
-- real column rather than being dropped so that the intent stays legible and so
-- the TypeScript guard has something to test — a future contributor adding a
-- PRI gets a loud error from either layer, not a silent acceptance.
--
-- NOTE FOR SCHEMA MAINTAINERS: Prisma's schema language cannot express a CHECK
-- constraint, so this constraint lives only here. `prisma migrate deploy` and
-- `prisma db execute` preserve it; a `prisma migrate dev --create-only` diff
-- will not mention it, and a `prisma db push` against a scratch database will
-- not recreate it. Do not "clean up" the drift by dropping it.
-- =============================================================================

-- Idempotent: re-running this migration, or applying it to a database where an
-- operator already created the constraint by hand, must not fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BenchmarkIndex_isTotalReturn_check'
      AND conrelid = '"BenchmarkIndex"'::regclass
  ) THEN
    ALTER TABLE "BenchmarkIndex"
      ADD CONSTRAINT "BenchmarkIndex_isTotalReturn_check"
      CHECK ("isTotalReturn" = true);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- The seed itself.
--
-- Codes, names and providers are copied verbatim from `BENCHMARK_INDEX_SEED`.
-- The two lists are checked against each other by
-- test/jobs/benchmarkJobs.test.ts, which fails if they drift.
--
-- `ON CONFLICT ("code") DO NOTHING` — the migration is idempotent and never
-- overwrites. DO UPDATE would be wrong: if an operator has corrected a name or
-- a provider against the live source, a redeploy must not silently revert it.
--
-- The `WHERE "isTotalReturn"` guard on the SELECT is redundant with the CHECK
-- above and is kept anyway. It states the rule at the point of the write, so a
-- reader of the INSERT does not have to know the constraint exists, and it
-- degrades safely (skipping the row) if a future migration ever weakens the
-- constraint. Redundancy is the point: this is the rule that must not fail.
-- -----------------------------------------------------------------------------
INSERT INTO "BenchmarkIndex" ("code", "name", "provider", "isTotalReturn")
SELECT s.code, s.name, s.provider, s."isTotalReturn"
FROM (
  VALUES
    -- NSE broad-market equity TRI (niftyindices.com historical download)
    ('NIFTY50_TRI',                            'Nifty 50 TRI',                                  'NSE',    true),
    ('NIFTY100_TRI',                           'Nifty 100 TRI',                                 'NSE',    true),
    ('NIFTY200_TRI',                           'Nifty 200 TRI',                                 'NSE',    true),
    ('NIFTY500_TRI',                           'Nifty 500 TRI',                                 'NSE',    true),
    ('NIFTY_MIDCAP150_TRI',                    'Nifty Midcap 150 TRI',                          'NSE',    true),
    ('NIFTY_SMALLCAP250_TRI',                  'Nifty Smallcap 250 TRI',                        'NSE',    true),
    ('NIFTY_LARGEMIDCAP250_TRI',               'Nifty LargeMidcap 250 TRI',                     'NSE',    true),
    ('NIFTY_MIDSMALLCAP400_TRI',               'Nifty MidSmallcap 400 TRI',                     'NSE',    true),

    -- NSE hybrid. SEBI's prescribed benchmark for aggressive-hybrid and
    -- balanced-advantage schemes; published on a different niftyindices
    -- endpoint from the broad-market download.
    ('NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI','NIFTY 50 Hybrid Composite Debt 65:35 Index TRI','NSE',    true),

    -- NSE fixed income. These are total-return BY CONSTRUCTION — they accrue
    -- coupon income into the index level and have no separate price-return
    -- variant, which is why their published names carry no "TRI" suffix. 01 §3
    -- explicitly allows a whitelist for exactly this case. Do not "fix" the
    -- names by appending TRI.
    ('NIFTY_SHORT_DURATION_DEBT',              'Nifty Short Duration Debt Index',               'NSE',    true),
    ('NIFTY_CORPORATE_BOND',                   'Nifty Corporate Bond Index',                    'NSE',    true),
    ('NIFTY_LIQUID',                           'Nifty Liquid Index',                            'NSE',    true),

    -- CRISIL. The most commonly mandated debt-fund benchmark in India. CRISIL
    -- licenses its history; there is no free daily download. Seeded so schemes
    -- can reference the correct benchmark code — seeding a code asserts "this
    -- is a legitimate benchmark", NOT "we can populate it". See
    -- BENCHMARK_TRI_NOT_FREELY_AVAILABLE; schemes benchmarked here must degrade
    -- to BENCHMARK_UNAVAILABLE rather than compare against nothing.
    ('CRISIL_COMPOSITE_BOND',                  'CRISIL Composite Bond Fund Index',              'CRISIL', true),

    -- BSE
    ('SENSEX_TRI',                             'S&P BSE SENSEX TRI',                            'BSE',    true)
) AS s(code, name, provider, "isTotalReturn")
WHERE s."isTotalReturn"
ON CONFLICT ("code") DO NOTHING;
