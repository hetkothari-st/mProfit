-- Insurance hub, phase 5 (extras). Additive only — nothing is dropped.
--
--   1. Health premiums under section 126 (Income-tax Act, 2025): who the cover
--      is for, and whether the insured is a senior citizen.
--   2. Surrender value as quoted by the insurer.
--   3. Premiums imported from insurance statements (Transaction rows) linked
--      to a policy at most once, via PremiumPayment.sourceTransactionId.
--   4. InsuranceImportDismissal: imported premiums the user said aren't for a
--      policy, so they aren't suggested again. RLS like the other
--      user-owned tables (20260421140000_phase_4_5_rls).

ALTER TABLE "InsurancePolicy"
  ADD COLUMN "taxBucket" TEXT,
  ADD COLUMN "seniorCitizen" BOOLEAN,
  ADD COLUMN "surrenderValue" DECIMAL(14,2),
  ADD COLUMN "surrenderValueAsOf" DATE;

ALTER TABLE "PremiumPayment" ADD COLUMN "sourceTransactionId" TEXT;
CREATE UNIQUE INDEX "PremiumPayment_sourceTransactionId_key" ON "PremiumPayment"("sourceTransactionId");

CREATE TABLE "InsuranceImportDismissal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InsuranceImportDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsuranceImportDismissal_policyId_transactionId_key"
  ON "InsuranceImportDismissal"("policyId", "transactionId");
CREATE INDEX "InsuranceImportDismissal_userId_idx" ON "InsuranceImportDismissal"("userId");

ALTER TABLE "InsuranceImportDismissal"
  ADD CONSTRAINT "InsuranceImportDismissal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsuranceImportDismissal"
  ADD CONSTRAINT "InsuranceImportDismissal_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InsuranceImportDismissal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsuranceImportDismissal" FORCE ROW LEVEL SECURITY;
CREATE POLICY insuranceimportdismissal_owner ON "InsuranceImportDismissal"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
