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
    ADD COLUMN "aumInr" DECIMAL(20,4),
    ADD COLUMN "aumAsOf" DATE;

-- The scoring job reads the whole universe by plan and option every night.
CREATE INDEX "MutualFundMaster_planType_optionType_idx"
    ON "MutualFundMaster"("planType", "optionType");

-- AMFI's TER file carries no AMFI scheme code and no ISIN — only a base scheme
-- name — so that name is the join key and is looked up on every TER refresh.
CREATE INDEX "MutualFundMaster_schemeName_idx" ON "MutualFundMaster"("schemeName");

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
        "maxNavStalenessDays": 10
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
        "minAumCoveragePct": 95
      },
      "snapshotMaxAgeDays": 3
    }'::jsonb,
    'v2 — cost and size restored. TER (AMFI published, direct plan) is scored again for both models; a scheme with no AUM is ineligible rather than scored without it. Switch recommendations are suppressed for lots held under 365 days while no exit-load source exists, since the cost of leaving cannot be stated.',
    CURRENT_TIMESTAMP
);
