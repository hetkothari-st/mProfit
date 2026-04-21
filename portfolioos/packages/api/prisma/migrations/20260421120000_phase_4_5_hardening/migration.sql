-- =====================================================================
-- Phase 4.5 hardening migration (CLAUDE.md §4 + §4.10).
--
-- Scope:
--   1. Enable pgcrypto (needed for digest() in assetKey backfill and for
--      future column-level encryption per §15.1).
--   2. Additive schema for §4.1–§4.9: CanonicalEvent, MonitoredSender,
--      LearnedTemplate, IngestionFailure, HoldingProjection, Vehicle,
--      Challan, RentalProperty, Tenancy, RentReceipt, PropertyExpense,
--      InsurancePolicy, PremiumPayment, InsuranceClaim, AuditLog,
--      AppSetting. Two new enums.
--   3. Additive columns on Transaction: assetKey, sourceAdapter,
--      sourceAdapterVer, sourceHash, canonicalEventId. All nullable so
--      existing rows do not block the migration.
--   4. Backfill assetKey for every existing Transaction (§4.10 step 2).
--   5. Backfill sourceHash for rows that were imported (§4.10 step 7) —
--      manual entries stay NULL by design.
--   6. Seed five AppSetting rows (§4.9) that the rest of Phase 4.5
--      reads from at runtime.
--
-- Deferred to a follow-up migration once Task 4's FIFO replay service
-- has verified parity:
--   - ALTER COLUMN "Transaction"."assetKey" SET NOT NULL;
--   - HoldingProjection row population (§4.10 step 4).
--   - Drop of legacy "Holding" table (§4.10 step 6).
-- =====================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "CanonicalEventType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST_CREDIT', 'INTEREST_DEBIT', 'EMI_DEBIT', 'PREMIUM_PAID', 'MATURITY_CREDIT', 'RENT_RECEIVED', 'RENT_PAID', 'SIP_INSTALLMENT', 'FD_CREATION', 'FD_MATURITY', 'CARD_PURCHASE', 'CARD_PAYMENT', 'UPI_CREDIT', 'UPI_DEBIT', 'NEFT_CREDIT', 'NEFT_DEBIT', 'VALUATION_SNAPSHOT', 'VEHICLE_CHALLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "CanonicalEventStatus" AS ENUM ('PARSED', 'PENDING_REVIEW', 'CONFIRMED', 'PROJECTED', 'REJECTED', 'FAILED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "assetKey" TEXT,
ADD COLUMN     "canonicalEventId" TEXT,
ADD COLUMN     "sourceAdapter" TEXT,
ADD COLUMN     "sourceAdapterVer" TEXT,
ADD COLUMN     "sourceHash" TEXT;

-- CreateTable
CREATE TABLE "CanonicalEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "sourceAdapter" TEXT NOT NULL,
    "sourceAdapterVer" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "eventType" "CanonicalEventType" NOT NULL,
    "eventDate" DATE NOT NULL,
    "amount" DECIMAL(18,4),
    "quantity" DECIMAL(18,6),
    "price" DECIMAL(18,4),
    "counterparty" TEXT,
    "instrumentIsin" TEXT,
    "instrumentSymbol" TEXT,
    "instrumentName" TEXT,
    "accountLast4" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "metadata" JSONB,
    "confidence" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "parserNotes" TEXT,
    "status" "CanonicalEventStatus" NOT NULL DEFAULT 'PARSED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "projectedTransactionId" TEXT,
    "projectedCashFlowId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredSender" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoCommitAfter" INTEGER NOT NULL DEFAULT 5,
    "autoCommitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "confirmedEventCount" INTEGER NOT NULL DEFAULT 0,
    "currentTemplateId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoredSender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "bodyStructureHash" TEXT NOT NULL,
    "extractionRecipe" JSONB NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "confidenceScore" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "LearnedTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionFailure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceAdapter" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "errorStack" TEXT,
    "rawPayload" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingProjection" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "stockId" TEXT,
    "fundId" TEXT,
    "assetName" TEXT,
    "isin" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "avgCostPrice" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "currentPrice" DECIMAL(18,4),
    "currentValue" DECIMAL(18,4),
    "unrealisedPnL" DECIMAL(18,4),
    "realisedPnL" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceTxCount" INTEGER NOT NULL,

    CONSTRAINT "HoldingProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "registrationNo" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "variant" TEXT,
    "manufacturingYear" INTEGER,
    "fuelType" TEXT,
    "color" TEXT,
    "chassisLast4" TEXT,
    "rtoCode" TEXT,
    "ownerName" TEXT,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(14,2),
    "currentValue" DECIMAL(14,2),
    "currentValueSource" TEXT,
    "insuranceExpiry" DATE,
    "insurancePolicyId" TEXT,
    "pucExpiry" DATE,
    "fitnessExpiry" DATE,
    "roadTaxExpiry" DATE,
    "permitExpiry" DATE,
    "lastRefreshedAt" TIMESTAMP(3),
    "refreshSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challan" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "challanNo" TEXT NOT NULL,
    "offenceDate" DATE NOT NULL,
    "offenceType" TEXT,
    "location" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalProperty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "propertyType" TEXT NOT NULL,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(14,2),
    "currentValue" DECIMAL(14,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "tenantContact" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "monthlyRent" DECIMAL(12,2) NOT NULL,
    "securityDeposit" DECIMAL(12,2),
    "rentDueDay" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentReceipt" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "forMonth" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "receivedAmount" DECIMAL(12,2),
    "dueDate" DATE NOT NULL,
    "receivedOn" DATE,
    "status" TEXT NOT NULL,
    "cashFlowId" TEXT,
    "notes" TEXT,
    "autoMatchedFromEventId" TEXT,

    CONSTRAINT "RentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyExpense" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,

    CONSTRAINT "PropertyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "insurer" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "planName" TEXT,
    "policyHolder" TEXT NOT NULL,
    "nominees" JSONB,
    "sumAssured" DECIMAL(14,2) NOT NULL,
    "premiumAmount" DECIMAL(12,2) NOT NULL,
    "premiumFrequency" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "maturityDate" DATE,
    "nextPremiumDue" DATE,
    "vehicleId" TEXT,
    "healthCoverDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumPayment" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "canonicalEventId" TEXT,

    CONSTRAINT "PremiumPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "claimNumber" TEXT,
    "claimDate" DATE NOT NULL,
    "claimType" TEXT NOT NULL,
    "claimedAmount" DECIMAL(14,2) NOT NULL,
    "settledAmount" DECIMAL(14,2),
    "status" TEXT NOT NULL,
    "settledOn" DATE,
    "documents" JSONB,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CanonicalEvent_userId_status_eventDate_idx" ON "CanonicalEvent"("userId", "status", "eventDate");

-- CreateIndex
CREATE INDEX "CanonicalEvent_sourceAdapter_sourceAdapterVer_idx" ON "CanonicalEvent"("sourceAdapter", "sourceAdapterVer");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalEvent_userId_sourceHash_key" ON "CanonicalEvent"("userId", "sourceHash");

-- CreateIndex
CREATE INDEX "MonitoredSender_userId_isActive_idx" ON "MonitoredSender"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredSender_userId_address_key" ON "MonitoredSender"("userId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedTemplate_userId_senderAddress_bodyStructureHash_vers_key" ON "LearnedTemplate"("userId", "senderAddress", "bodyStructureHash", "version");

-- CreateIndex
CREATE INDEX "IngestionFailure_userId_resolvedAt_idx" ON "IngestionFailure"("userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "HoldingProjection_portfolioId_assetClass_idx" ON "HoldingProjection"("portfolioId", "assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "HoldingProjection_portfolioId_assetKey_key" ON "HoldingProjection"("portfolioId", "assetKey");

-- CreateIndex
CREATE INDEX "Vehicle_userId_insuranceExpiry_idx" ON "Vehicle"("userId", "insuranceExpiry");

-- CreateIndex
CREATE INDEX "Vehicle_userId_pucExpiry_idx" ON "Vehicle"("userId", "pucExpiry");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_userId_registrationNo_key" ON "Vehicle"("userId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "Challan_vehicleId_challanNo_key" ON "Challan"("vehicleId", "challanNo");

-- CreateIndex
CREATE INDEX "Tenancy_propertyId_isActive_idx" ON "Tenancy"("propertyId", "isActive");

-- CreateIndex
CREATE INDEX "RentReceipt_dueDate_status_idx" ON "RentReceipt"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RentReceipt_tenancyId_forMonth_key" ON "RentReceipt"("tenancyId", "forMonth");

-- CreateIndex
CREATE INDEX "InsurancePolicy_userId_nextPremiumDue_idx" ON "InsurancePolicy"("userId", "nextPremiumDue");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePolicy_userId_insurer_policyNumber_key" ON "InsurancePolicy"("userId", "insurer", "policyNumber");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_sourceHash_key" ON "Transaction"("sourceHash");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_assetKey_idx" ON "Transaction"("portfolioId", "assetKey");

-- CreateIndex
CREATE INDEX "Transaction_sourceAdapter_sourceAdapterVer_idx" ON "Transaction"("sourceAdapter", "sourceAdapterVer");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEvent" ADD CONSTRAINT "CanonicalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEvent" ADD CONSTRAINT "CanonicalEvent_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredSender" ADD CONSTRAINT "MonitoredSender_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredSender" ADD CONSTRAINT "MonitoredSender_currentTemplateId_fkey" FOREIGN KEY ("currentTemplateId") REFERENCES "LearnedTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnedTemplate" ADD CONSTRAINT "LearnedTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionFailure" ADD CONSTRAINT "IngestionFailure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingProjection" ADD CONSTRAINT "HoldingProjection_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challan" ADD CONSTRAINT "Challan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalProperty" ADD CONSTRAINT "RentalProperty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RentalProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentReceipt" ADD CONSTRAINT "RentReceipt_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyExpense" ADD CONSTRAINT "PropertyExpense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RentalProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumPayment" ADD CONSTRAINT "PremiumPayment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =====================================================================
-- Data migration §4.10 (additive portion only — NOT NULL flip + projection
-- population are deferred to the follow-up migration).
-- =====================================================================

-- §4.10 step 2: backfill assetKey for every existing Transaction.
-- Precedence: stock → fund → isin → hash(lower(trim(assetName))). The
-- final fallback ensures the column is non-null after this UPDATE even
-- if every other identifier is missing (assetName itself is nullable,
-- so coalesce to '' before hashing — an empty-string hash is still a
-- stable, deterministic key, which is all the uniqueness constraint
-- needs).
UPDATE "Transaction"
SET "assetKey" = COALESCE(
    CASE WHEN "stockId" IS NOT NULL THEN 'stock:' || "stockId" END,
    CASE WHEN "fundId"  IS NOT NULL THEN 'fund:'  || "fundId"  END,
    CASE WHEN "isin" IS NOT NULL AND "isin" <> '' THEN 'isin:' || "isin" END,
    'name:' || encode(digest(lower(trim(COALESCE("assetName", ''))), 'sha256'), 'hex')
)
WHERE "assetKey" IS NULL;

-- §4.10 step 7: backfill sourceHash for imported rows only. Manual
-- entries (importJobId IS NULL) keep sourceHash = NULL because there is
-- no deterministic natural key for user-typed transactions. The partial
-- UNIQUE is implemented by Prisma as a plain unique index; NULLs remain
-- permitted because PostgreSQL treats them as distinct.
UPDATE "Transaction"
SET "sourceHash" = encode(
    digest(
        COALESCE("broker", '') || ':' ||
        COALESCE("orderNo", '') || ':' ||
        "tradeDate"::text || ':' ||
        "netAmount"::text,
        'sha256'
    ),
    'hex'
)
WHERE "importJobId" IS NOT NULL
  AND "sourceHash" IS NULL
  AND COALESCE("orderNo", '') <> '';

-- §4.9: seed default AppSetting rows consumed by Phase 4.5+ ingestion.
-- ON CONFLICT DO NOTHING so re-running the migration (or a manual
-- edit followed by a reset) does not clobber operator-tuned values.
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES
    ('llm.monthly_warn_inr', '500'::jsonb, CURRENT_TIMESTAMP),
    ('llm.monthly_cap_inr',  '1000'::jsonb, CURRENT_TIMESTAMP),
    ('llm.model',            '"claude-haiku-4-5-20251001"'::jsonb, CURRENT_TIMESTAMP),
    ('ingestion.default_auto_commit_threshold', '5'::jsonb, CURRENT_TIMESTAMP),
    ('ingestion.discovery_scan_lookback_days',  '730'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
