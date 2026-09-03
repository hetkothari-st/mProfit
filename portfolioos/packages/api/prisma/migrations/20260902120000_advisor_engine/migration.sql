-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('CONSERVATIVE', 'BALANCED', 'GROWTH', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "AdvisorAssetBucket" AS ENUM ('EQUITY_DOMESTIC', 'EQUITY_INTERNATIONAL', 'DEBT', 'GOLD', 'REAL_ASSETS', 'CASH_EQUIVALENT', 'OTHER_ALT');

-- CreateEnum
CREATE TYPE "AdvisorRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdvisorRunTrigger" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AdvisorRecommendationCategory" AS ENUM ('REBALANCE', 'CONCENTRATION_TRIM', 'TAX_HARVEST', 'GOAL_SHORTFALL_SIP', 'CASH_DEPLOYMENT', 'RISK_PROFILE_REVIEW');

-- CreateEnum
CREATE TYPE "AdvisorRecommendationStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISMISSED', 'SNOOZED', 'DONE');

-- CreateEnum
CREATE TYPE "AdvisorProvenance" AS ENUM ('APPROVED_LIST', 'FALLBACK_RANKING', 'NONE');


-- CreateTable
CREATE TABLE "RiskProfileAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionnaireVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "category" "RiskCategory" NOT NULL,
    "overrides" JSONB,
    "taxSlabPct" DECIMAL(5,2),
    "modelPortfolioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskProfileAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPortfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "riskCategory" "RiskCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPortfolioVersion" (
    "id" TEXT NOT NULL,
    "modelPortfolioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "targetWeights" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPortfolioVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorApprovedProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelPortfolioId" TEXT NOT NULL,
    "bucket" "AdvisorAssetBucket" NOT NULL,
    "rank" INTEGER NOT NULL,
    "fundId" TEXT,
    "stockId" TEXT,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "AdvisorApprovedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggeredBy" "AdvisorRunTrigger" NOT NULL DEFAULT 'USER',
    "status" "AdvisorRunStatus" NOT NULL DEFAULT 'RUNNING',
    "engineVersion" TEXT NOT NULL,
    "ruleVersionsSnapshot" JSONB NOT NULL,
    "ruleErrors" JSONB,
    "riskProfileAssessmentId" TEXT,
    "recommendationCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "AdvisorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "category" "AdvisorRecommendationCategory" NOT NULL,
    "priority" INTEGER NOT NULL,
    "action" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "llmProse" TEXT,
    "llmModel" TEXT,
    "llmCostInr" DECIMAL(10,4),
    "inputsSnapshot" JSONB NOT NULL,
    "riskProfileAssessmentId" TEXT,
    "modelPortfolioVersionId" TEXT,
    "provenance" "AdvisorProvenance" NOT NULL DEFAULT 'NONE',
    "provenanceRef" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "supersededById" TEXT,
    "status" "AdvisorRecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "statusNote" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorRecommendation_pkey" PRIMARY KEY ("id")
);



-- CreateIndex
CREATE INDEX "RiskProfileAssessment_userId_createdAt_idx" ON "RiskProfileAssessment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelPortfolio_userId_isActive_idx" ON "ModelPortfolio"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPortfolio_userId_name_key" ON "ModelPortfolio"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPortfolioVersion_modelPortfolioId_version_key" ON "ModelPortfolioVersion"("modelPortfolioId", "version");

-- CreateIndex
CREATE INDEX "AdvisorApprovedProduct_userId_modelPortfolioId_bucket_isAct_idx" ON "AdvisorApprovedProduct"("userId", "modelPortfolioId", "bucket", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorApprovedProduct_modelPortfolioId_bucket_rank_key" ON "AdvisorApprovedProduct"("modelPortfolioId", "bucket", "rank");

-- CreateIndex
CREATE INDEX "AdvisorRun_userId_startedAt_idx" ON "AdvisorRun"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorRecommendation_supersededById_key" ON "AdvisorRecommendation"("supersededById");

-- CreateIndex
CREATE INDEX "AdvisorRecommendation_userId_status_priority_idx" ON "AdvisorRecommendation"("userId", "status", "priority");

-- CreateIndex
CREATE INDEX "AdvisorRecommendation_userId_ruleId_dedupeKey_idx" ON "AdvisorRecommendation"("userId", "ruleId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AdvisorRecommendation_generationRunId_idx" ON "AdvisorRecommendation"("generationRunId");

-- CreateIndex

ALTER TABLE "RiskProfileAssessment" ADD CONSTRAINT "RiskProfileAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskProfileAssessment" ADD CONSTRAINT "RiskProfileAssessment_modelPortfolioId_fkey" FOREIGN KEY ("modelPortfolioId") REFERENCES "ModelPortfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelPortfolio" ADD CONSTRAINT "ModelPortfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelPortfolioVersion" ADD CONSTRAINT "ModelPortfolioVersion_modelPortfolioId_fkey" FOREIGN KEY ("modelPortfolioId") REFERENCES "ModelPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorApprovedProduct" ADD CONSTRAINT "AdvisorApprovedProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorApprovedProduct" ADD CONSTRAINT "AdvisorApprovedProduct_modelPortfolioId_fkey" FOREIGN KEY ("modelPortfolioId") REFERENCES "ModelPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorApprovedProduct" ADD CONSTRAINT "AdvisorApprovedProduct_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "MutualFundMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdvisorApprovedProduct" ADD CONSTRAINT "AdvisorApprovedProduct_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "StockMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdvisorRun" ADD CONSTRAINT "AdvisorRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorRecommendation" ADD CONSTRAINT "AdvisorRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorRecommendation" ADD CONSTRAINT "AdvisorRecommendation_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "AdvisorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorRecommendation" ADD CONSTRAINT "AdvisorRecommendation_riskProfileAssessmentId_fkey" FOREIGN KEY ("riskProfileAssessmentId") REFERENCES "RiskProfileAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdvisorRecommendation" ADD CONSTRAINT "AdvisorRecommendation_modelPortfolioVersionId_fkey" FOREIGN KEY ("modelPortfolioVersionId") REFERENCES "ModelPortfolioVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdvisorRecommendation" ADD CONSTRAINT "AdvisorRecommendation_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "AdvisorRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────
--
-- Every table above holds user financial data, so each gets the full
-- treatment used by 20260421140000_phase_4_5_rls:
--   ENABLE  — turn the policy on
--   FORCE   — apply it to the table owner too (Prisma often connects as owner,
--             and without FORCE Postgres exempts the owner entirely)
--   USING + WITH CHECK — guard reads AND writes, so a row can never be
--             inserted claiming another user's id
--   app_is_system() — the escape hatch background jobs run under
--   GRANT to portfolioos_app — the NOBYPASSRLS role the app connects as
--
-- These must stay paired with the USER_SCOPED_MODELS entries in
-- src/lib/prisma.ts: without the entry, the Prisma hook never issues
-- set_config('app.current_user_id'), the GUC is unset (it is transaction
-- local), and the policy silently matches nothing. Model Client demonstrates
-- the opposite failure — a table with neither, protected by app code alone.

-- RiskProfileAssessment, ModelPortfolio, AdvisorApprovedProduct, AdvisorRun and
-- AdvisorRecommendation all carry a direct "userId", so they take the simple
-- owner policy.

ALTER TABLE "RiskProfileAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskProfileAssessment" FORCE  ROW LEVEL SECURITY;
CREATE POLICY riskprofileassessment_owner ON "RiskProfileAssessment"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "RiskProfileAssessment" TO portfolioos_app;

ALTER TABLE "ModelPortfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelPortfolio" FORCE  ROW LEVEL SECURITY;
CREATE POLICY modelportfolio_owner ON "ModelPortfolio"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "ModelPortfolio" TO portfolioos_app;

ALTER TABLE "AdvisorApprovedProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorApprovedProduct" FORCE  ROW LEVEL SECURITY;
CREATE POLICY advisorapprovedproduct_owner ON "AdvisorApprovedProduct"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AdvisorApprovedProduct" TO portfolioos_app;

ALTER TABLE "AdvisorRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorRun" FORCE  ROW LEVEL SECURITY;
CREATE POLICY advisorrun_owner ON "AdvisorRun"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AdvisorRun" TO portfolioos_app;

ALTER TABLE "AdvisorRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorRecommendation" FORCE  ROW LEVEL SECURITY;
CREATE POLICY advisorrecommendation_owner ON "AdvisorRecommendation"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AdvisorRecommendation" TO portfolioos_app;

-- ModelPortfolioVersion has no "userId" of its own; it is reached through its
-- parent. Same join-up shape the phase_4_5_rls migration uses for Transaction
-- and Holding, which scope through Portfolio.
ALTER TABLE "ModelPortfolioVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelPortfolioVersion" FORCE  ROW LEVEL SECURITY;
CREATE POLICY modelportfolioversion_owner ON "ModelPortfolioVersion"
  USING (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "ModelPortfolio" mp
      WHERE mp.id = "ModelPortfolioVersion"."modelPortfolioId"
        AND mp."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "ModelPortfolio" mp
      WHERE mp.id = "ModelPortfolioVersion"."modelPortfolioId"
        AND mp."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "ModelPortfolioVersion" TO portfolioos_app;
