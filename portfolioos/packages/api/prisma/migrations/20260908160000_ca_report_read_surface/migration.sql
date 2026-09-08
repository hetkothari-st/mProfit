-- CA read surface for reports.
--
-- The accounting slice granted a CA read on five tables — enough to keep books,
-- not enough to run a client's reports. The 41-report catalogue, the four
-- statements and the section exports also read insurance, vehicles, rentals,
-- loans, credit cards, bank accounts, provident fund, documents and income.
--
-- This is READ ONLY. Nothing here lets a CA write to any of it; the write
-- surface stays the five tables from 20260908120000, plus the two derived
-- projections a correction has to rebuild.
--
-- WHY POLICIES RATHER THAN IMPERSONATION. The existing report machinery reaches
-- a family member's rows with runAsUser(member) — safe there, because the
-- caller is already a member of that family. A CA is not. Under the client's
-- identity, Portfolio's family branch fires and the CA reads family-shared
-- portfolios belonging to the client's relatives, who granted them nothing.
-- Granting explicit read policies keyed to the CA's own id is what lets the
-- reports run without ever borrowing the client's identity.
--
-- WHAT IS DELIBERATELY ABSENT, and must stay absent: credentials and live
-- sessions (BrokerCredential, MailboxAccount, BrokerAccount, the Gmail tables,
-- PfFetchSession, ExtensionPairing, AaConsent), household structure (Family and
-- its children — a CA must never see or appear in one), personal AI
-- transcripts, and the advisor engine's recommendations. A CA gets a client's
-- financial position, not their secrets, their family, or their private
-- conversations. test/security/ca-access.test.ts asserts these stay excluded.

-- ─── Tables owned directly by a userId ───────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'BankAccount', 'CreditCard', 'DerivativePosition', 'Document', 'ForexBalance',
    'Goal', 'Income', 'InsurancePolicy', 'Loan', 'LrsRemittance', 'MarginSnapshot',
    'NetWorthSnapshot', 'OwnedProperty', 'PortfolioGroup', 'PortfolioInsight',
    'ProvidentFundAccount', 'RentalProperty', 'SipPlan', 'TcsCredit', 'Vehicle'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_is_system() OR app_is_active_ca_for("userId"))',
      lower(t) || '_ca_read', t
    );
  END LOOP;
END $$;

-- ─── Tables that reach their owner through a parent ──────────────────
--
-- Same EXISTS shape the owner policies on these tables already use, so the two
-- read alike.
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('BankBalanceSnapshot', 'BankAccount',         'accountId'),
      ('Challan',             'Vehicle',             'vehicleId'),
      ('CreditCardStatement', 'CreditCard',          'cardId'),
      ('EpfMemberId',         'ProvidentFundAccount','providentFundAccountId'),
      ('InsuranceClaim',      'InsurancePolicy',     'policyId'),
      ('LoanPayment',         'Loan',                'loanId'),
      ('PremiumPayment',      'InsurancePolicy',     'policyId'),
      ('PropertyExpense',     'RentalProperty',      'propertyId'),
      ('Tenancy',             'RentalProperty',      'propertyId')
    ) AS s(child, parent, fk)
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_is_system() OR EXISTS (
         SELECT 1 FROM %I p WHERE p.id = %I.%I AND app_is_active_ca_for(p."userId")))',
      lower(spec.child) || '_ca_read', spec.child, spec.parent, spec.child, spec.fk
    );
  END LOOP;
END $$;

-- RentReceipt and RentReminder are two hops from an owner: they hang off
-- Tenancy, which hangs off RentalProperty. A policy cannot lean on another
-- table's policy inside its own EXISTS — Postgres evaluates the subquery
-- against the table, not through its RLS — so the join is spelled out in full
-- rather than assumed to resolve.
CREATE POLICY rentreceipt_ca_read ON "RentReceipt"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp.id = t."propertyId"
      WHERE t.id = "RentReceipt"."tenancyId"
        AND app_is_active_ca_for(rp."userId")
    )
  );

CREATE POLICY rentreminder_ca_read ON "RentReminder"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp.id = t."propertyId"
      WHERE t.id = "RentReminder"."tenancyId"
        AND app_is_active_ca_for(rp."userId")
    )
  );

-- PortfolioGroupMember joins a group rather than a user.
CREATE POLICY portfoliogroupmember_ca_read ON "PortfolioGroupMember"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "PortfolioGroup" g
      WHERE g.id = "PortfolioGroupMember"."groupId"
        AND app_is_active_ca_for(g."userId")
    )
  );

CREATE POLICY portfoliosetting_ca_read ON "PortfolioSetting"
  FOR SELECT
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "PortfolioSetting"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );
