-- Recurring payments, one-offs, refunds and monthly spend per category
-- (PIR pipeline step 5). Additive only.

ALTER TABLE "SpendTxn" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "SpendTxn" ADD COLUMN "isOneOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SpendTxn" ADD COLUMN "refundOfId" TEXT;

ALTER TABLE "InflationBasketItem" ADD COLUMN "matchedSeriesId" TEXT;
ALTER TABLE "InflationBasketItem" ADD COLUMN "countAnyway" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SpendRecurringSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payeeKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "firstSeen" DATE NOT NULL,
    "lastSeen" DATE NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "latestAmount" DECIMAL(14,2) NOT NULL,
    "isFixed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SpendRecurringSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpendRecurringSeries_userId_payeeKey_cadence_key" ON "SpendRecurringSeries"("userId", "payeeKey", "cadence");
ALTER TABLE "SpendRecurringSeries" ADD CONSTRAINT "SpendRecurringSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpendMonthlyCategory" (
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "oneOffAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "txnCount" INTEGER NOT NULL,
    CONSTRAINT "SpendMonthlyCategory_pkey" PRIMARY KEY ("userId", "month", "category")
);
ALTER TABLE "SpendMonthlyCategory" ADD CONSTRAINT "SpendMonthlyCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpendRecurringSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpendRecurringSeries" FORCE ROW LEVEL SECURITY;
CREATE POLICY spendrecurringseries_owner ON "SpendRecurringSeries"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "SpendMonthlyCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpendMonthlyCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY spendmonthlycategory_owner ON "SpendMonthlyCategory"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "SpendRecurringSeries", "SpendMonthlyCategory" TO portfolioos_app';
  END IF;
END
$do$;
