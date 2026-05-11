-- Forex feature: foreign currency cash, FX pair trading, foreign equities, LRS/TCS tracking.
--
-- Additive only: new enum values, nullable columns on Transaction/CashFlow,
-- three new tables. Existing INR-only rows remain valid (currency NULL ⇒ INR).

-- 1. AssetClass enum extensions
ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'FOREIGN_EQUITY';
ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'FOREX_PAIR';

-- 2. Transaction columns
ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "currency"      TEXT,
  ADD COLUMN IF NOT EXISTS "fxRateAtTrade" DECIMAL(18, 6),
  ADD COLUMN IF NOT EXISTS "inrEquivalent" DECIMAL(18, 4);

-- 3. CashFlow columns
ALTER TABLE "CashFlow"
  ADD COLUMN IF NOT EXISTS "currency"      TEXT,
  ADD COLUMN IF NOT EXISTS "inrEquivalent" DECIMAL(18, 4);

-- 4. ForexBalance — standalone foreign cash holdings (not in HoldingProjection).
CREATE TABLE "ForexBalance" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL,
  "portfolioId"      TEXT,
  "currency"         TEXT NOT NULL,
  "balance"          DECIMAL(18, 4) NOT NULL,
  "accountLabel"     TEXT,
  "accountNumberEnc" TEXT,
  "accountLast4"     TEXT,
  "bankName"         TEXT,
  "country"          TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForexBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ForexBalance_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ForexBalance_userId_currency_accountLabel_key"
  ON "ForexBalance"("userId", "currency", "accountLabel");
CREATE INDEX "ForexBalance_userId_idx" ON "ForexBalance"("userId");

-- 5. LrsRemittance — outward remittance ledger.
CREATE TABLE "LrsRemittance" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "portfolioId"    TEXT,
  "remittanceDate" DATE NOT NULL,
  "currency"       TEXT NOT NULL,
  "foreignAmount"  DECIMAL(18, 4) NOT NULL,
  "inrEquivalent"  DECIMAL(18, 4) NOT NULL,
  "fxRate"         DECIMAL(18, 6) NOT NULL,
  "purpose"        TEXT NOT NULL,
  "bankName"       TEXT,
  "remittanceRef"  TEXT,
  "tcsDeducted"    DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "tcsCreditId"    TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LrsRemittance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LrsRemittance_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LrsRemittance_userId_remittanceDate_idx" ON "LrsRemittance"("userId", "remittanceDate");

-- 6. TcsCredit — 20% TCS collected at source on LRS > ₹7L; claimed via Form 26AS.
CREATE TABLE "TcsCredit" (
  "id"            TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "tcsAmount"     DECIMAL(18, 4) NOT NULL,
  "usedAmount"    DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "tan"           TEXT,
  "collectorName" TEXT,
  "form27eqRef"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TcsCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TcsCredit_userId_financialYear_idx" ON "TcsCredit"("userId", "financialYear");

-- LrsRemittance → TcsCredit FK added after both tables exist.
ALTER TABLE "LrsRemittance"
  ADD CONSTRAINT "LrsRemittance_tcsCreditId_fkey"
  FOREIGN KEY ("tcsCreditId") REFERENCES "TcsCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. RLS — same pattern as 20260421140000_phase_4_5_rls.
ALTER TABLE "ForexBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ForexBalance" FORCE ROW LEVEL SECURITY;
CREATE POLICY forexbalance_owner ON "ForexBalance"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "LrsRemittance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LrsRemittance" FORCE ROW LEVEL SECURITY;
CREATE POLICY lrsremittance_owner ON "LrsRemittance"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "TcsCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TcsCredit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tcscredit_owner ON "TcsCredit"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- 8. Grant runtime role read/write — mirrors 20260421150000_phase_4_5_rls_app_role pattern.
GRANT SELECT, INSERT, UPDATE, DELETE ON "ForexBalance"  TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LrsRemittance" TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TcsCredit"     TO portfolioos_app;
