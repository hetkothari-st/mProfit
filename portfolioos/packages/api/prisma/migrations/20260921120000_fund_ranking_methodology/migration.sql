-- Fund-ranking methodology and daily scheme scores.
--
-- Hand-written rather than generated: `prisma migrate diff` against this
-- schema also picked up unrelated FK drift elsewhere in the model, and a
-- migration that drops and recreates foreign keys across the database in
-- order to add two tables is not a migration anyone should run.
--
-- Neither table is user-scoped. They describe the market and the firm's
-- method, not a user's money, so they get no RLS policy and no
-- USER_SCOPED_MODELS entry (see CONTEXT.md §5) — exactly like StockMaster,
-- MFNav and FXRate.

-- ─── The methodology, versioned and signed off ───────────────────
CREATE TABLE "RankingMethodologyVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "signedOffBy" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingMethodologyVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RankingMethodologyVersion_version_key"
    ON "RankingMethodologyVersion"("version");

-- ─── One scheme's score, in one bucket, on one day ───────────────
CREATE TABLE "FundScoreSnapshot" (
    "id" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "methodologyVersionId" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "bucket" "AdvisorAssetBucket" NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "exclusionReasons" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "score" DECIMAL(10,4),
    "rankInBucket" INTEGER,
    "dataGaps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- The re-run guard: a second pass on the same day under the same methodology
-- upserts onto this key instead of stacking a second set of scores.
CREATE UNIQUE INDEX "FundScoreSnapshot_asOf_method_scheme_bucket_key"
    ON "FundScoreSnapshot"("asOfDate", "methodologyVersionId", "schemeCode", "bucket");

CREATE INDEX "FundScoreSnapshot_asOfDate_bucket_rankInBucket_idx"
    ON "FundScoreSnapshot"("asOfDate", "bucket", "rankInBucket");

CREATE INDEX "FundScoreSnapshot_schemeCode_idx"
    ON "FundScoreSnapshot"("schemeCode");

ALTER TABLE "FundScoreSnapshot"
    ADD CONSTRAINT "FundScoreSnapshot_methodologyVersionId_fkey"
    FOREIGN KEY ("methodologyVersionId") REFERENCES "RankingMethodologyVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A pick from the ranked universe is a different provenance from a human's
-- approved list and from the legacy NAV fallback, and an audit that cannot
-- tell them apart cannot answer who chose the fund.
ALTER TYPE "AdvisorProvenance" ADD VALUE IF NOT EXISTS 'RANKED_UNIVERSE';

-- ─── What a recommendation now records about its named fund ──────
ALTER TABLE "AdvisorRecommendation"
    ADD COLUMN "methodologyVersionId" TEXT,
    ADD COLUMN "namedSchemeCode" TEXT,
    ADD COLUMN "selectionEvidence" JSONB;

ALTER TABLE "AdvisorRecommendation"
    ADD CONSTRAINT "AdvisorRecommendation_methodologyVersionId_fkey"
    FOREIGN KEY ("methodologyVersionId") REFERENCES "RankingMethodologyVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Why a run gave categories instead of scheme names. A degraded service is an
-- event worth recording, not an absence to be inferred later.
ALTER TABLE "AdvisorRun" ADD COLUMN "namedFundGate" JSONB;

-- ─── Seed v1 ─────────────────────────────────────────────────────
-- signedOffBy / signedOffAt are deliberately left NULL here. SQL cannot read
-- RIA_PRINCIPAL_OFFICER, and stamping a signatory the deployment has not
-- actually named would make the audit trail a lie. `ensureSignedMethodology`
-- (services/advisor/fundRanking/methodology.service.ts) stamps it from the env
-- var when the scoring job runs, and an unsigned version is never used for
-- advice — so a deployment without a named officer degrades to category-level
-- output rather than quietly advising under nobody's name.
INSERT INTO "RankingMethodologyVersion" ("id", "version", "config", "description", "createdAt")
VALUES (
    'rmv_v1_seed',
    1,
    '{
      "eligibility": {
        "minTrackRecordYearsActive": 3,
        "minTrackRecordYearsPassive": 1,
        "minAumInr": 5000000000,
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
        "maxOverlapPct": 40
      },
      "snapshotMaxAgeDays": 3
    }'::jsonb,
    'v1 — inception methodology. Passive funds are scored on cost and tracking fidelity only; active funds on consistency of rolling outperformance, downside protection, risk-adjusted return, cost and manager tenure. Trailing one-year return is deliberately not a factor in either model.',
    CURRENT_TIMESTAMP
);
