-- Portfolio grouping (family / household-style aggregation):
-- enable RLS so the new tables match the §3.6 invariant. PortfolioGroup
-- has a direct userId column. PortfolioGroupMember does not — it joins
-- back to PortfolioGroup, so the policy walks one hop.
--
-- Wrapped in DO blocks so this migration is safe on managed Postgres
-- (Neon) where the helper functions (created by 20260421140000_phase_4_5_rls)
-- may not exist if RLS was applied out-of-band.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_current_user_id') THEN
    EXECUTE 'ALTER TABLE "PortfolioGroup" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "PortfolioGroup" FORCE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY portfoliogroup_owner ON "PortfolioGroup"
      USING (app_is_system() OR "userId" = app_current_user_id())
      WITH CHECK (app_is_system() OR "userId" = app_current_user_id())';

    EXECUTE 'ALTER TABLE "PortfolioGroupMember" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "PortfolioGroupMember" FORCE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY portfoliogroupmember_owner ON "PortfolioGroupMember"
      USING (
        app_is_system() OR EXISTS (
          SELECT 1 FROM "PortfolioGroup" g
          WHERE g.id = "PortfolioGroupMember"."groupId"
            AND g."userId" = app_current_user_id()
        )
      )
      WITH CHECK (
        app_is_system() OR EXISTS (
          SELECT 1 FROM "PortfolioGroup" g
          WHERE g.id = "PortfolioGroupMember"."groupId"
            AND g."userId" = app_current_user_id()
        )
      )';
  END IF;
END
$do$;
