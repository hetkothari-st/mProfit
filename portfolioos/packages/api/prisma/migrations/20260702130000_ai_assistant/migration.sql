-- AI Assistant — conversational Q&A over the user's portfolio.
-- Additive migration. Two new tables + one enum.

CREATE TYPE "AiConversationRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "AiConversation" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "role"            "AiConversationRole" NOT NULL,
  "content"         TEXT NOT NULL,
  "queryIntent"     TEXT,
  "contextSnapshot" JSONB,
  "cardData"        JSONB,
  "familyId"        TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiConversation_userId_createdAt_idx" ON "AiConversation"("userId", "createdAt");

ALTER TABLE "AiConversation"
  ADD CONSTRAINT "AiConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiUsage" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsage_userId_date_key" ON "AiUsage"("userId", "date");
CREATE INDEX "AiUsage_userId_date_idx" ON "AiUsage"("userId", "date");

ALTER TABLE "AiUsage"
  ADD CONSTRAINT "AiUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — defense-in-depth. Read/write only when app_current_user_id
-- matches userId (or app_is_system for jobs).
ALTER TABLE "AiConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiConversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY aiconversation_owner ON "AiConversation"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "AiUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY aiusage_owner ON "AiUsage"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
