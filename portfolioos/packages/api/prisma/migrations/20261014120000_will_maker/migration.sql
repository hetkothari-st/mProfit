-- Will Maker (docs/superpowers/specs/2026-10-12-will-maker-design.md).
CREATE TYPE "WillStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXECUTED', 'SUPERSEDED', 'DISCARDED');

CREATE TABLE "Will" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WillStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER NOT NULL DEFAULT 2,
    "payload" BYTEA NOT NULL,
    "payloadSchemaVer" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "generatedAt" TIMESTAMPTZ(3),
    "executedAt" DATE,
    "nextReviewAt" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Will_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WillVersion" (
    "id" TEXT NOT NULL,
    "willId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "regime" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "rulesetVersion" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "snapshotSealed" BYTEA NOT NULL,
    "documentId" TEXT NOT NULL,
    "pdfSha256" TEXT NOT NULL,
    "findingsJson" JSONB NOT NULL,
    "generatedOn" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WillVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Will_userId_version_key" ON "Will"("userId", "version");
CREATE INDEX "Will_userId_status_idx" ON "Will"("userId", "status");
CREATE UNIQUE INDEX "WillVersion_willId_versionNo_key" ON "WillVersion"("willId", "versionNo");
CREATE INDEX "WillVersion_userId_createdAt_idx" ON "WillVersion"("userId", "createdAt");

ALTER TABLE "Will" ADD CONSTRAINT "Will_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT, not CASCADE: a cascade skips RLS, so an owner deleting their
-- Will would wipe the immutable versions. Purge deletes versions first.
ALTER TABLE "WillVersion" ADD CONSTRAINT "WillVersion_willId_fkey"
  FOREIGN KEY ("willId") REFERENCES "Will"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WillVersion" ADD CONSTRAINT "WillVersion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One draft at a time per user. Not expressible in Prisma.
CREATE UNIQUE INDEX "Will_one_draft_per_user" ON "Will"("userId") WHERE "status" = 'DRAFT';

-- Owner-only, the same shape as "DocumentBlob" (20261006170000_document_blob).
ALTER TABLE "Will" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Will" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS will_owner ON "Will";
CREATE POLICY will_owner ON "Will"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- Generated copies: owners read and insert; nobody updates; only system
-- context (account purge) deletes.
ALTER TABLE "WillVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WillVersion" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS willversion_read ON "WillVersion";
CREATE POLICY willversion_read ON "WillVersion"
  FOR SELECT
  USING (app_is_system() OR "userId" = app_current_user_id());
DROP POLICY IF EXISTS willversion_insert ON "WillVersion";
CREATE POLICY willversion_insert ON "WillVersion"
  FOR INSERT
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
DROP POLICY IF EXISTS willversion_system_delete ON "WillVersion";
CREATE POLICY willversion_system_delete ON "WillVersion"
  FOR DELETE
  USING (app_is_system());

CREATE OR REPLACE FUNCTION will_version_reject_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'WillVersion rows are immutable' USING ERRCODE = 'insufficient_privilege';
END
$fn$;

DROP TRIGGER IF EXISTS "WillVersion_reject_update" ON "WillVersion";
CREATE TRIGGER "WillVersion_reject_update"
  BEFORE UPDATE ON "WillVersion"
  FOR EACH ROW EXECUTE FUNCTION will_version_reject_update();

-- Explicit grants, guarded for managed databases without the app role (the
-- pattern from 20260922140000_feed_run_log). Default privileges may already
-- have granted UPDATE on WillVersion; take it back.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Will" TO portfolioos_app';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "WillVersion" TO portfolioos_app';
    EXECUTE 'REVOKE UPDATE ON "WillVersion" FROM portfolioos_app';
  END IF;
END
$do$;
