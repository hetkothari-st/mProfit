-- What a CA grant actually covers, and for how long.
--
-- Until now a grant was one bit: ACTIVE or not. An ACTIVE grant reached every
-- portfolio, every asset class and every category the read surface exposed,
-- for as long as nobody remembered to revoke it. The client had one control,
-- and it was all-or-nothing.
--
-- This adds three narrowings and a clock, and — this is the point — puts all
-- four inside the policies rather than in the services that read them. A cap
-- enforced only in a controller is a cap that the next endpoint forgets. The
-- helper functions below are the single place each question is answered, so a
-- policy that consults them cannot drift from one that does.
--
-- Defaults are chosen so nothing changes for a grant that already exists:
-- scopeAll* default true, both dates default null, and every helper answers
-- exactly as it did before when they hold.

ALTER TABLE "Client"
  ADD COLUMN "accessFrom" TIMESTAMP(3),
  ADD COLUMN "accessUntil" TIMESTAMP(3),
  ADD COLUMN "scopeAllPortfolios" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "scopeAllAssetClasses" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "scopeAllCategories" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "visibleAssetClasses" "AssetClass"[] DEFAULT ARRAY[]::"AssetClass"[],
  ADD COLUMN "visibleCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ClientPortfolioScope" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPortfolioScope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientPortfolioScope_clientId_portfolioId_key"
  ON "ClientPortfolioScope"("clientId", "portfolioId");
CREATE INDEX "ClientPortfolioScope_portfolioId_idx"
  ON "ClientPortfolioScope"("portfolioId");

ALTER TABLE "ClientPortfolioScope"
  ADD CONSTRAINT "ClientPortfolioScope_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortfolioScope"
  ADD CONSTRAINT "ClientPortfolioScope_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The scope rows are part of the grant, so both sides of it may read them and
-- only the client may write them. A CA who could edit their own scope would
-- have no scope at all.
ALTER TABLE "ClientPortfolioScope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientPortfolioScope" FORCE ROW LEVEL SECURITY;

CREATE POLICY clientportfolioscope_read ON "ClientPortfolioScope"
  FOR SELECT USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "ClientPortfolioScope"."clientId"
        AND (c."advisorId" = app_current_user_id() OR c."userId" = app_current_user_id())
    )
  );

CREATE POLICY clientportfolioscope_write ON "ClientPortfolioScope"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "ClientPortfolioScope"."clientId"
        AND c."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "ClientPortfolioScope"."clientId"
        AND c."userId" = app_current_user_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "ClientPortfolioScope" TO portfolioos_app;

-- ─── The clock ───────────────────────────────────────────────────────
--
-- Rewriting `app_is_active_ca_for` binds the window to all forty-six existing
-- CA policies in one statement. Every other answer in this file is built on
-- top of it, so an expired grant fails every check rather than most of them.

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
      AND (c."accessFrom" IS NULL OR c."accessFrom" <= now())
      AND (c."accessUntil" IS NULL OR c."accessUntil" >= now())
  );
$$;

COMMENT ON FUNCTION app_is_active_ca_for(TEXT) IS
  'RLS helper. True when app_current_user_id() holds an ACTIVE, in-window Client grant over target_user_id. SECURITY DEFINER so the Client lookup does not re-enter Client''s own policy (42P17).';

-- ─── The three narrowings ────────────────────────────────────────────

-- Two shapes of the same question, and the difference matters.
--
-- This one is told the owner and the portfolio id, and reads nothing but the
-- grant. `Portfolio`'s own policy MUST use it: a STABLE function reading
-- "Portfolio" sees the snapshot from the start of the statement, so during an
-- INSERT ... RETURNING the row being inserted is invisible to it and the
-- policy denies the row its own author just wrote. That is what broke the
-- CA's bootstrap of a portfolio for a client who had none.
CREATE OR REPLACE FUNCTION app_ca_grant_covers_portfolio(owner_id TEXT, portfolio_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND c."advisorId" = app_current_user_id()
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom" <= now())
      AND (c."accessUntil" IS NULL OR c."accessUntil" >= now())
      AND (
        c."scopeAllPortfolios"
        OR EXISTS (
          SELECT 1 FROM "ClientPortfolioScope" s
          WHERE s."clientId" = c.id AND s."portfolioId" = portfolio_id
        )
      )
  );
$$;

COMMENT ON FUNCTION app_ca_grant_covers_portfolio(TEXT, TEXT) IS
  'RLS helper. Same answer as app_ca_may_see_portfolio, but told the owner instead of looking it up — safe inside "Portfolio"''s own policy, where reading that table cannot see the row under construction.';

-- And this one is told only a portfolioId, for the tables that join through
-- Portfolio and never insert one.
CREATE OR REPLACE FUNCTION app_ca_may_see_portfolio(portfolio_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Portfolio" p
    JOIN "Client" c ON c."userId" = p."userId"
    WHERE p.id = portfolio_id
      AND c."advisorId" = app_current_user_id()
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom" <= now())
      AND (c."accessUntil" IS NULL OR c."accessUntil" >= now())
      AND (
        c."scopeAllPortfolios"
        OR EXISTS (
          SELECT 1 FROM "ClientPortfolioScope" s
          WHERE s."clientId" = c.id AND s."portfolioId" = p.id
        )
      )
  );
$$;

COMMENT ON FUNCTION app_ca_may_see_portfolio(TEXT) IS
  'RLS helper. True when the caller holds an in-window grant over the portfolio''s owner AND that grant covers this portfolio.';

-- The parameter is `wanted_category`, NOT `category`: "Client" has a column of
-- that name, and inside a SQL function body an unqualified reference resolves
-- to the column, not the parameter. Named `category`, this function silently
-- compared Client.category — null for most rows — against the allowlist, so
-- every narrowed grant denied everything.
CREATE OR REPLACE FUNCTION app_ca_may_see_category(owner_id TEXT, wanted_category TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND c."advisorId" = app_current_user_id()
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom" <= now())
      AND (c."accessUntil" IS NULL OR c."accessUntil" >= now())
      AND (c."scopeAllCategories" OR wanted_category = ANY(c."visibleCategories"))
  );
$$;

COMMENT ON FUNCTION app_ca_may_see_category(TEXT, TEXT) IS
  'RLS helper. True when the caller''s in-window grant over owner_id covers the given non-asset-class category (LOAN, CREDIT_CARD, RENTAL, ...).';

CREATE OR REPLACE FUNCTION app_ca_may_see_asset_class(owner_id TEXT, wanted_asset_class TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND c."advisorId" = app_current_user_id()
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom" <= now())
      AND (c."accessUntil" IS NULL OR c."accessUntil" >= now())
      AND (c."scopeAllAssetClasses" OR wanted_asset_class = ANY(c."visibleAssetClasses"::TEXT[]))
  );
$$;

COMMENT ON FUNCTION app_ca_may_see_asset_class(TEXT, TEXT) IS
  'RLS helper. True when the caller''s in-window grant over owner_id covers the given AssetClass.';

GRANT EXECUTE ON FUNCTION app_ca_grant_covers_portfolio(TEXT, TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_ca_may_see_portfolio(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_ca_may_see_category(TEXT, TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_ca_may_see_asset_class(TEXT, TEXT) TO portfolioos_app;

-- ─── Portfolio-keyed reads ───────────────────────────────────────────
--
-- These already reached the owner through a Portfolio join, so narrowing them
-- is a matter of asking about the portfolio instead of the person. The asset
-- class is asked about separately where the row carries one: a grant may cover
-- a portfolio and still not cover the equity inside it.

DROP POLICY IF EXISTS portfolio_ca_read ON "Portfolio";
CREATE POLICY portfolio_ca_read ON "Portfolio"
  FOR SELECT USING (
    app_is_system()
    OR app_ca_grant_covers_portfolio("Portfolio"."userId", "Portfolio".id)
  );

DROP POLICY IF EXISTS transaction_ca_read ON "Transaction";
CREATE POLICY transaction_ca_read ON "Transaction"
  FOR SELECT USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("Transaction"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "Transaction"."portfolioId"
          AND app_ca_may_see_asset_class(p."userId", "Transaction"."assetClass"::TEXT)
      )
    )
  );

-- UPDATE and INSERT stay two separate policies with their original commands.
-- Collapsing them into one FOR ALL would hand a CA DELETE as well, which no
-- policy has ever granted: a CA may add a trade and fix a trade, never erase
-- one. The scope checks are what changed here, not the command list.
DROP POLICY IF EXISTS transaction_ca_correct ON "Transaction";
CREATE POLICY transaction_ca_correct ON "Transaction"
  FOR UPDATE
  USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("Transaction"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "Transaction"."portfolioId"
          AND app_ca_may_see_asset_class(p."userId", "Transaction"."assetClass"::TEXT)
      )
    )
  )
  WITH CHECK (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("Transaction"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "Transaction"."portfolioId"
          AND app_ca_may_see_asset_class(p."userId", "Transaction"."assetClass"::TEXT)
      )
    )
  );

DROP POLICY IF EXISTS transaction_ca_insert ON "Transaction";
CREATE POLICY transaction_ca_insert ON "Transaction"
  FOR INSERT
  WITH CHECK (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("Transaction"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "Transaction"."portfolioId"
          AND app_ca_may_see_asset_class(p."userId", "Transaction"."assetClass"::TEXT)
      )
    )
  );

DROP POLICY IF EXISTS holdingprojection_ca_read ON "HoldingProjection";
CREATE POLICY holdingprojection_ca_read ON "HoldingProjection"
  FOR SELECT USING (
    app_is_system() OR app_ca_may_see_portfolio("HoldingProjection"."portfolioId")
  );

DROP POLICY IF EXISTS holdingprojection_ca_write ON "HoldingProjection";
CREATE POLICY holdingprojection_ca_write ON "HoldingProjection"
  FOR ALL USING (
    app_is_system() OR app_ca_may_see_portfolio("HoldingProjection"."portfolioId")
  )
  WITH CHECK (
    app_is_system() OR app_ca_may_see_portfolio("HoldingProjection"."portfolioId")
  );

DROP POLICY IF EXISTS capitalgain_ca_read ON "CapitalGain";
CREATE POLICY capitalgain_ca_read ON "CapitalGain"
  FOR SELECT USING (
    app_is_system() OR app_ca_may_see_portfolio("CapitalGain"."portfolioId")
  );

DROP POLICY IF EXISTS capitalgain_ca_write ON "CapitalGain";
CREATE POLICY capitalgain_ca_write ON "CapitalGain"
  FOR ALL USING (
    app_is_system() OR app_ca_may_see_portfolio("CapitalGain"."portfolioId")
  )
  WITH CHECK (
    app_is_system() OR app_ca_may_see_portfolio("CapitalGain"."portfolioId")
  );

DROP POLICY IF EXISTS cashflow_ca_read ON "CashFlow";
CREATE POLICY cashflow_ca_read ON "CashFlow"
  FOR SELECT USING (
    app_is_system() OR app_ca_may_see_portfolio("CashFlow"."portfolioId")
  );

-- ─── Category-keyed reads ────────────────────────────────────────────
--
-- Same rewrite for every table the categories name, generated rather than
-- typed out so the mapping lives in one list. A table owned directly by a user
-- asks about its own userId; a child asks about its parent's.

DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('BankAccount',      'BANK_ACCOUNT'),
      ('CreditCard',       'CREDIT_CARD'),
      ('Goal',             'GOAL'),
      ('InsurancePolicy',  'INSURANCE'),
      ('Loan',             'LOAN'),
      ('OwnedProperty',    'OWNED_PROPERTY'),
      ('RentalProperty',   'RENTAL'),
      ('Vehicle',          'VEHICLE')
    ) AS s(tbl, category)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', lower(spec.tbl) || '_ca_read', spec.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_is_system() OR app_ca_may_see_category("userId", %L))',
      lower(spec.tbl) || '_ca_read', spec.tbl, spec.category
    );
  END LOOP;
END $$;

DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('BankBalanceSnapshot', 'BankAccount',      'accountId', 'BANK_ACCOUNT'),
      ('Challan',             'Vehicle',          'vehicleId', 'VEHICLE'),
      ('CreditCardStatement', 'CreditCard',       'cardId',    'CREDIT_CARD'),
      ('InsuranceClaim',      'InsurancePolicy',  'policyId',  'INSURANCE'),
      ('LoanPayment',         'Loan',             'loanId',    'LOAN'),
      ('PremiumPayment',      'InsurancePolicy',  'policyId',  'INSURANCE'),
      ('PropertyExpense',     'RentalProperty',   'propertyId','RENTAL'),
      ('Tenancy',             'RentalProperty',   'propertyId','RENTAL')
    ) AS s(child, parent, fk, category)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', lower(spec.child) || '_ca_read', spec.child);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_is_system() OR EXISTS (
         SELECT 1 FROM %I p WHERE p.id = %I.%I AND app_ca_may_see_category(p."userId", %L)))',
      lower(spec.child) || '_ca_read', spec.child, spec.parent, spec.child, spec.fk, spec.category
    );
  END LOOP;
END $$;

-- RentReceipt and RentReminder are two hops from their owner, so the join is
-- spelled out in full — a policy cannot lean on another table's policy inside
-- its own EXISTS.

DROP POLICY IF EXISTS rentreceipt_ca_read ON "RentReceipt";
CREATE POLICY rentreceipt_ca_read ON "RentReceipt"
  FOR SELECT USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp.id = t."propertyId"
      WHERE t.id = "RentReceipt"."tenancyId"
        AND app_ca_may_see_category(rp."userId", 'RENTAL')
    )
  );

DROP POLICY IF EXISTS rentreminder_ca_read ON "RentReminder";
CREATE POLICY rentreminder_ca_read ON "RentReminder"
  FOR SELECT USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp.id = t."propertyId"
      WHERE t.id = "RentReminder"."tenancyId"
        AND app_ca_may_see_category(rp."userId", 'RENTAL')
    )
  );

-- Two more things a grant can have done to it, both by the client: narrowing
-- what it covers, and putting a revoked one back. Neither was expressible, so
-- neither could appear on the trail the client reads.
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'GRANT_SCOPE_CHANGED';
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'GRANT_REINSTATED';
