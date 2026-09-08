-- CA workspace — foundation, accounting write access, and audit trail.
--
-- Grants a Chartered Accountant scoped access to a client's books, in the two
-- directions the product supports:
--
--   SHADOW  — the CA created the record for someone with no login. A shadow
--             User row owns the books, so every per-userId table, policy and
--             report builder in the app works on them with no change.
--   INVITED — a real user consented, and can revoke at any time.
--
-- THE CENTRAL DECISION, and the reason this file is long: a CA acts under
-- THEIR OWN identity. `app.current_user_id` is never re-bound to the client.
--
-- The alternative — runAsUser(clientId) impersonation, which is how family
-- fan-out works — would have been a much smaller change and is wrong here.
-- Portfolio's policy (20260701130000_family_hof_foundation) reads:
--
--     OR ("familyId" IS NOT NULL AND EXISTS (
--           SELECT 1 FROM "FamilyMember" fm
--           WHERE fm."familyId" = "Portfolio"."familyId"
--             AND fm."userId" = app_current_user_id() ...))
--
-- Under impersonation that branch fires for every family the client belongs
-- to, so the CA would read family-shared portfolios owned by the client's
-- spouse or parents — people who granted the CA nothing. A client can consent
-- to sharing their own data; they cannot consent on behalf of their family.
-- Impersonation grants the whole RLS surface of an identity, not the slice a
-- grant covers.
--
-- Keeping the CA's own identity also makes the write boundary a fact rather
-- than a promise: the policies below grant writes on exactly five tables, so
-- "a CA can edit vouchers but can never create a portfolio" is enforced by
-- Postgres even if a controller is later written carelessly.

-- ─── Schema ──────────────────────────────────────────────────────────

CREATE TYPE "ClientKind" AS ENUM ('SHADOW', 'INVITED');
CREATE TYPE "ClientStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE "CaConsentBasis" AS ENUM ('ENGAGEMENT_LETTER', 'WRITTEN_CONSENT', 'EXISTING_CLIENT_RELATIONSHIP', 'OTHER');
CREATE TYPE "CaAuditAction" AS ENUM (
  'CLIENT_RECORD_CREATED', 'CLIENT_INVITED', 'GRANT_ACCEPTED', 'GRANT_REVOKED',
  'ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_DELETED',
  'VOUCHER_CREATED', 'VOUCHER_UPDATED', 'VOUCHER_DELETED',
  'TRANSACTION_CORRECTED', 'FMV_OVERRIDE_SET', 'FMV_OVERRIDE_DELETED'
);

-- A shadow client is a real User row that must never authenticate. Its own
-- column rather than an overload of `isActive`, which already means
-- "deactivated" in dozens of places and would drag this into unrelated gates.
ALTER TABLE "User" ADD COLUMN "isShadowClient" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Client"
  ADD COLUMN "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "userId"          TEXT,
  ADD COLUMN "kind"            "ClientKind"   NOT NULL DEFAULT 'SHADOW',
  ADD COLUMN "status"          "ClientStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "invitedEmail"    TEXT,
  ADD COLUMN "inviteToken"     TEXT,
  ADD COLUMN "inviteExpiresAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt"      TIMESTAMP(3),
  ADD COLUMN "revokedAt"       TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT,
  ADD COLUMN "consentBasis"    "CaConsentBasis",
  ADD COLUMN "consentNote"     TEXT;

CREATE UNIQUE INDEX "Client_inviteToken_key" ON "Client"("inviteToken");
CREATE INDEX "Client_advisorId_status_idx" ON "Client"("advisorId", "status");
CREATE INDEX "Client_userId_status_idx" ON "Client"("userId", "status");

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pre-existing Client rows predate this feature and have no subject user, so
-- they can never satisfy the policy below. There is no way to synthesise a
-- lawful basis or a subject for them retroactively, and inventing one would be
-- worse than leaving them visible only to their advisor — which the policy
-- already does via the advisorId branch. They are left untouched deliberately;
-- see the accompanying note in the CA service about `status = 'PENDING'` rows
-- with a null userId being inert.

CREATE TABLE "CaAuditLog" (
  "id"            TEXT NOT NULL,
  "actorUserId"   TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "action"        "CaAuditAction" NOT NULL,
  "resourceType"  TEXT,
  "resourceId"    TEXT,
  "summary"       TEXT NOT NULL,
  "metadata"      JSONB,
  "ip"            TEXT,
  "userAgent"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaAuditLog_subjectUserId_createdAt_idx" ON "CaAuditLog"("subjectUserId", "createdAt");
CREATE INDEX "CaAuditLog_actorUserId_createdAt_idx"   ON "CaAuditLog"("actorUserId", "createdAt");
CREATE INDEX "CaAuditLog_clientId_createdAt_idx"      ON "CaAuditLog"("clientId", "createdAt");

-- NONE of actorUserId, subjectUserId or clientId is a foreign key, and that is
-- the point. A cascading relation would let deleting a grant — or either
-- party's account — erase every entry naming them, which is exactly the
-- erasure this table exists to prevent. Referential integrity is worth less
-- here than the record outliving the people in it.
--
-- The tension with a DPDP erasure request is real and is left to a deliberate
-- decision at that time rather than pre-resolved by an ON DELETE clause that
-- would silently destroy a professional's audit trail as a side effect of
-- routine account cleanup.

-- ─── The grant predicate ─────────────────────────────────────────────
--
-- SECURITY DEFINER for the same reason as app_is_active_family_owner
-- (20260903090000_fix_familymember_policy_recursion): the Client policy below
-- reads Client, and a policy expression that reads its own table re-enters the
-- policy and aborts with 42P17. Running as owner reads Client without
-- re-entering. search_path is pinned so a caller-created object cannot shadow
-- a name inside a definer-rights function.
--
-- It answers exactly one question about the CALLER — "am I an active CA for
-- this user" — so granting EXECUTE widens nothing: it cannot be used to probe
-- anyone else's relationships.
CREATE OR REPLACE FUNCTION app_is_active_ca_for(target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = target_user_id
      AND c."advisorId" = app_current_user_id()
      AND c.status = 'ACTIVE'
  );
$$;

COMMENT ON FUNCTION app_is_active_ca_for(TEXT) IS
  'RLS helper. True when app_current_user_id() holds an ACTIVE Client grant over target_user_id. SECURITY DEFINER so the Client lookup does not re-enter Client''s own policy (42P17). Answers one boolean about the caller themselves.';

GRANT EXECUTE ON FUNCTION app_is_active_ca_for(TEXT) TO portfolioos_app;

-- ─── Client ──────────────────────────────────────────────────────────
--
-- Both sides can see the grant: the CA who holds it, and the client it is
-- over. Only those two, and only ever their own rows.

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;

CREATE POLICY client_access ON "Client"
  USING (
    app_is_system()
    OR "advisorId" = app_current_user_id()
    OR "userId" = app_current_user_id()
  )
  WITH CHECK (
    app_is_system()
    OR "advisorId" = app_current_user_id()
    OR "userId" = app_current_user_id()
  );

-- ─── CaAuditLog — append-only by construction ────────────────────────
--
-- Three policies, and deliberately no UPDATE or DELETE policy. Under FORCE ROW
-- LEVEL SECURITY a command with no matching policy affects zero rows, for
-- every role the application can use — including system context. Editing or
-- erasing an entry therefore takes a superuser migration, which is the right
-- bar for a trail whose purpose is to hold a professional accountable.

ALTER TABLE "CaAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaAuditLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY caauditlog_read ON "CaAuditLog"
  FOR SELECT
  USING (
    app_is_system()
    OR "actorUserId" = app_current_user_id()
    OR "subjectUserId" = app_current_user_id()
  );

-- Writes go through the audit service, which runs inside the same transaction
-- as the mutation it records. The actor must be the caller: a CA cannot write
-- an entry attributing an action to somebody else.
CREATE POLICY caauditlog_insert ON "CaAuditLog"
  FOR INSERT
  WITH CHECK (
    app_is_system()
    OR "actorUserId" = app_current_user_id()
  );

-- ─── CA write surface — exactly five tables ──────────────────────────
--
-- These are ADDITIVE PERMISSIVE policies. Postgres OR-combines permissive
-- policies per command, so each sits alongside the existing owner policy and
-- widens it only for an active CA. The owner policies are untouched.
--
-- Each also carries app_is_system(), which is strictly redundant — the owner
-- policy beside it already grants system context, and OR means one is enough.
-- It is here because test/invariants/user-scoped-coverage.test.ts requires the
-- branch on EVERY policy, and a uniform rule that a test can check is worth
-- more than eleven exemptions someone has to reason about later.
--
-- The set of writable tables IS the permission model. There is no capability
-- column on Client to widen, and no policy on Portfolio, FamilyMember,
-- BrokerCredential or User — so a CA cannot create a portfolio, join a family,
-- read credentials or change an identity, whatever the application layer does.

CREATE POLICY account_ca_access ON "Account"
  USING (app_is_system() OR app_is_active_ca_for("userId"))
  WITH CHECK (app_is_system() OR app_is_active_ca_for("userId"));

CREATE POLICY voucher_ca_access ON "Voucher"
  USING (app_is_system() OR app_is_active_ca_for("userId"))
  WITH CHECK (app_is_system() OR app_is_active_ca_for("userId"));

-- VoucherEntry has no userId of its own; it joins through Voucher, the same
-- shape the existing owner policy uses.
CREATE POLICY voucherentry_ca_access ON "VoucherEntry"
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Voucher" v
      WHERE v.id = "VoucherEntry"."voucherId"
        AND app_is_active_ca_for(v."userId")
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Voucher" v
      WHERE v.id = "VoucherEntry"."voucherId"
        AND app_is_active_ca_for(v."userId")
    )
  );

CREATE POLICY fmvoverride_ca_access ON "FmvOverride"
  USING (app_is_system() OR app_is_active_ca_for("userId"))
  WITH CHECK (app_is_system() OR app_is_active_ca_for("userId"));

-- Transactions: CORRECT ONLY.
--
-- FOR UPDATE, not FOR ALL. A CA may fix a wrong date, amount or category on a
-- transaction the client already has; they may not conjure one into existence
-- or make one disappear. That distinction is the difference between correcting
-- a ledger and rewriting it, and it is enforced here rather than trusted to a
-- controller — there is simply no INSERT or DELETE policy for a CA to satisfy.
CREATE POLICY transaction_ca_correct ON "Transaction"
  FOR UPDATE
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "Transaction"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "Transaction"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );

-- ─── CA read surface for the accounting slice ────────────────────────
--
-- Reading a client's books needs the portfolios those books describe and the
-- rows the vouchers were projected from. Scoped to exactly that: the wider
-- read surface a CA needs to RUN REPORTS (holdings, capital gains, insurance,
-- vehicles, PF, documents…) is deliberately not granted here and belongs with
-- the reports slice, where it can be tested against the report builders that
-- consume it rather than added speculatively.

CREATE POLICY portfolio_ca_read ON "Portfolio"
  FOR SELECT
  USING (app_is_system() OR app_is_active_ca_for("userId"));

CREATE POLICY transaction_ca_read ON "Transaction"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "Transaction"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );

CREATE POLICY holdingprojection_ca_read ON "HoldingProjection"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "HoldingProjection"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );

CREATE POLICY capitalgain_ca_read ON "CapitalGain"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "CapitalGain"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );

CREATE POLICY cashflow_ca_read ON "CashFlow"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "CashFlow"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );
