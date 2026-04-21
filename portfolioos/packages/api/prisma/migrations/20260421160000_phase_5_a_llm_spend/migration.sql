-- Phase 5-A (§6, §8): per-user, per-call LLM spend ledger. Every
-- Anthropic API call from the ingestion pipeline inserts a row so the
-- monthly budget service (§17 default warn ₹500 / cap ₹1000) can sum
-- exactly what this user has spent in the current calendar month.
--
-- Failed calls get logged too (success=false, costInr=0) so a flaky
-- upstream can't silently exhaust the budget without a trail.

CREATE TABLE "LlmSpend" (
    "id"           TEXT        NOT NULL,
    "userId"       TEXT        NOT NULL,
    "model"        TEXT        NOT NULL,
    "inputTokens"  INTEGER     NOT NULL,
    "outputTokens" INTEGER     NOT NULL,
    "costInr"      DECIMAL(10,4) NOT NULL,
    "purpose"      TEXT        NOT NULL,
    "sourceRef"    TEXT,
    "success"      BOOLEAN     NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmSpend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmSpend_userId_createdAt_idx" ON "LlmSpend"("userId", "createdAt");
CREATE INDEX "LlmSpend_createdAt_idx"        ON "LlmSpend"("createdAt");

ALTER TABLE "LlmSpend" ADD CONSTRAINT "LlmSpend_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- §3.6 / §5.1 task 11: RLS on this user-scoped table, same pattern as
-- the other user-owned tables. FORCE so the DB owner can't
-- accidentally read across tenants during a psql session.
ALTER TABLE "LlmSpend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LlmSpend" FORCE  ROW LEVEL SECURITY;
CREATE POLICY llmspend_owner ON "LlmSpend"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- ALTER DEFAULT PRIVILEGES (from 20260421150000_phase_4_5_rls_app_role)
-- already grants CRUD + sequence usage on tables created by the
-- migration owner, so portfolioos_app inherits access automatically.
-- Belt-and-braces explicit grant here so there's no ordering surprise
-- if this migration is ever replayed in isolation.
GRANT SELECT, INSERT, UPDATE, DELETE ON "LlmSpend" TO portfolioos_app;
