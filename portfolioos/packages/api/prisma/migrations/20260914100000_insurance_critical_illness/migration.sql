-- Whether a policy includes critical illness cover, and how much.
-- Additive only: two nullable columns (null = not recorded). RLS unchanged.

ALTER TABLE "InsurancePolicy"
  ADD COLUMN "criticalIllnessCover" BOOLEAN,
  ADD COLUMN "criticalIllnessSumAssured" DECIMAL(14,2);
