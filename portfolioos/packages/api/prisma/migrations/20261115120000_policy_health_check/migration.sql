-- Insurance Policy Health Check & Audit Engine
--
-- Five user-scoped tables and one reference table.
--
-- User-scoped tables (carry or join through userId):
--   PolicyHealthCheck — the run record
--   PolicyExtractionDoc — uploaded document + extraction result (child of check)
--   ExtractedPolicyData — structured fields extracted by LLM (child of check)
--   PolicyFinding — deterministic rule findings (child of check, denorm userId)
--   PolicyVerdict — overall verdict (child of check, denorm userId)
--
-- Reference table (no userId, no RLS):
--   InsurerMetrics — IRDAI-sourced insurer statistics shared by all users
--
-- RLS shape mirrors 20260904140000_mf_analytics_user_scoped:
--   ENABLE + FORCE on every user-scoped table
--   app_is_system() escape hatch in every policy (background jobs need it)
--   app_current_user_id() — direct column where the table has userId,
--     EXISTS join through PolicyHealthCheck for the two child tables
--     (PolicyExtractionDoc, ExtractedPolicyData) that have no userId of their own
--   PolicyFinding and PolicyVerdict carry a denormalised userId column so their
--     policies are direct comparisons rather than EXISTS joins — mirrors
--     MfFinding / MfFundVerdict in the sibling migration
--
-- InsurerMetrics deliberately gets NONE of this. It is shared reference data
-- in the same class as StockMaster, MFNav, FXRate and InsurerMetrics;
-- test/invariants/user-scoped-coverage.test.ts asserts it is NOT in
-- USER_SCOPED_MODELS.
--
-- All five user-scoped tables are added to USER_SCOPED_MODELS in src/lib/prisma.ts
-- in this same commit. That pairing is documented as an invariant in CONTEXT.md §5.

-- CreateTable
CREATE TABLE "PolicyHealthCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "factsSnapshot" JSONB NOT NULL,
    "ruleVersionsSnapshot" JSONB NOT NULL,
    "scoreSnapshot" JSONB NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "llmSpendInr" DECIMAL(18,4),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PolicyHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyExtractionDoc" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "extractedText" TEXT NOT NULL,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "PolicyExtractionDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedPolicyData" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ExtractedPolicyData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyFinding" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" DECIMAL(12,6) NOT NULL,
    "headline" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "whatWouldChangeThis" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVerdict" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "score" DECIMAL(5,2),
    "reasons" JSONB NOT NULL,
    "prose" TEXT,
    "proseModel" TEXT,
    "proseVerified" BOOLEAN NOT NULL DEFAULT false,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable (REFERENCE — no userId, no RLS)
CREATE TABLE "InsurerMetrics" (
    "id" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "claimSettlementRatio" DECIMAL(6,2),
    "incurredClaimRatio" DECIMAL(6,2),
    "claimsTotal" INTEGER,
    "claimsSettled" INTEGER,
    "claimsPending" INTEGER,
    "complaints" JSONB,
    "source" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurerMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyHealthCheck_userId_policyId_asOf_idx" ON "PolicyHealthCheck"("userId", "policyId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyExtractionDoc_sourceHash_key" ON "PolicyExtractionDoc"("sourceHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedPolicyData_checkId_key" ON "ExtractedPolicyData"("checkId");

-- CreateIndex
CREATE INDEX "PolicyFinding_checkId_idx" ON "PolicyFinding"("checkId");

-- CreateIndex
CREATE INDEX "PolicyFinding_userId_category_idx" ON "PolicyFinding"("userId", "category");

-- CreateIndex
-- Supersede chain is linear: one verdict supersedes exactly one predecessor.
CREATE UNIQUE INDEX "PolicyVerdict_supersededById_key" ON "PolicyVerdict"("supersededById");

-- CreateIndex
CREATE INDEX "InsurerMetrics_insurerName_financialYear_idx" ON "InsurerMetrics"("insurerName", "financialYear");

-- AddForeignKey
ALTER TABLE "PolicyHealthCheck" ADD CONSTRAINT "PolicyHealthCheck_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyHealthCheck" ADD CONSTRAINT "PolicyHealthCheck_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Child of check: dies with the check.
ALTER TABLE "PolicyExtractionDoc" ADD CONSTRAINT "PolicyExtractionDoc_checkId_fkey"
    FOREIGN KEY ("checkId") REFERENCES "PolicyHealthCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyExtractionDoc" ADD CONSTRAINT "PolicyExtractionDoc_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Child of check: dies with the check.
ALTER TABLE "ExtractedPolicyData" ADD CONSTRAINT "ExtractedPolicyData_checkId_fkey"
    FOREIGN KEY ("checkId") REFERENCES "PolicyHealthCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Child of check: dies with the check.
ALTER TABLE "PolicyFinding" ADD CONSTRAINT "PolicyFinding_checkId_fkey"
    FOREIGN KEY ("checkId") REFERENCES "PolicyHealthCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- ON DELETE RESTRICT, deliberately unlike PolicyFinding above.
-- A verdict is the record of advice given and must outlive the run.
ALTER TABLE "PolicyVerdict" ADD CONSTRAINT "PolicyVerdict_checkId_fkey"
    FOREIGN KEY ("checkId") REFERENCES "PolicyHealthCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Self-relation for the supersede chain.
ALTER TABLE "PolicyVerdict" ADD CONSTRAINT "PolicyVerdict_supersededById_fkey"
    FOREIGN KEY ("supersededById") REFERENCES "PolicyVerdict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
--
-- Mirror of 20260904140000_mf_analytics_user_scoped. See that migration's
-- comments for the full rationale; the short version is below.
--
-- ENABLE + FORCE: turns the policy on for everyone including the table owner,
-- because Postgres exempts the owner by default and Prisma connects as the
-- owner.
--
-- app_is_system(): background jobs run under runAsSystem, which sets
-- app.bypass_rls rather than app.current_user_id. A policy without this branch
-- filters them out completely — which is how goal_owner once blocked every job
-- touching goals.
--
-- PolicyExtractionDoc and ExtractedPolicyData have no userId column of their
-- own, so their policies join through PolicyHealthCheck.
--
-- PolicyFinding and PolicyVerdict carry a denormalised userId (copied from
-- PolicyHealthCheck at insert) so their policies are direct column comparisons
-- rather than EXISTS joins — cheaper on bulk reads.

ALTER TABLE "PolicyHealthCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyHealthCheck" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policyhealthcheck_owner ON "PolicyHealthCheck";
CREATE POLICY policyhealthcheck_owner ON "PolicyHealthCheck"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyHealthCheck" TO portfolioos_app;

-- PolicyExtractionDoc joins through its parent check.
ALTER TABLE "PolicyExtractionDoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyExtractionDoc" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policyextractiondoc_owner ON "PolicyExtractionDoc";
CREATE POLICY policyextractiondoc_owner ON "PolicyExtractionDoc"
  USING (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "PolicyHealthCheck" c
       WHERE c.id = "PolicyExtractionDoc"."checkId"
         AND c."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "PolicyHealthCheck" c
       WHERE c.id = "PolicyExtractionDoc"."checkId"
         AND c."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyExtractionDoc" TO portfolioos_app;

-- ExtractedPolicyData joins through its parent check.
ALTER TABLE "ExtractedPolicyData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExtractedPolicyData" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extractedpolicydata_owner ON "ExtractedPolicyData";
CREATE POLICY extractedpolicydata_owner ON "ExtractedPolicyData"
  USING (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "PolicyHealthCheck" c
       WHERE c.id = "ExtractedPolicyData"."checkId"
         AND c."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "PolicyHealthCheck" c
       WHERE c.id = "ExtractedPolicyData"."checkId"
         AND c."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExtractedPolicyData" TO portfolioos_app;

-- PolicyFinding uses the denormalised userId column for a direct comparison.
ALTER TABLE "PolicyFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyFinding" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policyfinding_owner ON "PolicyFinding";
CREATE POLICY policyfinding_owner ON "PolicyFinding"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyFinding" TO portfolioos_app;

-- PolicyVerdict uses the denormalised userId column for a direct comparison.
ALTER TABLE "PolicyVerdict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyVerdict" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policyverdict_owner ON "PolicyVerdict";
CREATE POLICY policyverdict_owner ON "PolicyVerdict"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyVerdict" TO portfolioos_app;

-- InsurerMetrics: NO RLS policy. Reference data shared by all users.
-- GRANT to portfolioos_app so the runtime role can read it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "InsurerMetrics" TO portfolioos_app;
