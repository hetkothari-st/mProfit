-- AI Connector (docs/superpowers/specs/2026-10-14-ai-connector-design.md).
CREATE TYPE "McpTokenKind" AS ENUM ('ACCESS', 'REFRESH');

CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "displayName" TEXT NOT NULL,
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3),
    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpClient_clientId_key" ON "McpClient"("clientId");

CREATE TABLE "McpAuthRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "resource" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    CONSTRAINT "McpAuthRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "McpAuthRequest_expiresAt_idx" ON "McpAuthRequest"("expiresAt");

CREATE TABLE "McpGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "areas" TEXT[],
    "memberUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refreshGeneration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    CONSTRAINT "McpGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "McpGrant_userId_revokedAt_idx" ON "McpGrant"("userId", "revokedAt");
-- One live connection per user and chatbot. Not expressible in Prisma.
CREATE UNIQUE INDEX "McpGrant_one_active_per_client" ON "McpGrant"("userId", "clientId") WHERE "revokedAt" IS NULL;

CREATE TABLE "McpAuthCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    CONSTRAINT "McpAuthCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpAuthCode_codeHash_key" ON "McpAuthCode"("codeHash");

CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "McpTokenKind" NOT NULL,
    "generation" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");
CREATE INDEX "McpToken_grantId_idx" ON "McpToken"("grantId");

ALTER TABLE "McpGrant" ADD CONSTRAINT "McpGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpGrant" ADD CONSTRAINT "McpGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "McpGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "McpGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: owner-only, system bypass. Same shape as Legacy (20261013120000).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['McpGrant','McpAuthCode','McpToken'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %s ON %I', lower(t) || '_owner', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR "userId" = app_current_user_id()) WITH CHECK (app_is_system() OR "userId" = app_current_user_id())', lower(t) || '_owner', t);
  END LOOP;
END $$;

-- Explicit grants, guarded for managed databases without the app role
-- (pattern from 20260922140000_feed_run_log).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "McpClient","McpAuthRequest","McpGrant","McpAuthCode","McpToken" TO portfolioos_app';
  END IF;
END
$do$;
