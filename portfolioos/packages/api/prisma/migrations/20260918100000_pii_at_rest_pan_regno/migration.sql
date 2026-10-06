-- PII at rest: PAN and vehicle registration numbers. Additive only.
--
-- Follows the pattern 20260911100000_insurance_hub_policy_numbers established
-- for policy numbers:
--
--   <field>Enc    AES-256-GCM ciphertext, written by the app via
--                 pfCredentials.encryptIdentifier (needs APP_ENCRYPTION_KEY,
--                 so encryption cannot happen in SQL here).
--   <field>Hash   keyed HMAC fingerprint, for exact lookups and uniqueness
--                 without being reversible.
--   <field>Last4  for display.
--
-- Previously User.pan, Client.pan and Vehicle.registrationNo were plain text.
-- A database dump, a backup, or any read path that escaped RLS exposed them
-- directly.
--
-- Existing rows are encrypted on startup by services/piiAtRest.service.ts.
-- PAN plaintext is no longer written. The plaintext columns are NOT dropped
-- and NOT cleared here: clearing is an
-- irreversible data operation (lose APP_ENCRYPTION_KEY and the data is gone),
-- so it only happens when PII_BACKFILL_CLEAR_PLAINTEXT=true is set
-- deliberately, after the key is confirmed backed up. A later migration drops
-- the plaintext columns once that has run everywhere.
--
-- No RLS change: User, Client and Vehicle policies are unaffected by new
-- columns.

ALTER TABLE "User"
  ADD COLUMN "panEnc"   TEXT,
  ADD COLUMN "panHash"  TEXT,
  ADD COLUMN "panLast4" TEXT;

ALTER TABLE "Client"
  ADD COLUMN "panEnc"   TEXT,
  ADD COLUMN "panHash"  TEXT,
  ADD COLUMN "panLast4" TEXT;

-- Vehicle.registrationNo is DUAL-WRITTEN for now, unlike PAN: plaintext and
-- encrypted copies are both kept. About twenty call sites read the plate —
-- challan scans, expiry alerts, cron refresh jobs, loan/insurance labels,
-- reports — and they have not all moved to the decrypting reader yet.
-- Clearing plaintext before they do would blank the plate across the app.
-- So the column stays NOT NULL here; a follow-up migrates those readers,
-- then clears and drops the plaintext.

ALTER TABLE "Vehicle"
  ADD COLUMN "registrationNoEnc"   TEXT,
  ADD COLUMN "registrationNoHash"  TEXT,
  ADD COLUMN "registrationNoLast4" TEXT;

-- Uniqueness moves to the fingerprint, which is formatting-insensitive
-- (normalised before hashing), so "MH 47 BT 5950" and "MH47BT5950" collide
-- as they should.
CREATE UNIQUE INDEX "Vehicle_userId_registrationNoHash_key"
  ON "Vehicle"("userId", "registrationNoHash");
