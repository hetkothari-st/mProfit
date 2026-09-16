-- Account deletion with a 30-day grace period. All nullable/defaulted, so
-- existing rows are untouched and nobody is scheduled for deletion.
ALTER TABLE "User"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
  ADD COLUMN "deletionCodeHash" TEXT,
  ADD COLUMN "deletionCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "deletionCodeAttempts" INTEGER NOT NULL DEFAULT 0;

-- The daily purge job scans for due accounts.
CREATE INDEX "User_deletionScheduledFor_idx" ON "User"("deletionScheduledFor");
