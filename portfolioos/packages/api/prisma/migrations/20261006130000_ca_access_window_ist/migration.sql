-- F1: a CA grant's "Until <date>" closed at 00:00 UTC — 05:30 IST on the
-- last day — and "From <date>" opened at 05:30 IST on the first. The dates
-- are stored as calendar dates (midnight UTC of the picked day), so compare
-- them as dates against today's date in India instead of against now().
--
-- Each function below is its latest definition with only that clause changed.

CREATE OR REPLACE FUNCTION app_ist_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
$$;
GRANT EXECUTE ON FUNCTION app_ist_today() TO portfolioos_app;

-- from 20260923090000_ca_grant_scope
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
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
  );
$$;

-- from 20260923090000_ca_grant_scope
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
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND (
        c."scopeAllPortfolios"
        OR EXISTS (
          SELECT 1 FROM "ClientPortfolioScope" s
          WHERE s."clientId" = c.id AND s."portfolioId" = portfolio_id
        )
      )
  );
$$;

-- from 20260923090000_ca_grant_scope
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
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND (
        c."scopeAllPortfolios"
        OR EXISTS (
          SELECT 1 FROM "ClientPortfolioScope" s
          WHERE s."clientId" = c.id AND s."portfolioId" = p.id
        )
      )
  );
$$;

-- from 20260923090000_ca_grant_scope
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
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND (c."scopeAllCategories" OR wanted_category = ANY(c."visibleCategories"))
  );
$$;

-- from 20260924120000_ca_edit_rights
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
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND CASE wanted_section
            WHEN 'BOOKS'        THEN c."canEditBooks"
            WHEN 'TRANSACTIONS' THEN c."canEditTransactions"
            WHEN 'IMPORTS'      THEN c."canEditImports"
            WHEN 'FMV'          THEN c."canEditFmv"
            ELSE false
          END
  );
$$;

-- from 20261006110000_ca_asset_class_derived_tables
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
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND c."scopeAllAssetClasses"
  );
$$;
