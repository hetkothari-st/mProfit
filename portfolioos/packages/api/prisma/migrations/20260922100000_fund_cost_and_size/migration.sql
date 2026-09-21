-- Real fund cost and size, from AMFI's published files.
--
-- v1 of the ranking methodology scored funds with no TER and no AUM because
-- this repo held neither; both were recorded as data gaps and their weight
-- redistributed. These columns close that, and v2 of the methodology uses them.
--
-- `planType` / `optionType` exist because AMFI's NAVAll file gained explicit
-- Plan and Option columns: eligibility no longer has to infer "direct" and
-- "growth" from the scheme name, which was the weakest link in the gate that
-- keeps commission-bearing regular plans out of advice.
--
-- Every column is nullable on purpose. A fund we have no TER for must read as
-- UNKNOWN, never as zero — zero would rank it the cheapest in its bucket.

ALTER TABLE "MutualFundMaster"
    ADD COLUMN "planType" TEXT,
    ADD COLUMN "optionType" TEXT,
    ADD COLUMN "terPct" DECIMAL(8,4),
    ADD COLUMN "terAsOf" DATE,
    -- MATCHED | UNMATCHED | AMBIGUOUS, for the direct-growth population only.
    -- The TER file carries no scheme code and no ISIN, so the join is made on
    -- (AMC, scheme name) and can legitimately fail. Recording how it failed is
    -- what lets the ranking report a `ter_unmatched` gap rather than a bare
    -- "no TER", which reads identically whether AMFI omitted the scheme or the
    -- name turned out not to identify one.
    ADD COLUMN "terJoinStatus" TEXT,
    ADD COLUMN "aumInr" DECIMAL(20,4),
    ADD COLUMN "aumAsOf" DATE;

-- The scoring job reads the whole universe by plan and option every night.
CREATE INDEX "MutualFundMaster_planType_optionType_idx"
    ON "MutualFundMaster"("planType", "optionType");

-- AMFI's TER file carries no AMFI scheme code and no ISIN — only a base scheme
-- name — so that name is the join key and is looked up on every TER refresh.
CREATE INDEX "MutualFundMaster_schemeName_idx" ON "MutualFundMaster"("schemeName");

-- The join is (AMC, scheme name), so the AMC is half the key.
CREATE INDEX "MutualFundMaster_amcName_schemeName_idx"
    ON "MutualFundMaster"("amcName", "schemeName");

-- ─── Methodology v2 ──────────────────────────────────────────────
-- Seeded unsigned, exactly as v1 was: `ensureSignedMethodology` stamps the
-- configured principal officer at job start, and an unsigned version is never
-- used for advice. Shipping it pre-signed would put a signature on weights
-- nobody has approved.
--
-- Changes from v1, all of which depend on the columns above:
--   * TER is scored again — 40 of the passive weight and 15 of the active
--     weight that v1 had to redistribute for want of the data.
--   * A fund with no AUM is now INELIGIBLE rather than scored without it.
--     With a real source, a missing figure means a scheme we cannot size, and
--     size is what decides whether one redemption moves the portfolio.
--   * Everything still missing keeps the v1 behaviour: excluded from the
--     score, weight redistributed, recorded in dataGaps.
INSERT INTO "RankingMethodologyVersion" ("id", "version", "config", "description", "createdAt")
VALUES (
    'rmv_v2_seed',
    2,
    '{
      "eligibility": {
        "minTrackRecordYearsActive": 3,
        "minTrackRecordYearsPassive": 1,
        "minAumInr": 5000000000,
        "requireAum": true,
        "requireDirectPlan": true,
        "requireGrowthOption": true,
        "requireOpenEnded": true,
        "maxNavStalenessDays": 10,
        "maxNavGapTradingDays": 5,
        "maxCalendarGapWeekdays": 4
      },
      "metrics": {
        "rollingReturnYears": 3,
        "rollingStepMonths": 1,
        "minRollingWindows": 12,
        "riskFreeRatePct": 6.5
      },
      "scoringActive": {
        "rollingOutperformanceConsistency": 30,
        "downsideCapture": 25,
        "sortino": 20,
        "ter": 15,
        "managerTenure": 10
      },
      "scoringPassive": {
        "ter": 40,
        "trackingDifference": 30,
        "trackingError": 20,
        "aum": 10
      },
      "selection": {
        "incumbentRankBand": 5,
        "hysteresisMarginPct": 5,
        "hysteresisSnapshots": 3,
        "maxAmcSharePct": 40,
        "overlapPenaltyPerPct": 0.5,
        "maxOverlapPct": 40,
        "minHoldingDaysForSwitch": 365
      },
      "coverage": {
        "minTerCoveragePct": 95,
        "minAumCoveragePct": 95,
        "minCandidatesPerBucket": 5
      },
      "snapshotMaxAgeDays": 3
    }'::jsonb,
    'v2 — cost and size restored. TER (AMFI published, direct plan) is scored again for both models; a scheme with no AUM is ineligible rather than scored without it. Switch recommendations are suppressed for lots held under 365 days while no exit-load source exists, since the cost of leaving cannot be stated.',
    CURRENT_TIMESTAMP
);

-- ─── Scoring run log ─────────────────────────────────────────────
--
-- One row per fund-scoring run that refused to write, and why.
--
-- Same contract as the market-feed run log the price feeds keep: recorded,
-- never swallowed, queryable (CONTEXT.md §3.5). A separate table because it
-- describes a JOB rather than a FEED — a scoring run reads a dozen sources
-- and writes snapshots, where a feed run fetches one file.
--
-- NOT user-scoped. It describes the market pass, not anyone's money, so no
-- RLS policy and no USER_SCOPED_MODELS entry (§5) — like StockMaster, MFNav
-- and FundScoreSnapshot itself.
CREATE TABLE "ScoringRunLog" (
    "id" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "methodologyVersionId" TEXT,
    "asOfDate" DATE NOT NULL,
    "tradingDays" INTEGER,
    "gapWeekdays" INTEGER,
    "gapFrom" DATE,
    "gapTo" DATE,
    "reason" TEXT,
    "details" JSONB,

    CONSTRAINT "ScoringRunLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScoringRunLog_check_startedAt_idx" ON "ScoringRunLog"("check", "startedAt");
CREATE INDEX "ScoringRunLog_asOfDate_idx" ON "ScoringRunLog"("asOfDate");

-- Skip GRANT when running on a managed DB that doesn't have the
-- portfolioos_app role (e.g. Neon). Default privileges from the earlier
-- ALTER DEFAULT PRIVILEGES would have covered it anyway.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ScoringRunLog" TO portfolioos_app';
  END IF;
END
$do$;
