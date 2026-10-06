-- PII at rest: loan account numbers. Additive only.
--
-- Same pattern as 20260918100000_pii_at_rest_pan_regno: the app encrypts
-- (pfCredentials.encryptIdentifier needs APP_ENCRYPTION_KEY, so it cannot run
-- in SQL), services/piiAtRest.service.ts backfills existing rows on startup,
-- and the plaintext column is cleared only under
-- PII_BACKFILL_CLEAR_PLAINTEXT=true. No RLS change: Loan's policy is
-- unaffected by new columns.
ALTER TABLE "Loan"
  ADD COLUMN "accountNumberEnc"   TEXT,
  ADD COLUMN "accountNumberLast4" TEXT;
