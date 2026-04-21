-- §5.1 task 11 / §3.6: Postgres Row-Level Security on every user-scoped table.
--
-- Defense-in-depth: even if an application query forgets `where: { userId }`,
-- the database enforces tenant isolation by joining each row back to its
-- owning user via `current_setting('app.current_user_id', true)`.
--
-- The application sets this session variable on every authenticated request
-- via a Prisma $extends hook that opens a short interactive transaction and
-- calls `SELECT set_config('app.current_user_id', $userId, true)`. When the
-- variable is missing (login flow, system jobs), current_setting returns
-- NULL and every USING clause evaluates to NULL → filter drops all rows.
--
-- FORCE ROW LEVEL SECURITY is required so the policy applies even to the
-- table owner — by default Postgres exempts owners, which would defeat RLS
-- entirely because Prisma typically connects as the DB owner.

-- Helper: equality with the current session's user id (treats missing as no match).
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT current_setting('app.current_user_id', true)
$$;

-- Helper: system jobs (price refresh, cross-tenant schedulers) explicitly opt
-- out of tenant filtering by setting `app.bypass_rls = 'on'` inside a tx.
-- No session variable ⇒ returns false ⇒ policy falls back to userId match.
-- This is a deliberate break-glass; only code in lib/requestContext.runAsSystem
-- is allowed to flip it.
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT current_setting('app.bypass_rls', true) = 'on'
$$;

-- ─── Root user-owned tables ────────────────────────────────────────────────
-- Each of these has a direct `userId` column, so the policy compares it
-- against app_current_user_id(). Both USING (read path) and WITH CHECK
-- (write path) are installed so inserts/updates also enforce ownership.

ALTER TABLE "Portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Portfolio" FORCE ROW LEVEL SECURITY;
CREATE POLICY portfolio_owner ON "Portfolio"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY importjob_owner ON "ImportJob"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_owner ON "Alert"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" FORCE ROW LEVEL SECURITY;
CREATE POLICY account_owner ON "Account"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "Voucher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Voucher" FORCE ROW LEVEL SECURITY;
CREATE POLICY voucher_owner ON "Voucher"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "CanonicalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CanonicalEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY canonicalevent_owner ON "CanonicalEvent"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "MonitoredSender" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonitoredSender" FORCE ROW LEVEL SECURITY;
CREATE POLICY monitoredsender_owner ON "MonitoredSender"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "LearnedTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearnedTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY learnedtemplate_owner ON "LearnedTemplate"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "IngestionFailure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IngestionFailure" FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestionfailure_owner ON "IngestionFailure"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_owner ON "Vehicle"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "RentalProperty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalProperty" FORCE ROW LEVEL SECURITY;
CREATE POLICY rentalproperty_owner ON "RentalProperty"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "InsurancePolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsurancePolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY insurancepolicy_owner ON "InsurancePolicy"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- AuditLog is special: system-generated entries (login failures, background
-- jobs) may have NULL userId. Allow app_current_user_id() to read its own
-- rows; writes are server-side only so WITH CHECK is permissive.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY auditlog_owner ON "AuditLog"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (true);

-- ─── Child tables via Portfolio.userId ─────────────────────────────────────

ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY transaction_owner ON "Transaction"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "Transaction"."portfolioId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "Transaction"."portfolioId" AND p."userId" = app_current_user_id()));

ALTER TABLE "Holding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Holding" FORCE ROW LEVEL SECURITY;
CREATE POLICY holding_owner ON "Holding"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "Holding"."portfolioId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "Holding"."portfolioId" AND p."userId" = app_current_user_id()));

ALTER TABLE "HoldingProjection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HoldingProjection" FORCE ROW LEVEL SECURITY;
CREATE POLICY holdingprojection_owner ON "HoldingProjection"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "HoldingProjection"."portfolioId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "HoldingProjection"."portfolioId" AND p."userId" = app_current_user_id()));

ALTER TABLE "CapitalGain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CapitalGain" FORCE ROW LEVEL SECURITY;
CREATE POLICY capitalgain_owner ON "CapitalGain"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "CapitalGain"."portfolioId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "CapitalGain"."portfolioId" AND p."userId" = app_current_user_id()));

ALTER TABLE "CashFlow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashFlow" FORCE ROW LEVEL SECURITY;
CREATE POLICY cashflow_owner ON "CashFlow"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "CashFlow"."portfolioId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "CashFlow"."portfolioId" AND p."userId" = app_current_user_id()));

-- ─── Child tables via other owners ─────────────────────────────────────────

ALTER TABLE "VoucherEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoucherEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY voucherentry_owner ON "VoucherEntry"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Voucher" v WHERE v.id = "VoucherEntry"."voucherId" AND v."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Voucher" v WHERE v.id = "VoucherEntry"."voucherId" AND v."userId" = app_current_user_id()));

ALTER TABLE "Challan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Challan" FORCE ROW LEVEL SECURITY;
CREATE POLICY challan_owner ON "Challan"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "Vehicle" v WHERE v.id = "Challan"."vehicleId" AND v."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Vehicle" v WHERE v.id = "Challan"."vehicleId" AND v."userId" = app_current_user_id()));

ALTER TABLE "Tenancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenancy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenancy_owner ON "Tenancy"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "RentalProperty" r WHERE r.id = "Tenancy"."propertyId" AND r."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "RentalProperty" r WHERE r.id = "Tenancy"."propertyId" AND r."userId" = app_current_user_id()));

-- RentReceipt two-hop: Tenancy → RentalProperty → userId
ALTER TABLE "RentReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY rentreceipt_owner ON "RentReceipt"
  USING (app_is_system() OR EXISTS (
    SELECT 1 FROM "Tenancy" t
    JOIN "RentalProperty" r ON r.id = t."propertyId"
    WHERE t.id = "RentReceipt"."tenancyId" AND r."userId" = app_current_user_id()
  ))
  WITH CHECK (app_is_system() OR EXISTS (
    SELECT 1 FROM "Tenancy" t
    JOIN "RentalProperty" r ON r.id = t."propertyId"
    WHERE t.id = "RentReceipt"."tenancyId" AND r."userId" = app_current_user_id()
  ));

ALTER TABLE "PropertyExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PropertyExpense" FORCE ROW LEVEL SECURITY;
CREATE POLICY propertyexpense_owner ON "PropertyExpense"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "RentalProperty" r WHERE r.id = "PropertyExpense"."propertyId" AND r."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "RentalProperty" r WHERE r.id = "PropertyExpense"."propertyId" AND r."userId" = app_current_user_id()));

ALTER TABLE "PremiumPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PremiumPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY premiumpayment_owner ON "PremiumPayment"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "InsurancePolicy" p WHERE p.id = "PremiumPayment"."policyId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "InsurancePolicy" p WHERE p.id = "PremiumPayment"."policyId" AND p."userId" = app_current_user_id()));

ALTER TABLE "InsuranceClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsuranceClaim" FORCE ROW LEVEL SECURITY;
CREATE POLICY insuranceclaim_owner ON "InsuranceClaim"
  USING (app_is_system() OR EXISTS (SELECT 1 FROM "InsurancePolicy" p WHERE p.id = "InsuranceClaim"."policyId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "InsurancePolicy" p WHERE p.id = "InsuranceClaim"."policyId" AND p."userId" = app_current_user_id()));
