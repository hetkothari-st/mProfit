-- MF analytics reference tables (docs/mf-analytics/01 §2, 07 Task 1.1).
--
-- Scheme metadata, TER/AUM/manager history, monthly portfolio disclosures,
-- benchmark TRI series, the risk-free curve, the AMFI market-cap list, and the
-- computed metric / peer-rank / score rows derived from them.
--
-- NO ROW LEVEL SECURITY IS ENABLED ON ANY TABLE BELOW, AND THAT IS DELIBERATE.
--
-- Every table here is shared market reference data, in the same class as
-- StockMaster, MFNav, FXRate and VehicleCatalog. None of them has a `userId`:
-- a scheme's TER, its benchmark's index level and its Sharpe ratio are the
-- same numbers for every user who holds the fund. There is nothing to isolate,
-- so there is no predicate a policy could be written against.
--
-- Spelling that out because the pairing rule in CONTEXT.md §5 — "a policy and
-- an entry in USER_SCOPED_MODELS are two halves of one change" — has been
-- broken repeatedly in the other direction (the PF tables, then Goal and
-- BankAccount, then nineteen more), and the corrective reflex is to sweep the
-- schema and protect everything that looks unprotected. Applied here that
-- reflex would break the feature: under the NOBYPASSRLS runtime role a policy
-- with no session variable returns zero rows, so every user would see an empty
-- fund-analytics layer. These tables are correspondingly absent from
-- USER_SCOPED_MODELS in src/lib/prisma.ts, which carries the same note.
--
-- test/invariants/mf-reference-not-user-scoped.test.ts asserts both halves and
-- greps this directory for `ENABLE ROW LEVEL SECURITY` on these table names.
-- If it ever fails, the fix is to remove the addition, not to relax the test.
--
-- The user-scoped half of this feature — MfAnalysisRun, MfFinding,
-- MfFundVerdict (docs/mf-analytics/05) — is one user's analysis of one user's
-- holdings and WILL need policies plus registration when it lands. It is not
-- in this migration.
--
-- Grants: the runtime role needs read access. Writes happen only in jobs under
-- `runAsSystem`, which still connect as `portfolioos_app`, so INSERT/UPDATE/
-- DELETE are granted too — the guard on these tables is that nothing outside a
-- job has a code path that writes them, not a database privilege.
--
-- MFNav gains three columns rather than a new table:
--   adjustedNav      — NAV with IDCW distributions reinvested; equals `nav` for
--                      GROWTH options. Every return, volatility and alpha
--                      calculation reads this, never `nav`. Nullable because it
--                      is backfilled (07 Task 1.4); a null means "not yet
--                      adjusted", and metrics must degrade to INSUFFICIENT_DATA
--                      rather than silently fall back to the raw NAV.
--   isQuarantined /  — set by the 01 §6 ingest validation. Bad NAVs are KEPT
--   quarantineReason   and flagged rather than dropped, so the gap stays
--                      visible in the series instead of silently closing up.
--
-- One discrepancy with the doc, resolved here: 01 §2 writes MfSchemeMeta as
-- though MFNav were keyed by scheme code. In this repo MFNav.fundId references
-- MutualFundMaster.id, and the AMFI scheme code lives on
-- MutualFundMaster.schemeCode. MFNav is NOT rekeyed — every price feed,
-- holdings projection and NAV backfill already writes it. MfSchemeMeta.schemeCode
-- joins to MutualFundMaster.schemeCode and reaches NAVs through it; no FK is
-- declared, because AMFI publishes codes for schemes we may not have a
-- MutualFundMaster row for yet and a hard FK would fail ingestion on exactly
-- the schemes it exists to discover.

-- CreateEnum
CREATE TYPE "MfSebiCategory" AS ENUM ('EQUITY', 'DEBT', 'HYBRID', 'SOLUTION_ORIENTED', 'OTHER');

-- CreateEnum
CREATE TYPE "MfPlanType" AS ENUM ('DIRECT', 'REGULAR');

-- CreateEnum
CREATE TYPE "MfOptionType" AS ENUM ('GROWTH', 'IDCW_PAYOUT', 'IDCW_REINVEST');

-- CreateEnum
CREATE TYPE "MfSchemeStatus" AS ENUM ('ACTIVE', 'MERGED', 'WOUND_UP', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MfHoldingKind" AS ENUM ('EQUITY', 'DEBT', 'CASH', 'DERIVATIVE', 'REIT_INVIT', 'GOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "MfMetricStatus" AS ENUM ('OK', 'INSUFFICIENT_DATA', 'BENCHMARK_UNAVAILABLE', 'STALE', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "MfRatingStatus" AS ENUM ('RATED', 'INSUFFICIENT_HISTORY', 'CATEGORY_TOO_SMALL', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "MFNav" ADD COLUMN     "adjustedNav" DECIMAL(18,6),
ADD COLUMN     "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quarantineReason" TEXT;

-- CreateTable
CREATE TABLE "MfSchemeMeta" (
    "schemeCode" TEXT NOT NULL,
    "isin" TEXT,
    "schemeName" TEXT NOT NULL,
    "amcCode" TEXT NOT NULL,
    "amcName" TEXT NOT NULL,
    "sebiCategory" "MfSebiCategory" NOT NULL,
    "sebiSubCategory" TEXT NOT NULL,
    "planType" "MfPlanType" NOT NULL,
    "optionType" "MfOptionType" NOT NULL,
    "benchmarkIndexCode" TEXT,
    "inceptionDate" TIMESTAMP(3) NOT NULL,
    "predecessorSchemeCode" TEXT,
    "status" "MfSchemeStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusChangedAt" TIMESTAMP(3),
    "riskometer" TEXT,
    "exitLoadText" TEXT,
    "exitLoadRules" JSONB,
    "minSip" DECIMAL(18,4),
    "growthSiblingSchemeCode" TEXT,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfSchemeMeta_pkey" PRIMARY KEY ("schemeCode")
);

-- CreateTable
CREATE TABLE "MfSchemeTer" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "terPct" DECIMAL(12,6) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfSchemeTer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfSchemeAum" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "aum" DECIMAL(18,4) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfSchemeAum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfSchemeManager" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "role" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfSchemeManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfPortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "totalHoldings" INTEGER NOT NULL,
    "cashPct" DECIMAL(12,6) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfPortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfPortfolioHolding" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "kind" "MfHoldingKind" NOT NULL,
    "isin" TEXT,
    "securityName" TEXT NOT NULL,
    "weightPct" DECIMAL(12,6) NOT NULL,
    "quantity" DECIMAL(18,6),
    "marketValue" DECIMAL(18,4),
    "sector" TEXT,
    "marketCapBucket" TEXT,
    "issuer" TEXT,
    "creditRating" TEXT,
    "maturityDate" TIMESTAMP(3),
    "ytmPct" DECIMAL(12,6),

    CONSTRAINT "MfPortfolioHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkIndex" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isTotalReturn" BOOLEAN NOT NULL,

    CONSTRAINT "BenchmarkIndex_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "BenchmarkIndexPrice" (
    "id" TEXT NOT NULL,
    "indexCode" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "BenchmarkIndexPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFreeRate" (
    "id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ratePct" DECIMAL(12,6) NOT NULL,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "RiskFreeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmfiMarketCapList" (
    "id" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "isin" TEXT NOT NULL,
    "securityName" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmfiMarketCapList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfSchemeMetrics" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "horizonYears" INTEGER NOT NULL,
    "status" "MfMetricStatus" NOT NULL,
    "statusReason" TEXT,
    "metrics" JSONB NOT NULL,
    "benchmarkCode" TEXT,
    "riskFreeSeries" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mathVersion" TEXT NOT NULL,

    CONSTRAINT "MfSchemeMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfPeerRank" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "horizonYears" INTEGER NOT NULL,
    "universeKey" TEXT NOT NULL,
    "universeSize" INTEGER NOT NULL,
    "percentiles" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfPeerRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfSchemeScore" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "ratingStatus" "MfRatingStatus" NOT NULL,
    "composite" DECIMAL(12,6),
    "rating" INTEGER,
    "pillars" JSONB NOT NULL,
    "universeKey" TEXT NOT NULL,
    "universeSize" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfSchemeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfSchemeQualitativeFact" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "enteredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfSchemeQualitativeFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MfSchemeMeta_isin_key" ON "MfSchemeMeta"("isin");

-- CreateIndex
CREATE INDEX "MfSchemeMeta_sebiCategory_sebiSubCategory_planType_status_idx" ON "MfSchemeMeta"("sebiCategory", "sebiSubCategory", "planType", "status");

-- CreateIndex
CREATE INDEX "MfSchemeMeta_amcCode_idx" ON "MfSchemeMeta"("amcCode");

-- CreateIndex
CREATE INDEX "MfSchemeMeta_growthSiblingSchemeCode_idx" ON "MfSchemeMeta"("growthSiblingSchemeCode");

-- CreateIndex
CREATE UNIQUE INDEX "MfSchemeTer_schemeCode_effectiveFrom_key" ON "MfSchemeTer"("schemeCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "MfSchemeAum_schemeCode_asOf_key" ON "MfSchemeAum"("schemeCode", "asOf");

-- CreateIndex
CREATE INDEX "MfSchemeManager_schemeCode_toDate_idx" ON "MfSchemeManager"("schemeCode", "toDate");

-- CreateIndex
CREATE UNIQUE INDEX "MfPortfolioSnapshot_schemeCode_asOf_key" ON "MfPortfolioSnapshot"("schemeCode", "asOf");

-- CreateIndex
CREATE INDEX "MfPortfolioHolding_snapshotId_idx" ON "MfPortfolioHolding"("snapshotId");

-- CreateIndex
CREATE INDEX "MfPortfolioHolding_isin_idx" ON "MfPortfolioHolding"("isin");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkIndexPrice_indexCode_date_key" ON "BenchmarkIndexPrice"("indexCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFreeRate_series_date_key" ON "RiskFreeRate"("series", "date");

-- CreateIndex
CREATE INDEX "AmfiMarketCapList_asOf_bucket_idx" ON "AmfiMarketCapList"("asOf", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "AmfiMarketCapList_asOf_isin_key" ON "AmfiMarketCapList"("asOf", "isin");

-- CreateIndex
CREATE INDEX "MfSchemeMetrics_asOf_idx" ON "MfSchemeMetrics"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "MfSchemeMetrics_schemeCode_asOf_horizonYears_key" ON "MfSchemeMetrics"("schemeCode", "asOf", "horizonYears");

-- CreateIndex
CREATE INDEX "MfPeerRank_universeKey_asOf_idx" ON "MfPeerRank"("universeKey", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "MfPeerRank_schemeCode_asOf_horizonYears_key" ON "MfPeerRank"("schemeCode", "asOf", "horizonYears");

-- CreateIndex
CREATE INDEX "MfSchemeScore_universeKey_asOf_idx" ON "MfSchemeScore"("universeKey", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "MfSchemeScore_schemeCode_asOf_methodologyVersion_key" ON "MfSchemeScore"("schemeCode", "asOf", "methodologyVersion");

-- CreateIndex
CREATE INDEX "MfSchemeQualitativeFact_schemeCode_factType_idx" ON "MfSchemeQualitativeFact"("schemeCode", "factType");

-- AddForeignKey
ALTER TABLE "MfSchemeTer" ADD CONSTRAINT "MfSchemeTer_schemeCode_fkey" FOREIGN KEY ("schemeCode") REFERENCES "MfSchemeMeta"("schemeCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfSchemeAum" ADD CONSTRAINT "MfSchemeAum_schemeCode_fkey" FOREIGN KEY ("schemeCode") REFERENCES "MfSchemeMeta"("schemeCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfSchemeManager" ADD CONSTRAINT "MfSchemeManager_schemeCode_fkey" FOREIGN KEY ("schemeCode") REFERENCES "MfSchemeMeta"("schemeCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfPortfolioSnapshot" ADD CONSTRAINT "MfPortfolioSnapshot_schemeCode_fkey" FOREIGN KEY ("schemeCode") REFERENCES "MfSchemeMeta"("schemeCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfPortfolioHolding" ADD CONSTRAINT "MfPortfolioHolding_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MfPortfolioSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkIndexPrice" ADD CONSTRAINT "BenchmarkIndexPrice_indexCode_fkey" FOREIGN KEY ("indexCode") REFERENCES "BenchmarkIndex"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfSchemeMetrics" ADD CONSTRAINT "MfSchemeMetrics_schemeCode_fkey" FOREIGN KEY ("schemeCode") REFERENCES "MfSchemeMeta"("schemeCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfSchemeScore" ADD CONSTRAINT "MfSchemeScore_schemeCode_fkey" FOREIGN KEY ("schemeCode") REFERENCES "MfSchemeMeta"("schemeCode") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── GRANTS ─────────────────────────────────────────────────────
--
-- ALTER DEFAULT PRIVILEGES (20260421150000_phase_4_5_rls_app_role) already
-- grants CRUD on tables created by the migration owner, so `portfolioos_app`
-- inherits access automatically. Restated explicitly, as every migration since
-- has done, so replaying this one in isolation has no ordering surprise.
--
-- Writes happen only in jobs under `runAsSystem`, which still connect as
-- `portfolioos_app`; what keeps these tables read-only for request-path code
-- is that no request-path code has a write path to them, not a privilege.
--
-- No `ALTER TABLE … ENABLE ROW LEVEL SECURITY` follows, on purpose. See the
-- header.

GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeMeta"            TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeTer"             TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeAum"             TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeManager"         TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfPortfolioSnapshot"     TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfPortfolioHolding"      TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BenchmarkIndex"          TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BenchmarkIndexPrice"     TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RiskFreeRate"            TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AmfiMarketCapList"       TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeMetrics"         TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfPeerRank"              TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeScore"           TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfSchemeQualitativeFact" TO portfolioos_app;
