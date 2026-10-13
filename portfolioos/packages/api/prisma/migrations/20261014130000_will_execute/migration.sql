-- Will Maker part 2: execute and store, review reminders
-- (docs/superpowers/plans/2026-10-12-will-maker-02-execute.md).
-- No GRANT: the table-level grants on "Will" to portfolioos_app cover added
-- columns (test/will/willExecuteSchema.db.test.ts), and Will's RLS policy is
-- row-based. The new enum value is not used inside this migration.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'WILL_REVIEW_DUE';

ALTER TABLE "Will" ADD COLUMN "executionSealed" BYTEA,
ADD COLUMN "executedDocumentId" TEXT;

-- The daily review job looks up executed wills whose review date has passed.
CREATE INDEX "Will_status_nextReviewAt_idx" ON "Will"("status", "nextReviewAt");
