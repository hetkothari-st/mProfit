-- Insurance hub, phase 1. Additive only.
--
-- Policy numbers move to encrypted storage (policyNumberEnc, AES-256-GCM at
-- the app layer via pfCredentials.encryptIdentifier), with an HMAC
-- fingerprint (policyNumberHash) for duplicate checks and premium-email
-- matching, and the last 4 for display. The API encrypts existing plaintext
-- numbers on startup (insurance.service backfillPolicyNumberEncryption) — that
-- needs APP_ENCRYPTION_KEY, so it can't happen here. The plaintext column is
-- no longer written or read; it's made nullable now and dropped in a later
-- migration once every row is encrypted.
--
-- Also: per-policy contacts, a grace-period override, and premiumsTrackedFrom
-- — premiums due before it aren't tracked here. Existing policies take it
-- from the next-due date already saved (or the day they were added), so
-- recomputing next-due never flags years of premiums nobody logged.
--
-- No RLS change: "InsurancePolicy" already carries an owner policy.

ALTER TABLE "InsurancePolicy" ALTER COLUMN "policyNumber" DROP NOT NULL;

ALTER TABLE "InsurancePolicy"
  ADD COLUMN "policyNumberEnc"     TEXT,
  ADD COLUMN "policyNumberHash"    TEXT,
  ADD COLUMN "policyNumberLast4"   TEXT,
  ADD COLUMN "contacts"            JSONB,
  ADD COLUMN "gracePeriodDays"     INTEGER,
  ADD COLUMN "premiumsTrackedFrom" DATE;

UPDATE "InsurancePolicy"
   SET "premiumsTrackedFrom" = COALESCE("nextPremiumDue", "createdAt"::date);

CREATE UNIQUE INDEX "InsurancePolicy_userId_insurer_policyNumberHash_key"
  ON "InsurancePolicy"("userId", "insurer", "policyNumberHash");
