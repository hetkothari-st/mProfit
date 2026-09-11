-- Insurance hub phase 2: claim tracker.
-- Additive only: new nullable columns on "InsuranceClaim" (RLS policy is
-- unchanged — it keys off policyId), timestamps backfilled to now(), and a new
-- alert type for claim follow-up reminders. No data is changed or removed.

ALTER TABLE "InsuranceClaim"
  ADD COLUMN "kind" TEXT,
  ADD COLUMN "documentsCompletedOn" DATE,
  ADD COLUMN "surveyorAllocatedOn" DATE,
  ADD COLUMN "checklist" JSONB,
  ADD COLUMN "timeline" JSONB,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "grievanceFiledOn" DATE,
  ADD COLUMN "grievanceRef" TEXT,
  ADD COLUMN "ombudsmanFiledOn" DATE,
  ADD COLUMN "ombudsmanRef" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'INSURANCE_CLAIM';
