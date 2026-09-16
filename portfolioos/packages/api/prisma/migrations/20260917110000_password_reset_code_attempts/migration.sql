-- Password reset now emails a 6-digit code instead of logging a link token.
-- A 6-digit code is guessable without an attempt cap, so count wrong tries.
ALTER TABLE "PasswordResetToken" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
