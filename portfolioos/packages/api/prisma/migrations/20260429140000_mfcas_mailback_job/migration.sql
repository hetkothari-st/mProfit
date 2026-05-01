-- CAMS + KFintech mailback CAS job

-- CreateEnum
CREATE TYPE "MFMailbackProviderStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SUBMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MFMailbackJobStatus" AS ENUM (
  'PENDING',
  'CAPTCHA_REQUIRED',
  'SUBMITTING',
  'SUBMITTED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "MFCasMailbackJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "panLast4" TEXT NOT NULL,
    "emailMasked" TEXT NOT NULL,
    "periodFrom" DATE,
    "periodTo" DATE,
    "nickname" TEXT,
    "camsStatus" "MFMailbackProviderStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "camsRequestRef" TEXT,
    "camsErrorMessage" TEXT,
    "kfintechStatus" "MFMailbackProviderStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "kfintechRequestRef" TEXT,
    "kfintechErrorMessage" TEXT,
    "status" "MFMailbackJobStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "MFCasMailbackJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MFCasMailbackJob_userId_createdAt_idx" ON "MFCasMailbackJob"("userId", "createdAt");
CREATE INDEX "MFCasMailbackJob_userId_status_idx" ON "MFCasMailbackJob"("userId", "status");

-- AddForeignKey
ALTER TABLE "MFCasMailbackJob"
  ADD CONSTRAINT "MFCasMailbackJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "MFCasMailbackJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MFCasMailbackJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY mfcasmailbackjob_owner ON "MFCasMailbackJob"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
