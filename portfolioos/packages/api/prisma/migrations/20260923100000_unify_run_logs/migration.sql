-- One run log, not two.
--
-- `FeedRunLog` and `ScoringRunLog` were written on branches that could not see
-- each other: the AMFI hotfix needed a place to record a market feed that came
-- back thin, and the fund-scoring branch needed a place to record a run that
-- refused to write. Both landed, and the result was two tables with the same
-- contract, two Sentry helpers with the same tag vocabulary, and an ops page
-- that only knew about one of them — so a scoring refusal was invisible
-- exactly where somebody would go looking for it.
--
-- They answer the same question: did a scheduled run produce what it should
-- have? So they become one table with a `kind` discriminator.
--
-- The scoring-specific numbers (asOfDate, tradingDays, gapWeekdays, gapFrom,
-- gapTo, methodologyVersionId) move into `details` rather than becoming six
-- more nullable columns that are null on every feed row. They were only ever
-- read for display and diagnosis, never filtered on.
--
-- Still NOT user-scoped: no RLS policy, no USER_SCOPED_MODELS entry
-- (CONTEXT.md §5), like StockMaster and MFNav.

ALTER TABLE "FeedRunLog"
    ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FEED',
    ADD COLUMN "check" TEXT;

-- Every row that existed before this migration is a feed canary run.
UPDATE "FeedRunLog" SET "check" = 'canary' WHERE "check" IS NULL;

-- Carry the scoring rows across, preserving their ids so any Sentry event
-- already tagged with one still resolves.
INSERT INTO "FeedRunLog" (
    "id", "kind", "feed", "check", "startedAt", "finishedAt", "status",
    "rowsParsed", "rowsImported", "parseFailures", "previousImported",
    "reason", "details"
)
SELECT
    s."id",
    'SCORING',
    'fund_scoring',
    s."check",
    s."startedAt",
    s."startedAt",
    s."status",
    NULL, NULL, NULL, NULL,
    s."reason",
    COALESCE(s."details", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'asOfDate',             to_char(s."asOfDate", 'YYYY-MM-DD'),
        'methodologyVersionId', s."methodologyVersionId",
        'tradingDays',          s."tradingDays",
        'gapWeekdays',          s."gapWeekdays",
        'gapFrom',              to_char(s."gapFrom", 'YYYY-MM-DD'),
        'gapTo',                to_char(s."gapTo", 'YYYY-MM-DD')
    ))
FROM "ScoringRunLog" s
-- Defensive: ids are cuids from two tables, so a collision is not credible,
-- but a migration that half-applies is worse than one that skips a row.
WHERE NOT EXISTS (SELECT 1 FROM "FeedRunLog" f WHERE f."id" = s."id");

DROP TABLE "ScoringRunLog";

-- The ops page reads failures newest-first across both kinds.
CREATE INDEX "FeedRunLog_kind_status_startedAt_idx"
    ON "FeedRunLog"("kind", "status", "startedAt");

-- FeedRunLog already carries the app-role grant from its own migration; the
-- new columns inherit it. ScoringRunLog's grant disappears with the table.
