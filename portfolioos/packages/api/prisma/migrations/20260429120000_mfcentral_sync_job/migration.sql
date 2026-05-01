-- MFCentral OTP-driven CAS sync job + RLS

-- CreateEnum
CREATE TYPE "MFCentralOtpMethod" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "MFCentralSyncStatus" AS ENUM (
  'OTP_PENDING',
  'OTP_SUBMITTED',
  'DOWNLOADING',
  'PARSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

-- CreateTable
CREATE TABLE "MFCentralSyncJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "panLast4" TEXT NOT NULL,
    "otpMethod" "MFCentralOtpMethod" NOT NULL,
    "contactMasked" TEXT NOT NULL,
    "periodFrom" DATE,
    "periodTo" DATE,
    "nickname" TEXT,
    "status" "MFCentralSyncStatus" NOT NULL DEFAULT 'OTP_PENDING',
    "playwrightSessionId" TEXT,
    "txnsCreated" INTEGER,
    "fundsFound" INTEGER,
    "warningLog" JSONB,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MFCentralSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MFCentralSyncJob_userId_createdAt_idx" ON "MFCentralSyncJob"("userId", "createdAt");
CREATE INDEX "MFCentralSyncJob_userId_status_idx" ON "MFCentralSyncJob"("userId", "status");

-- AddForeignKey
ALTER TABLE "MFCentralSyncJob"
  ADD CONSTRAINT "MFCentralSyncJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (matches phase_4_5_rls pattern)
ALTER TABLE "MFCentralSyncJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MFCentralSyncJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY mfcentralsyncjob_owner ON "MFCentralSyncJob"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
