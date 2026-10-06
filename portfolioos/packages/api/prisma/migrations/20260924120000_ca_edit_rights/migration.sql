-- What a professional may CHANGE, as opposed to see.
--
-- Until now the two came together: an active grant could post vouchers,
-- rewrite transactions, upload statements and set fair market values. For most
-- people bringing in an accountant that is more than they mean. "Look at my
-- tax position" and "rewrite my ledger" are different requests, and only one
-- of them was on offer.
--
-- Four switches rather than one, because the write surfaces are genuinely
-- different jobs: keeping books, correcting the trade record, importing
-- statements, and setting section 55(2)(ac) values. The screen offers one
-- switch and hides the four behind Advanced; the database knows only the four,
-- so a later screen can group them differently without the enforcement moving.
--
-- New grants default to view-only. EXISTING grants are backfilled to true:
-- they already had these rights, and a migration is not the place to withdraw
-- something a client agreed to, silently, from under their accountant
-- mid-filing.

ALTER TABLE "Client"
  ADD COLUMN "canEditBooks" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canEditTransactions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canEditImports" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canEditFmv" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Client"
   SET "canEditBooks" = true,
       "canEditTransactions" = true,
       "canEditImports" = true,
       "canEditFmv" = true
 WHERE "status" <> 'REVOKED';

-- The helper.
--
-- The parameter is `wanted_section`, not `section`. "Client" has no column of
-- that name today, but app_ca_may_see_category was written with a parameter
-- called `category`, silently compared the COLUMN of that name, and denied
-- everything. Once bitten.

CREATE OR REPLACE FUNCTION app_ca_may_edit(owner_id TEXT, wanted_section TEXT)
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
      AND CASE wanted_section
            WHEN 'BOOKS'        THEN c."canEditBooks"
            WHEN 'TRANSACTIONS' THEN c."canEditTransactions"
            WHEN 'IMPORTS'      THEN c."canEditImports"
            WHEN 'FMV'          THEN c."canEditFmv"
            ELSE false
          END
  );
$$;

COMMENT ON FUNCTION app_ca_may_edit(TEXT, TEXT) IS
  'RLS helper. True when the caller holds an ACTIVE, in-window grant over owner_id permitting changes in the named section (BOOKS, TRANSACTIONS, IMPORTS, FMV). Reading is a separate question, answered by app_is_active_ca_for.';

GRANT EXECUTE ON FUNCTION app_ca_may_edit(TEXT, TEXT) TO portfolioos_app;

-- Splitting read from write.
--
-- These tables carried ONE policy with no FOR clause, which in Postgres means
-- ALL: the same expression decided both reading and writing. They are now two,
-- and only the write half consults the switches.

DROP POLICY IF EXISTS account_ca_access ON "Account";
CREATE POLICY account_ca_read ON "Account"
  FOR SELECT USING (app_is_system() OR app_is_active_ca_for("userId"));
CREATE POLICY account_ca_write ON "Account"
  FOR ALL
  USING (app_is_system() OR app_ca_may_edit("userId", 'BOOKS'))
  WITH CHECK (app_is_system() OR app_ca_may_edit("userId", 'BOOKS'));

DROP POLICY IF EXISTS voucher_ca_access ON "Voucher";
CREATE POLICY voucher_ca_read ON "Voucher"
  FOR SELECT USING (app_is_system() OR app_is_active_ca_for("userId"));
CREATE POLICY voucher_ca_write ON "Voucher"
  FOR ALL
  USING (app_is_system() OR app_ca_may_edit("userId", 'BOOKS'))
  WITH CHECK (app_is_system() OR app_ca_may_edit("userId", 'BOOKS'));

DROP POLICY IF EXISTS voucherentry_ca_access ON "VoucherEntry";
CREATE POLICY voucherentry_ca_read ON "VoucherEntry"
  FOR SELECT USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Voucher" v
      WHERE v.id = "VoucherEntry"."voucherId" AND app_is_active_ca_for(v."userId")
    )
  );
CREATE POLICY voucherentry_ca_write ON "VoucherEntry"
  FOR ALL
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Voucher" v
      WHERE v.id = "VoucherEntry"."voucherId" AND app_ca_may_edit(v."userId", 'BOOKS')
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Voucher" v
      WHERE v.id = "VoucherEntry"."voucherId" AND app_ca_may_edit(v."userId", 'BOOKS')
    )
  );

DROP POLICY IF EXISTS fmvoverride_ca_access ON "FmvOverride";
CREATE POLICY fmvoverride_ca_read ON "FmvOverride"
  FOR SELECT USING (app_is_system() OR app_is_active_ca_for("userId"));
CREATE POLICY fmvoverride_ca_write ON "FmvOverride"
  FOR ALL
  USING (app_is_system() OR app_ca_may_edit("userId", 'FMV'))
  WITH CHECK (app_is_system() OR app_ca_may_edit("userId", 'FMV'));

-- The write policies that were already separate.
--
-- Transaction keeps its two commands apart, for the reason stated when they
-- were nearly collapsed into one: there is no DELETE policy for a CA, and a
-- FOR ALL anywhere here would quietly create one. The scope checks added in
-- 20260923090000 are preserved and the edit switch is ANDed onto them.

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
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
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
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
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
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
      )
    )
  );

-- The derived tables follow the transaction right: a correction rebuilds them,
-- so permitting the correction is permitting the rebuild. Nothing else writes
-- them under a professional's identity.

DROP POLICY IF EXISTS holdingprojection_ca_write ON "HoldingProjection";
CREATE POLICY holdingprojection_ca_write ON "HoldingProjection"
  FOR ALL
  USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("HoldingProjection"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "HoldingProjection"."portfolioId"
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
      )
    )
  )
  WITH CHECK (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("HoldingProjection"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "HoldingProjection"."portfolioId"
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
      )
    )
  );

DROP POLICY IF EXISTS capitalgain_ca_write ON "CapitalGain";
CREATE POLICY capitalgain_ca_write ON "CapitalGain"
  FOR ALL
  USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("CapitalGain"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "CapitalGain"."portfolioId"
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
      )
    )
  )
  WITH CHECK (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("CapitalGain"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "CapitalGain"."portfolioId"
          AND app_ca_may_edit(p."userId", 'TRANSACTIONS')
      )
    )
  );

DROP POLICY IF EXISTS importjob_ca_insert ON "ImportJob";
CREATE POLICY importjob_ca_insert ON "ImportJob"
  FOR INSERT
  WITH CHECK (app_is_system() OR app_ca_may_edit("userId", 'IMPORTS'));

-- Bootstrapping a client's first portfolio is what makes their first trade
-- possible, so it follows the transaction right rather than standing alone.
DROP POLICY IF EXISTS portfolio_ca_bootstrap_insert ON "Portfolio";
CREATE POLICY portfolio_ca_bootstrap_insert ON "Portfolio"
  FOR INSERT
  WITH CHECK (
    app_is_system()
    OR (
      app_ca_may_edit("userId", 'TRANSACTIONS')
      AND app_ca_client_has_no_portfolio("userId")
    )
  );
