-- FmvOverride carries per-user data (userId FK) and was added after the
-- §3.6 RLS sweep in 20260421140000_phase_4_5_rls — bring it into line.
-- SystemFmvSeed is intentionally excluded: no userId column, shared
-- reference data seeded by scripts/seedFmv.ts.

ALTER TABLE "FmvOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FmvOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY fmvoverride_owner ON "FmvOverride"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
