-- Plan C: Browser Extension Pairing
--
-- Adds ExtensionPairing model for linking browser extension installs to user
-- accounts via short-lived codes. Uses SHA-256(bearer) for indexed verification
-- without storing bearer plaintext. See plan §C1 for decision rationale.

CREATE TABLE "ExtensionPairing" (
    "id"                   TEXT        NOT NULL,
    "userId"               TEXT        NOT NULL,
    "pairingCode"          TEXT        NOT NULL,
    "pairingCodeExpiresAt" TIMESTAMPTZ NOT NULL,
    "bearerHash"           TEXT,
    "bearerLast8"          TEXT,
    "paired"               BOOLEAN     NOT NULL DEFAULT false,
    "pairedAt"             TIMESTAMPTZ,
    "lastUsedAt"           TIMESTAMPTZ,
    "revoked"              BOOLEAN     NOT NULL DEFAULT false,
    "revokedAt"            TIMESTAMPTZ,
    "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionPairing_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "ExtensionPairing_pairingCode_key" ON "ExtensionPairing"("pairingCode");
CREATE UNIQUE INDEX "ExtensionPairing_bearerHash_key"  ON "ExtensionPairing"("bearerHash");

-- Indexes for common query patterns
CREATE INDEX "ExtensionPairing_userId_paired_idx"   ON "ExtensionPairing"("userId", "paired");
CREATE INDEX "ExtensionPairing_userId_revoked_idx"  ON "ExtensionPairing"("userId", "revoked");

-- Foreign key: ExtensionPairing → User
ALTER TABLE "ExtensionPairing"
    ADD CONSTRAINT "ExtensionPairing_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Follows the pattern established in 20260421140000_phase_4_5_rls.sql and
-- 20260506120000_pf_autofetch_foundation.sql. Guards are wrapped in a
-- DO block so they only fire when the app_current_user_id() and app_is_system()
-- functions exist (i.e. after the RLS role migration has run).

ALTER TABLE "ExtensionPairing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExtensionPairing" FORCE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'app_current_user_id'
  ) THEN
    CREATE POLICY ext_pairing_isolation ON "ExtensionPairing"
      USING  (app_is_system() OR "userId" = app_current_user_id())
      WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
  END IF;
END $do$;
