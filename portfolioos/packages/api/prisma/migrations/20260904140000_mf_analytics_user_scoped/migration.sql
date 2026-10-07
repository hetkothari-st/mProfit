-- MF analytics — the user-scoped half (docs/mf-analytics/05 §1).
--
-- Three tables: a run, the findings it produced, and the per-fund verdicts it
-- concluded. Unlike everything in 20260904120000_mf_analytics_reference_tables
-- — scheme metadata, TER/AUM history, benchmark TRI, metrics, peer ranks,
-- scores — none of this is shared market data. Each row is one user's analysis
-- of one user's holdings, so each table gets the full row-level security
-- treatment, in the shape established by 20260421140000_phase_4_5_rls:
--
--   ENABLE  — turn the policy on
--   FORCE   — apply it to the table owner too. Postgres exempts the owner by
--             default and Prisma connects as the owner, so without FORCE the
--             policy is decoration.
--   USING + WITH CHECK — guard reads AND writes, so a row can never be
--             inserted or updated claiming another user's id.
--   app_is_system() — the escape hatch background jobs run under
--             (runAsSystem sets app.bypass_rls rather than app.current_user_id;
--             a policy without this branch blocks every scheduled job).
--   GRANT to portfolioos_app — the NOBYPASSRLS runtime role the app connects
--             as, created by 20260421150000_phase_4_5_rls_app_role.
--
-- All three are added to USER_SCOPED_MODELS in src/lib/prisma.ts in this same
-- change. CONTEXT.md §5: that is not a separate follow-up, it is the other
-- half of this one. Without the entry the Prisma hook never issues
-- set_config('app.current_user_id'), the GUC is transaction-local and
-- therefore unset, the predicate evaluates against NULL, and the table reads
-- as empty while every write fails 42501. That exact defect has shipped here
-- repeatedly — the PF tables, then Goal and BankAccount, then nineteen more in
-- 20260903180000_rls_remaining_user_tables, then twelve more.
--
-- The reference tables in the sibling migration deliberately get NONE of this;
-- test/invariants/mf-reference-not-user-scoped.test.ts fails if they ever do.
-- test/invariants/mf-user-scoped-coverage.test.ts asserts the obligation in
-- this direction for the three tables below.
--
-- All three carry their own "userId" column, so all three take the simple
-- owner policy rather than the EXISTS-join-up form used for genuinely ownerless
-- child tables (ModelPortfolioVersion in 20260902120000_advisor_engine,
-- EpfMemberId in the PF migrations). On MfFinding and MfFundVerdict that
-- column is denormalised from MfAnalysisRun *specifically* so the predicate can
-- be a direct comparison: findings are read in bulk on every analytics page
-- load, and a join-up policy is re-evaluated per candidate row.
--
-- MfAnalysisRun."familyId" records which household view a run was made in and
-- is deliberately absent from every predicate below. Ownership is "userId".
-- Widening visibility by family membership is an authorisation decision that
-- belongs to familyScope.service.ts, which also applies the per-member
-- visibility caps (CONTEXT.md §6); a database policy cannot see those caps, and
-- two places deciding who may read a row is how the two drift apart.

-- CreateEnum
CREATE TYPE "MfAnalysisRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "MfFindingSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MfVerdictKind" AS ENUM ('HOLD', 'MONITOR', 'REVIEW', 'SWITCH_CANDIDATE', 'INSUFFICIENT_DATA');

-- CreateTable
CREATE TABLE "MfAnalysisRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "status" "MfAnalysisRunStatus" NOT NULL,
    "factsSnapshot" JSONB NOT NULL,
    "portfolioAnalysis" JSONB NOT NULL,
    "ruleVersionsSnapshot" JSONB NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "llmSpendInr" DECIMAL(18,4),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MfAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeCode" TEXT,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "MfFindingSeverity" NOT NULL,
    "confidence" DECIMAL(12,6) NOT NULL,
    "headline" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "whatWouldChangeThis" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfFundVerdict" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "verdict" "MfVerdictKind" NOT NULL,
    "reasons" JSONB NOT NULL,
    "suggestedReplacementSchemeCode" TEXT,
    "switchCost" JSONB,
    "prose" TEXT,
    "proseModel" TEXT,
    "proseVerified" BOOLEAN NOT NULL DEFAULT false,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfFundVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfAnalysisRun_userId_asOf_idx" ON "MfAnalysisRun"("userId", "asOf");

-- CreateIndex
CREATE INDEX "MfFinding_runId_idx" ON "MfFinding"("runId");

-- CreateIndex
CREATE INDEX "MfFinding_userId_schemeCode_idx" ON "MfFinding"("userId", "schemeCode");

-- CreateIndex
-- One verdict supersedes exactly one predecessor. The chain has to stay linear
-- or "what was live on date D" stops having an answer.
CREATE UNIQUE INDEX "MfFundVerdict_supersededById_key" ON "MfFundVerdict"("supersededById");

-- CreateIndex
CREATE INDEX "MfFundVerdict_userId_schemeCode_createdAt_idx" ON "MfFundVerdict"("userId", "schemeCode", "createdAt");

-- AddForeignKey
ALTER TABLE "MfAnalysisRun" ADD CONSTRAINT "MfAnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A finding is scaffolding for its verdict: it dies with the run.
ALTER TABLE "MfFinding" ADD CONSTRAINT "MfFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MfAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- ON DELETE RESTRICT, deliberately unlike MfFinding above. A verdict is the
-- record of advice given and has to outlive the run that produced it, so the
-- run cannot be deleted out from under it. The asymmetry is documented on both
-- models in schema.prisma.
ALTER TABLE "MfFundVerdict" ADD CONSTRAINT "MfFundVerdict_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MfAnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfFundVerdict" ADD CONSTRAINT "MfFundVerdict_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "MfFundVerdict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────

ALTER TABLE "MfAnalysisRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfAnalysisRun" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mfanalysisrun_owner ON "MfAnalysisRun";
CREATE POLICY mfanalysisrun_owner ON "MfAnalysisRun"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfAnalysisRun" TO portfolioos_app;

ALTER TABLE "MfFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfFinding" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mffinding_owner ON "MfFinding";
CREATE POLICY mffinding_owner ON "MfFinding"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfFinding" TO portfolioos_app;

ALTER TABLE "MfFundVerdict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfFundVerdict" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mffundverdict_owner ON "MfFundVerdict";
CREATE POLICY mffundverdict_owner ON "MfFundVerdict"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfFundVerdict" TO portfolioos_app;
