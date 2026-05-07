-- Add NEEDS_PASSWORD to ImportStatus enum so locked PDF/XLSX uploads
-- have a first-class status instead of being routed to FAILED with a
-- string-matched warning. UI branches on this enum directly.
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'NEEDS_PASSWORD';

-- Add encrypted password store on User. Holds a JSON array of unlock
-- passwords the user has provided + opted to remember. Encryption via
-- lib/secrets.ts (AES-256-GCM, SECRETS_KEY).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "savedFilePasswordsEnc" TEXT;
