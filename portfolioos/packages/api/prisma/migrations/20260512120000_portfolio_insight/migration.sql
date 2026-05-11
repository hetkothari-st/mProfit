-- Phase 5-Analytics: persisted AI portfolio insight output.
-- One row per (user, portfolio|null, generation). 24-hour cache logic in
-- analytics.insights.ts picks the latest row by generatedAt; force=true
-- writes a fresh row regardless. portfolioId nullable for cross-portfolio
-- (ALL scope) insights.

CREATE TABLE "PortfolioInsight" (
    "id"                    TEXT          NOT NULL,
    "userId"                TEXT          NOT NULL,
    "portfolioId"           TEXT,
    "portfolioValueInr"     DECIMAL(18,4) NOT NULL,
    "period"                TEXT          NOT NULL,
    "cards"                 JSONB         NOT NULL,
    "narrative"             TEXT          NOT NULL,
    "recommendedAllocation" JSONB,
    "model"                 TEXT          NOT NULL,
    "inputTokens"           INTEGER       NOT NULL,
    "outputTokens"          INTEGER       NOT NULL,
    "costInr"               DECIMAL(10,4) NOT NULL,
    "generatedAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortfolioInsight_userId_portfolioId_generatedAt_idx"
    ON "PortfolioInsight"("userId", "portfolioId", "generatedAt");
CREATE INDEX "PortfolioInsight_userId_generatedAt_idx"
    ON "PortfolioInsight"("userId", "generatedAt");

ALTER TABLE "PortfolioInsight" ADD CONSTRAINT "PortfolioInsight_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioInsight" ADD CONSTRAINT "PortfolioInsight_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- §3.6 / §5.1 task 11: RLS on this user-scoped table, identical pattern to
-- LlmSpend (see 20260421160000_phase_5_a_llm_spend). FORCE prevents the DB
-- owner from accidentally reading across tenants during a psql session.
ALTER TABLE "PortfolioInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioInsight" FORCE  ROW LEVEL SECURITY;
CREATE POLICY portfolioinsight_owner ON "PortfolioInsight"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "PortfolioInsight" TO portfolioos_app;
