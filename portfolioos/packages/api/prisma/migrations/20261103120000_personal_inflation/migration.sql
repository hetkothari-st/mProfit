-- Personal inflation: MoSPI CPI reference table + user basket.
--
-- CpiObservation is GLOBAL reference data (same class as RiskFreeRate):
-- no userId, no RLS, not in USER_SCOPED_MODELS. Guarded by
-- test/invariants/cpi-reference-not-user-scoped.test.ts.
-- The three Inflation* tables are user-scoped: owner policies below, and
-- registered in USER_SCOPED_MODELS (src/lib/prisma.ts) in the same change.

-- CreateEnum
CREATE TYPE "CpiSector" AS ENUM ('RURAL', 'URBAN', 'COMBINED');

-- CreateEnum
CREATE TYPE "InflationRateMode" AS ENUM ('OFFICIAL', 'CUSTOM', 'HISTORY');

-- CreateEnum
CREATE TYPE "InflationAmountFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "CpiObservation" (
    "id" TEXT NOT NULL,
    "baseYear" INTEGER NOT NULL,
    "stateCode" INTEGER NOT NULL,
    "sector" "CpiSector" NOT NULL,
    "divisionCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "indexValue" DECIMAL(12,2),
    "inflationPct" DECIMAL(8,2) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CpiObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InflationProfile" (
    "userId" TEXT NOT NULL,
    "stateCode" INTEGER NOT NULL DEFAULT 1,
    "sector" "CpiSector" NOT NULL DEFAULT 'COMBINED',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InflationProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "InflationBasketItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "divisionCode" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "frequency" "InflationAmountFrequency" NOT NULL DEFAULT 'YEARLY',
    "rateMode" "InflationRateMode" NOT NULL DEFAULT 'OFFICIAL',
    "customRate" DECIMAL(6,4),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InflationBasketItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InflationPricePoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InflationPricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CpiObservation_stateCode_sector_month_year_idx" ON "CpiObservation"("stateCode", "sector", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "CpiObservation_baseYear_stateCode_sector_divisionCode_year__key" ON "CpiObservation"("baseYear", "stateCode", "sector", "divisionCode", "year", "month");

-- CreateIndex
CREATE INDEX "InflationBasketItem_userId_idx" ON "InflationBasketItem"("userId");

-- CreateIndex
CREATE INDEX "InflationPricePoint_userId_idx" ON "InflationPricePoint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InflationPricePoint_itemId_asOf_key" ON "InflationPricePoint"("itemId", "asOf");

-- AddForeignKey
ALTER TABLE "InflationProfile" ADD CONSTRAINT "InflationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InflationBasketItem" ADD CONSTRAINT "InflationBasketItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InflationPricePoint" ADD CONSTRAINT "InflationPricePoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InflationPricePoint" ADD CONSTRAINT "InflationPricePoint_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InflationBasketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: owner-only on the user-scoped tables (direct userId column on each).
ALTER TABLE "InflationProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InflationProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY inflationprofile_owner ON "InflationProfile"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "InflationBasketItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InflationBasketItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY inflationbasketitem_owner ON "InflationBasketItem"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "InflationPricePoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InflationPricePoint" FORCE ROW LEVEL SECURITY;
CREATE POLICY inflationpricepoint_owner ON "InflationPricePoint"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- Explicit grants. Default privileges from 20260421150000 only cover tables
-- created by the role that ran that migration.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "CpiObservation", "InflationProfile", "InflationBasketItem", "InflationPricePoint" TO portfolioos_app';
  END IF;
END
$do$;
