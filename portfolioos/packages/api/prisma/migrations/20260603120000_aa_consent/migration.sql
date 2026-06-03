-- ─── Account Aggregator consents ──────────────────────────────────
-- One row per consent issued through an AA partner (Finfactor / Finvu).
-- RLS policy at the bottom ensures cross-tenant isolation per §3.6.

CREATE TABLE "AaConsent" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "provider"      TEXT NOT NULL DEFAULT 'finfactor',
    "consentHandle" TEXT,
    "consentId"     TEXT,
    "status"        TEXT NOT NULL DEFAULT 'INITIATED',
    "fiTypes"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fipIds"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purposeCode"   TEXT,
    "purposeText"   TEXT,
    "redirectUrl"   TEXT,
    "ecres"         TEXT,
    "initiatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt"    TIMESTAMP(3),
    "expiresAt"     TIMESTAMP(3),
    "revokedAt"     TIMESTAMP(3),
    "lastSyncedAt"  TIMESTAMP(3),
    "metadata"      JSONB,

    CONSTRAINT "AaConsent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AaConsent" ADD CONSTRAINT "AaConsent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AaConsent_userId_consentHandle_key"
    ON "AaConsent"("userId", "consentHandle");
CREATE INDEX "AaConsent_userId_status_idx"     ON "AaConsent"("userId", "status");
CREATE INDEX "AaConsent_provider_status_idx"   ON "AaConsent"("provider", "status");

-- §3.6 RLS — every consent row scoped to the owning user.
ALTER TABLE "AaConsent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aa_consent_owner" ON "AaConsent"
    USING ("userId" = current_setting('app.current_user_id', true));
