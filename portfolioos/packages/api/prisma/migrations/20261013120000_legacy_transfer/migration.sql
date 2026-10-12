-- Legacy Transfer (docs/legacy-transfer/01-DESIGN.md)

CREATE TYPE "LegacyStatus" AS ENUM ('DRAFT', 'ARMED', 'WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE', 'RELEASED', 'PAUSED');

CREATE TYPE "LegacyTrigger" AS ENUM ('INACTIVITY', 'SCHEDULED', 'BOTH');

CREATE TYPE "LegacyTokenPurpose" AS ENUM ('INVITE', 'ACCESS', 'IM_OK', 'VERIFY');

CREATE TYPE "LegacyCodePurpose" AS ENUM ('NOMINEE_OTP', 'NOMINEE_SESSION', 'OWNER_STEPUP_CODE', 'OWNER_STEPUP_GRANT');

ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

CREATE TABLE "LegacyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LegacyStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerMode" "LegacyTrigger" NOT NULL DEFAULT 'INACTIVITY',
    "inactivityDays" INTEGER NOT NULL DEFAULT 90,
    "scheduledFor" DATE,
    "pausedUntil" DATE,
    "stageEnteredAt" TIMESTAMP(3),
    "clockResetAt" TIMESTAMP(3),
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "letterEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyNominee" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameEnc" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "isVerifier" BOOLEAN NOT NULL DEFAULT false,
    "categories" TEXT[],
    "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showAmounts" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyNominee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyToken" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nomineeId" TEXT,
    "purpose" "LegacyTokenPurpose" NOT NULL,
    "cycle" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nomineeId" TEXT,
    "subjectId" TEXT NOT NULL,
    "purpose" "LegacyCodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyOutbox" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "tokenEnc" TEXT,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyPlan_userId_key" ON "LegacyPlan"("userId");

CREATE INDEX "LegacyPlan_status_idx" ON "LegacyPlan"("status");

CREATE INDEX "LegacyNominee_planId_idx" ON "LegacyNominee"("planId");

CREATE INDEX "LegacyNominee_userId_idx" ON "LegacyNominee"("userId");

CREATE UNIQUE INDEX "LegacyToken_tokenHash_key" ON "LegacyToken"("tokenHash");

CREATE INDEX "LegacyToken_planId_purpose_idx" ON "LegacyToken"("planId", "purpose");

CREATE INDEX "LegacyCode_nomineeId_idx" ON "LegacyCode"("nomineeId");

CREATE UNIQUE INDEX "LegacyCode_subjectId_purpose_key" ON "LegacyCode"("subjectId", "purpose");

CREATE INDEX "LegacyOutbox_sentAt_idx" ON "LegacyOutbox"("sentAt");

CREATE UNIQUE INDEX "LegacyOutbox_planId_kind_cycle_recipientKey_key" ON "LegacyOutbox"("planId", "kind", "cycle", "recipientKey");

ALTER TABLE "LegacyPlan" ADD CONSTRAINT "LegacyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyNominee" ADD CONSTRAINT "LegacyNominee_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LegacyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyToken" ADD CONSTRAINT "LegacyToken_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LegacyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyToken" ADD CONSTRAINT "LegacyToken_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "LegacyNominee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyCode" ADD CONSTRAINT "LegacyCode_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "LegacyNominee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyOutbox" ADD CONSTRAINT "LegacyOutbox_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LegacyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: owner-only, system bypass. Same shape as SplitSettings (20261007150000).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['LegacyPlan','LegacyNominee','LegacyToken','LegacyCode','LegacyOutbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR "userId" = app_current_user_id()) WITH CHECK (app_is_system() OR "userId" = app_current_user_id())', lower(t) || '_owner', t);
  END LOOP;
END $$;

ALTER TABLE "LegacyPlan" ADD CONSTRAINT "LegacyPlan_inactivityDays_min" CHECK ("inactivityDays" >= 30);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "LegacyPlan","LegacyNominee","LegacyToken","LegacyCode","LegacyOutbox"
TO portfolioos_app;
