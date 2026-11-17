-- InsurerMetrics: claim amounts, repudiations and scope, sourced from the IRDAI
-- Handbook on Indian Insurance Statistics (Tables 53 and 62). Additive only.
ALTER TABLE "InsurerMetrics"
  ADD COLUMN "claimsRepudiated"     INTEGER,
  ADD COLUMN "claimsIncurredInr"    DECIMAL(20,2),
  ADD COLUMN "netEarnedPremiumInr"  DECIMAL(20,2),
  ADD COLUMN "claimsScope"          TEXT,
  ADD COLUMN "methodology"          TEXT;
