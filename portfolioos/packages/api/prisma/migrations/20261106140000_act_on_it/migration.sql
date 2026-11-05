-- Act on it + track record (docs/superpowers/specs/2026-11-06-act-on-it-design.md).
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'IDLE_CASH_PARKING';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'REGULAR_TO_DIRECT';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'LTCG_BOOKING';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'STOPPED_SIP';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'FD_MATURITY';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'LOAN_REFINANCE';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'ADVANCE_TAX';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'EMERGENCY_FUND';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'HEALTH_COVER';
ALTER TYPE "AdvisorRecommendationCategory" ADD VALUE IF NOT EXISTS 'FUND_UNDERPERFORMING';
ALTER TYPE "AdvisorRecommendationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "AdvisorRecommendationStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'ADVICE';

ALTER TABLE "AdvisorRecommendation"
  ADD COLUMN "headline" TEXT,
  ADD COLUMN "promise" JSONB,
  ADD COLUMN "measurement" JSONB,
  ADD COLUMN "urgentUntil" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "confirmation" JSONB,
  ADD COLUMN "outcomeStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "outcomeInr" DECIMAL(18,2),
  ADD COLUMN "outcomeDetail" JSONB,
  ADD COLUMN "measuredAt" TIMESTAMP(3),
  ADD COLUMN "nudgedAt" TIMESTAMP(3);

-- Advice given before tracking existed has no promise to measure.
UPDATE "AdvisorRecommendation" SET "outcomeStatus" = 'BEFORE_TRACKING';

CREATE TABLE "AdvicePrompt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "urgent" BOOLEAN NOT NULL DEFAULT false,
  "popupSeenAt" TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvicePrompt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdvicePrompt_userId_createdAt_idx" ON "AdvicePrompt"("userId", "createdAt");
CREATE INDEX "AdvicePrompt_recommendationId_idx" ON "AdvicePrompt"("recommendationId");
ALTER TABLE "AdvicePrompt" ADD CONSTRAINT "AdvicePrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvicePrompt" ADD CONSTRAINT "AdvicePrompt_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AdvisorRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdviceRuleHealth" (
  "ruleId" TEXT NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "pauseReason" TEXT,
  "measured" INTEGER NOT NULL DEFAULT 0,
  "misses" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdviceRuleHealth_pkey" PRIMARY KEY ("ruleId")
);

ALTER TABLE "AdvicePrompt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvicePrompt" FORCE ROW LEVEL SECURITY;
CREATE POLICY adviceprompt_owner ON "AdvicePrompt"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "AdvicePrompt", "AdviceRuleHealth" TO portfolioos_app';
  END IF;
END
$do$;
