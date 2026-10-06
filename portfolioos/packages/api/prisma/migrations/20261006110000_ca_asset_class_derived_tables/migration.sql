-- A CA grant narrowed by asset class now narrows the derived tables too.
--
-- 20260923090000_ca_grant_scope added the asset-class check to Transaction but
-- left HoldingProjection, CapitalGain and CashFlow checking the portfolio
-- only. Those tables are what a CA's report downloads read — under the CA's
-- own identity, so these policies are the only thing between the grant and
-- the file. A client who limited their CA to mutual funds had their equity
-- holdings and gains in the CA's holdings and capital-gains reports.
--
-- The *_ca_write policies are FOR ALL, and a FOR ALL policy's USING clause
-- also grants SELECT. They get the same check, or a CA holding the
-- transaction edit right would still read every class through them.
--
-- CashFlow rows carry no asset class, so a class-narrowed grant cannot say
-- which of them it covers. They are withheld unless the grant covers every
-- class — the same fail-closed answer the family reports give a capped member.

CREATE OR REPLACE FUNCTION app_ca_covers_all_asset_classes(owner_id TEXT)
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
      AND c."scopeAllAssetClasses"
  );
$$;

COMMENT ON FUNCTION app_ca_covers_all_asset_classes(TEXT) IS
  'RLS helper. True when the caller''s in-window grant over owner_id is not narrowed by asset class. Gates rows that carry no asset class (CashFlow).';

GRANT EXECUTE ON FUNCTION app_ca_covers_all_asset_classes(TEXT) TO portfolioos_app;

-- ─── HoldingProjection ───────────────────────────────────────────────

DROP POLICY IF EXISTS holdingprojection_ca_read ON "HoldingProjection";
CREATE POLICY holdingprojection_ca_read ON "HoldingProjection"
  FOR SELECT USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("HoldingProjection"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "HoldingProjection"."portfolioId"
          AND app_ca_may_see_asset_class(p."userId", "HoldingProjection"."assetClass"::TEXT)
      )
    )
  );

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
          AND app_ca_may_see_asset_class(p."userId", "HoldingProjection"."assetClass"::TEXT)
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
          AND app_ca_may_see_asset_class(p."userId", "HoldingProjection"."assetClass"::TEXT)
      )
    )
  );

-- ─── CapitalGain ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS capitalgain_ca_read ON "CapitalGain";
CREATE POLICY capitalgain_ca_read ON "CapitalGain"
  FOR SELECT USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("CapitalGain"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "CapitalGain"."portfolioId"
          AND app_ca_may_see_asset_class(p."userId", "CapitalGain"."assetClass"::TEXT)
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
          AND app_ca_may_see_asset_class(p."userId", "CapitalGain"."assetClass"::TEXT)
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
          AND app_ca_may_see_asset_class(p."userId", "CapitalGain"."assetClass"::TEXT)
      )
    )
  );

-- ─── CashFlow ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS cashflow_ca_read ON "CashFlow";
CREATE POLICY cashflow_ca_read ON "CashFlow"
  FOR SELECT USING (
    app_is_system()
    OR (
      app_ca_may_see_portfolio("CashFlow"."portfolioId")
      AND EXISTS (
        SELECT 1 FROM "Portfolio" p
        WHERE p.id = "CashFlow"."portfolioId"
          AND app_ca_covers_all_asset_classes(p."userId")
      )
    )
  );
