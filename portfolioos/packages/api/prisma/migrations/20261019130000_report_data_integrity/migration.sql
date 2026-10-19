-- Report data integrity: statement closing positions on imports, and a log
-- of the nightly stored-data integrity check. Additive only.

ALTER TABLE "ImportJob" ADD COLUMN "statementSnapshot" JSONB;

CREATE TABLE "DataIntegrityRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "portfoliosChecked" INTEGER NOT NULL DEFAULT 0,
    "holdingDrifts" INTEGER NOT NULL DEFAULT 0,
    "gainDrifts" INTEGER NOT NULL DEFAULT 0,
    "portfoliosRepaired" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,

    CONSTRAINT "DataIntegrityRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataIntegrityRun_startedAt_idx" ON "DataIntegrityRun"("startedAt");

-- Explicit grant, guarded for managed databases without the app role
-- (pattern from 20260922140000_feed_run_log).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "DataIntegrityRun" TO portfolioos_app';
  END IF;
END
$do$;
