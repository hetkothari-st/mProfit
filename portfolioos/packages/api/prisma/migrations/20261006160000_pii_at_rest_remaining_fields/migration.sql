-- PII at rest: the identifiers still stored as plain text after
-- 20260918100000 (PAN, plate) and 20261006150000 (loan account number).
-- Additive, plus one relaxed constraint.
--
--   Vehicle.registrationNo   was dual-written beside registrationNoEnc; it is
--                            no longer written once APP_ENCRYPTION_KEY is set,
--                            so it becomes nullable. Its unique index stays:
--                            Postgres allows many NULLs under a unique index,
--                            and it still guards legacy rows written without
--                            a key. registrationNoHash's index enforces
--                            uniqueness for encrypted rows.
--   Vehicle.engineNo, BankAccount.customerId, Tenancy.tenantPhone /
--   tenantEmail / tenantContact gain an <field>Enc ciphertext column.
--
-- Encryption happens in the app (pfCredentials.encryptIdentifier needs
-- APP_ENCRYPTION_KEY); services/piiAtRest.service.ts backfills on startup and
-- clears plaintext only under PII_BACKFILL_CLEAR_PLAINTEXT=true. No RLS
-- change: new columns do not affect the existing policies.
ALTER TABLE "Vehicle"
  ALTER COLUMN "registrationNo" DROP NOT NULL,
  ADD COLUMN "engineNoEnc" TEXT;

ALTER TABLE "BankAccount" ADD COLUMN "customerIdEnc" TEXT;

ALTER TABLE "Tenancy"
  ADD COLUMN "tenantPhoneEnc"   TEXT,
  ADD COLUMN "tenantEmailEnc"   TEXT,
  ADD COLUMN "tenantContactEnc" TEXT;
