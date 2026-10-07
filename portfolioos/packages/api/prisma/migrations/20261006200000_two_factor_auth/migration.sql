-- Two-factor sign-in (TOTP + backup codes). Additive.
ALTER TABLE "User"
  ADD COLUMN "twoFactorSecretEnc"        TEXT,
  ADD COLUMN "twoFactorPendingSecretEnc" TEXT,
  ADD COLUMN "twoFactorEnabledAt"        TIMESTAMP(3),
  ADD COLUMN "twoFactorLastStep"         INTEGER;

CREATE TABLE "TwoFactorBackupCode" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorBackupCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TwoFactorBackupCode_userId_idx" ON "TwoFactorBackupCode"("userId");
ALTER TABLE "TwoFactorBackupCode" ADD CONSTRAINT "TwoFactorBackupCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MfaChallenge" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "method"     TEXT NOT NULL,
    "restore"    BOOLEAN NOT NULL DEFAULT false,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MfaChallenge_userId_idx" ON "MfaChallenge"("userId");
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Both are read and written only in system context (the sign-in step has no
-- user session yet). No user may read even their own codes or challenges.
ALTER TABLE "TwoFactorBackupCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorBackupCode" FORCE  ROW LEVEL SECURITY;
CREATE POLICY twofactorbackupcode_system ON "TwoFactorBackupCode"
  USING (app_is_system()) WITH CHECK (app_is_system());
GRANT SELECT, INSERT, UPDATE, DELETE ON "TwoFactorBackupCode" TO portfolioos_app;

ALTER TABLE "MfaChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfaChallenge" FORCE  ROW LEVEL SECURITY;
CREATE POLICY mfachallenge_system ON "MfaChallenge"
  USING (app_is_system()) WITH CHECK (app_is_system());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfaChallenge" TO portfolioos_app;
