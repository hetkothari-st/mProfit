-- Add PF_REFRESH_DUE to AlertType enum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PF_REFRESH_DUE';

-- Add nudge tracking columns to ProvidentFundAccount
ALTER TABLE "ProvidentFundAccount"
  ADD COLUMN IF NOT EXISTS "lastNudgedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "nudgeSnoozedUntil" TIMESTAMPTZ;
