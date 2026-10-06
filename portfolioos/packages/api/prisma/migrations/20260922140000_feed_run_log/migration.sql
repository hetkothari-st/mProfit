-- One row per market-feed run, and whether it looked sane.
--
-- This exists because the AMFI NAV sync spent weeks importing zero rows while
-- reporting success: the file gained two columns, every row failed the numeric
-- NAV check, and nothing threw. A job that cannot say "I imported far less than
-- last time" cannot notice that.
--
-- NOT user-scoped. It describes a feed, not anyone's money, so no RLS policy
-- and no USER_SCOPED_MODELS entry (CONTEXT.md §5) — like StockMaster and MFNav.
--
-- It deliberately does not reuse `IngestionFailure`: that table is the DLQ for
-- USER data and its policy is `userId = app_current_user_id()`, so a
-- market-wide failure has no row it could legally write. Same contract —
-- recorded, never swallowed — for data that belongs to no one.
CREATE TABLE "FeedRunLog" (
    "id" TEXT NOT NULL,
    "feed" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "rowsParsed" INTEGER,
    "rowsImported" INTEGER,
    "parseFailures" INTEGER,
    "previousImported" INTEGER,
    "reason" TEXT,
    "details" JSONB,

    CONSTRAINT "FeedRunLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedRunLog_feed_startedAt_idx" ON "FeedRunLog"("feed", "startedAt");

-- The canary's baseline query: the last OK run of this feed.
CREATE INDEX "FeedRunLog_feed_status_startedAt_idx" ON "FeedRunLog"("feed", "status", "startedAt");

-- Skip GRANT when running on a managed DB that doesn't have the
-- portfolioos_app role (e.g. Neon). Default privileges from the earlier
-- ALTER DEFAULT PRIVILEGES would have covered it anyway.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "FeedRunLog" TO portfolioos_app';
  END IF;
END
$do$;
