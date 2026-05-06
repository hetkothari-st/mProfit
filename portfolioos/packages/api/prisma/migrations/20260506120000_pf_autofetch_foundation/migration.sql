-- §6 EPF/PPF Auto-Fetch Foundation
--
-- Adds ProvidentFundAccount, EpfMemberId, PfFetchSession and the five new
-- enums (PfType, PfInstitution, PfAccountStatus, PfFetchSource, PfFetchStatus).
-- Also extends CanonicalEventType with PF_* values.
-- RLS policies and pgcrypto extension appended below.

-- ── New enums ─────────────────────────────────────────────────────

CREATE TYPE "PfType" AS ENUM ('EPF', 'PPF');

CREATE TYPE "PfInstitution" AS ENUM (
  'EPFO',
  'SBI',
  'INDIA_POST',
  'HDFC',
  'ICICI',
  'AXIS',
  'PNB',
  'BOB'
);

CREATE TYPE "PfAccountStatus" AS ENUM (
  'ACTIVE',
  'NEEDS_REAUTH',
  'LOCKED',
  'INSTITUTION_CHANGED'
);

CREATE TYPE "PfFetchSource" AS ENUM (
  'EXTENSION',
  'SERVER_HEADLESS',
  'MANUAL_PDF'
);

CREATE TYPE "PfFetchStatus" AS ENUM (
  'INITIATED',
  'AWAITING_CAPTCHA',
  'AWAITING_OTP',
  'SCRAPING',
  'PARSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- ── Extend CanonicalEventType ─────────────────────────────────────

ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_EMPLOYER_CONTRIBUTION';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_EMPLOYEE_CONTRIBUTION';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_VPF_CONTRIBUTION';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_INTEREST_CREDIT';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_WITHDRAWAL';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_TRANSFER_IN';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_TRANSFER_OUT';
ALTER TYPE "CanonicalEventType" ADD VALUE IF NOT EXISTS 'PF_OPENING_BALANCE';

-- ── ProvidentFundAccount ──────────────────────────────────────────

CREATE TABLE "ProvidentFundAccount" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "portfolioId"      TEXT,
    "type"             "PfType" NOT NULL,
    "institution"      "PfInstitution" NOT NULL,
    "identifierCipher" BYTEA NOT NULL,
    "identifierLast4"  TEXT NOT NULL,
    "holderName"       TEXT NOT NULL,
    "branchCode"       TEXT,
    "storedCredentials" JSONB,
    "credentialsKeyId" TEXT,
    "status"           "PfAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRefreshedAt"  TIMESTAMPTZ,
    "lastFetchSource"  "PfFetchSource",
    "currentBalance"   DECIMAL(18,4),
    "assetKey"         TEXT NOT NULL,
    "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ProvidentFundAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProvidentFundAccount_userId_assetKey_key"
  ON "ProvidentFundAccount"("userId", "assetKey");

CREATE INDEX "ProvidentFundAccount_userId_status_lastRefreshedAt_idx"
  ON "ProvidentFundAccount"("userId", "status", "lastRefreshedAt");

ALTER TABLE "ProvidentFundAccount"
  ADD CONSTRAINT "ProvidentFundAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProvidentFundAccount"
  ADD CONSTRAINT "ProvidentFundAccount_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── EpfMemberId ───────────────────────────────────────────────────

CREATE TABLE "EpfMemberId" (
    "id"                     TEXT NOT NULL,
    "providentFundAccountId" TEXT NOT NULL,
    "memberIdCipher"         BYTEA NOT NULL,
    "memberIdLast4"          TEXT NOT NULL,
    "establishmentName"      TEXT NOT NULL,
    "establishmentCode"      TEXT,
    "dateOfJoining"          DATE,
    "dateOfExit"             DATE,
    "currentBalance"         DECIMAL(18,4),
    "lastInterestUpdatedForFY" TEXT,

    CONSTRAINT "EpfMemberId_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EpfMemberId_providentFundAccountId_memberIdLast4_key"
  ON "EpfMemberId"("providentFundAccountId", "memberIdLast4");

ALTER TABLE "EpfMemberId"
  ADD CONSTRAINT "EpfMemberId_providentFundAccountId_fkey"
  FOREIGN KEY ("providentFundAccountId") REFERENCES "ProvidentFundAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PfFetchSession ────────────────────────────────────────────────

CREATE TABLE "PfFetchSession" (
    "id"                     TEXT NOT NULL,
    "providentFundAccountId" TEXT NOT NULL,
    "userId"                 TEXT NOT NULL,
    "source"                 "PfFetchSource" NOT NULL,
    "status"                 "PfFetchStatus" NOT NULL DEFAULT 'INITIATED',
    "startedAt"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"            TIMESTAMPTZ,
    "captchaAttempts"        INTEGER NOT NULL DEFAULT 0,
    "ocrUsed"                BOOLEAN NOT NULL DEFAULT false,
    "ocrSucceeded"           BOOLEAN,
    "rawPayloadRef"          TEXT,
    "eventsCreated"          INTEGER NOT NULL DEFAULT 0,
    "errorMessage"           TEXT,
    "ingestionFailureId"     TEXT,

    CONSTRAINT "PfFetchSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PfFetchSession_providentFundAccountId_startedAt_idx"
  ON "PfFetchSession"("providentFundAccountId", "startedAt");

CREATE INDEX "PfFetchSession_userId_status_idx"
  ON "PfFetchSession"("userId", "status");

ALTER TABLE "PfFetchSession"
  ADD CONSTRAINT "PfFetchSession_providentFundAccountId_fkey"
  FOREIGN KEY ("providentFundAccountId") REFERENCES "ProvidentFundAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- pgcrypto required for credential + identifier encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- RLS: each row scoped to current_setting('app.current_user_id', true)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_current_user_id') THEN
    EXECUTE 'ALTER TABLE "ProvidentFundAccount" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "ProvidentFundAccount" FORCE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY pfa_isolation ON "ProvidentFundAccount"
      USING (app_is_system() OR "userId" = app_current_user_id())
      WITH CHECK (app_is_system() OR "userId" = app_current_user_id())$p$;

    EXECUTE 'ALTER TABLE "EpfMemberId" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "EpfMemberId" FORCE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY epf_member_isolation ON "EpfMemberId"
      USING (
        app_is_system() OR EXISTS (
          SELECT 1 FROM "ProvidentFundAccount" pfa
          WHERE pfa.id = "EpfMemberId"."providentFundAccountId"
            AND pfa."userId" = app_current_user_id()
        )
      )$p$;

    EXECUTE 'ALTER TABLE "PfFetchSession" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "PfFetchSession" FORCE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY pf_session_isolation ON "PfFetchSession"
      USING (app_is_system() OR "userId" = app_current_user_id())
      WITH CHECK (app_is_system() OR "userId" = app_current_user_id())$p$;
  END IF;
END
$do$;

-- Grant runtime role access to the new tables (mirrors 20260421150000 grant pattern).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ProvidentFundAccount" TO portfolioos_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "EpfMemberId" TO portfolioos_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "PfFetchSession" TO portfolioos_app';
  END IF;
END
$do$;
