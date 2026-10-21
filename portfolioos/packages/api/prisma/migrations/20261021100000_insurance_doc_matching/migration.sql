-- Matching insurance documents to policies. Additive only.

ALTER TYPE "InsuranceDocStatus" ADD VALUE IF NOT EXISTS 'DISMISSED';

-- The reading is stored encrypted from now on (it holds the policy number);
-- "extract" keeps legacy plaintext until the app seals it.
ALTER TABLE "InsuranceDocument" ADD COLUMN "extractEnc" TEXT;
ALTER TABLE "InsuranceDocument" ADD COLUMN "policyNumberHash" TEXT;
ALTER TABLE "InsuranceDocument" ADD COLUMN "note" TEXT;

CREATE INDEX "InsuranceDocument_userId_policyNumberHash_idx" ON "InsuranceDocument"("userId", "policyNumberHash");
