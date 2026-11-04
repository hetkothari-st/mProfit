-- Safe-to-Invest: a SIP sized on lean-month income. The amount is computed on
-- read from bank-alert events; these tables only hold the user's corrections
-- and saved plan. Additive only.

-- Personal Inflation expenses can be marked as fixed monthly costs.
ALTER TABLE "InflationBasketItem" ADD COLUMN "isFixed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SafeToInvestPlan" (
    "userId" TEXT NOT NULL,
    "topUpShare" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
    "bufferOverride" DECIMAL(14,2),
    "savedAmount" DECIMAL(14,2),
    "savedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SafeToInvestPlan_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "SafeToInvestMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "inflow" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SafeToInvestMonth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SafeToInvestCreditDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalEventId" TEXT NOT NULL,
    "include" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SafeToInvestCreditDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SafeToInvestMonth_userId_month_key" ON "SafeToInvestMonth"("userId", "month");
CREATE UNIQUE INDEX "SafeToInvestCreditDecision_userId_canonicalEventId_key" ON "SafeToInvestCreditDecision"("userId", "canonicalEventId");

ALTER TABLE "SafeToInvestPlan" ADD CONSTRAINT "SafeToInvestPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SafeToInvestMonth" ADD CONSTRAINT "SafeToInvestMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SafeToInvestCreditDecision" ADD CONSTRAINT "SafeToInvestCreditDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: each user sees only their own rows.
ALTER TABLE "SafeToInvestPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafeToInvestPlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY safetoinvestplan_owner ON "SafeToInvestPlan"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "SafeToInvestMonth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafeToInvestMonth" FORCE ROW LEVEL SECURITY;
CREATE POLICY safetoinvestmonth_owner ON "SafeToInvestMonth"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "SafeToInvestCreditDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafeToInvestCreditDecision" FORCE ROW LEVEL SECURITY;
CREATE POLICY safetoinvestcreditdecision_owner ON "SafeToInvestCreditDecision"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "SafeToInvestPlan", "SafeToInvestMonth", "SafeToInvestCreditDecision" TO portfolioos_app';
  END IF;
END
$do$;
