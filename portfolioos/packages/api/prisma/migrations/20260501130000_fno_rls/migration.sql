-- RLS for F&O tables. Pattern matches 20260421140000_phase_4_5_rls.

-- DerivativePosition has its own userId column.
ALTER TABLE "DerivativePosition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DerivativePosition" FORCE ROW LEVEL SECURITY;
CREATE POLICY derivativeposition_owner ON "DerivativePosition"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "BrokerCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerCredential" FORCE ROW LEVEL SECURITY;
CREATE POLICY brokercred_owner ON "BrokerCredential"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "MarginSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarginSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY margin_owner ON "MarginSnapshot"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- ExpiryCloseJob is portfolio-scoped: join Portfolio → owner.
ALTER TABLE "ExpiryCloseJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpiryCloseJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY expirycj_owner ON "ExpiryCloseJob"
  USING (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "Portfolio" p
       WHERE p."id" = "ExpiryCloseJob"."portfolioId"
         AND p."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "Portfolio" p
       WHERE p."id" = "ExpiryCloseJob"."portfolioId"
         AND p."userId" = app_current_user_id()
    )
  );

ALTER TABLE "PortfolioSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY portfoliosetting_owner ON "PortfolioSetting"
  USING (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "Portfolio" p
       WHERE p."id" = "PortfolioSetting"."portfolioId"
         AND p."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system() OR EXISTS (
      SELECT 1 FROM "Portfolio" p
       WHERE p."id" = "PortfolioSetting"."portfolioId"
         AND p."userId" = app_current_user_id()
    )
  );

-- FoInstrument and FoContractPrice are SHARED reference tables (not user-
-- scoped) — every user reads the same NSE master/EOD prices. No RLS needed.
