-- F&O (Futures & Options) — Phase 5 schema additions.
-- Adds master + price + position + lifecycle tables; extends enums; adds
-- Portfolio.defaultEquityTaxTreatment + Transaction.equityTaxOverride;
-- backfills assetKey for existing FUTURES/OPTIONS rows under the new
-- "fno:<underlying>:<FUT|CE|PE>:<strike6>:<expiry>" precedence.

-- ─── enums ──────────────────────────────────────────────────────────

CREATE TYPE "FoInstrumentType" AS ENUM ('FUTURES', 'CALL', 'PUT');

CREATE TYPE "DerivativePositionStatus" AS ENUM (
  'OPEN', 'CLOSED', 'PENDING_EXPIRY_APPROVAL', 'EXPIRED_WORTHLESS', 'EXERCISED'
);

CREATE TYPE "DerivativeCloseReason" AS ENUM (
  'TRADED_OUT', 'EXPIRY', 'EXERCISE', 'ASSIGNMENT', 'ROLLOVER'
);

CREATE TYPE "ExpiryCloseStatus" AS ENUM (
  'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'
);

CREATE TYPE "EquityTaxTreatment" AS ENUM ('CAPITAL_GAINS', 'BUSINESS_INCOME');

-- AlertType extensions
ALTER TYPE "AlertType" ADD VALUE 'FO_EXPIRY_TODAY';
ALTER TYPE "AlertType" ADD VALUE 'FO_EXPIRY_SOON';
ALTER TYPE "AlertType" ADD VALUE 'FO_MARGIN_CALL';

-- CanonicalEventType extensions
ALTER TYPE "CanonicalEventType" ADD VALUE 'FNO_TRADE';
ALTER TYPE "CanonicalEventType" ADD VALUE 'FNO_EXPIRY_CLOSE';
ALTER TYPE "CanonicalEventType" ADD VALUE 'FNO_EXERCISE';
ALTER TYPE "CanonicalEventType" ADD VALUE 'FNO_ASSIGNMENT';
ALTER TYPE "CanonicalEventType" ADD VALUE 'FNO_ROLLOVER';

-- ─── Portfolio + Transaction column additions ───────────────────────

ALTER TABLE "Portfolio"
  ADD COLUMN "defaultEquityTaxTreatment" "EquityTaxTreatment" NOT NULL DEFAULT 'CAPITAL_GAINS';

ALTER TABLE "Transaction"
  ADD COLUMN "equityTaxOverride" "EquityTaxTreatment";

-- ─── FoInstrument ───────────────────────────────────────────────────

CREATE TABLE "FoInstrument" (
  "id"                 TEXT PRIMARY KEY,
  "symbol"             TEXT NOT NULL,
  "underlying"         TEXT NOT NULL,
  "instrumentType"     "FoInstrumentType" NOT NULL,
  "strikePrice"        DECIMAL(12,2),
  "expiryDate"         DATE NOT NULL,
  "lotSize"            INTEGER NOT NULL,
  "tickSize"           DECIMAL(8,4) NOT NULL,
  "contractMultiplier" DECIMAL(8,4) NOT NULL DEFAULT 1,
  "settlementType"     TEXT NOT NULL,
  "isinCode"           TEXT,
  "exchangeToken"      TEXT,
  "tradingSymbol"      TEXT NOT NULL UNIQUE,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "exchange"           "Exchange" NOT NULL DEFAULT 'NFO',
  "lastUpdated"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FoInstrument_underlying_expiry_type_idx"
  ON "FoInstrument" ("underlying", "expiryDate", "instrumentType");
CREATE INDEX "FoInstrument_symbol_expiry_idx"
  ON "FoInstrument" ("symbol", "expiryDate");

-- ─── FoContractPrice ────────────────────────────────────────────────

CREATE TABLE "FoContractPrice" (
  "id"                TEXT PRIMARY KEY,
  "instrumentId"      TEXT NOT NULL REFERENCES "FoInstrument"("id") ON DELETE CASCADE,
  "tradeDate"         DATE NOT NULL,
  "openPrice"         DECIMAL(12,4) NOT NULL,
  "highPrice"         DECIMAL(12,4) NOT NULL,
  "lowPrice"          DECIMAL(12,4) NOT NULL,
  "closePrice"        DECIMAL(12,4) NOT NULL,
  "settlementPrice"   DECIMAL(12,4) NOT NULL,
  "openInterest"      DECIMAL(18,0) NOT NULL,
  "volume"            DECIMAL(18,0) NOT NULL,
  "impliedVolatility" DECIMAL(8,6),
  "delta"             DECIMAL(8,6),
  "gamma"             DECIMAL(10,8),
  "theta"             DECIMAL(10,6),
  "vega"              DECIMAL(8,6)
);

CREATE UNIQUE INDEX "FoContractPrice_instrument_date_uniq"
  ON "FoContractPrice" ("instrumentId", "tradeDate");
CREATE INDEX "FoContractPrice_tradeDate_idx" ON "FoContractPrice" ("tradeDate");

-- ─── DerivativePosition ────────────────────────────────────────────

CREATE TABLE "DerivativePosition" (
  "id"              TEXT PRIMARY KEY,
  "portfolioId"     TEXT NOT NULL REFERENCES "Portfolio"("id") ON DELETE CASCADE,
  "userId"          TEXT NOT NULL,
  "assetKey"        TEXT NOT NULL,
  "underlying"      TEXT NOT NULL,
  "instrumentType"  "FoInstrumentType" NOT NULL,
  "strikePrice"     DECIMAL(12,2),
  "expiryDate"      DATE NOT NULL,
  "lotSize"         INTEGER NOT NULL,
  "status"          "DerivativePositionStatus" NOT NULL DEFAULT 'OPEN',
  "netQuantity"     DECIMAL(18,6) NOT NULL,
  "openLots"        JSONB NOT NULL,
  "avgEntryPrice"   DECIMAL(12,4) NOT NULL,
  "totalCost"       DECIMAL(18,4) NOT NULL,
  "realizedPnl"     DECIMAL(18,4) NOT NULL DEFAULT 0,
  "unrealizedPnl"   DECIMAL(18,4),
  "mtmPrice"        DECIMAL(12,4),
  "closedAt"        TIMESTAMP(3),
  "closeReason"     "DerivativeCloseReason",
  "settlementPrice" DECIMAL(12,4),
  "computedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DerivativePosition_portfolio_assetKey_uniq"
  ON "DerivativePosition" ("portfolioId", "assetKey");
CREATE INDEX "DerivativePosition_portfolio_status_expiry_idx"
  ON "DerivativePosition" ("portfolioId", "status", "expiryDate");
CREATE INDEX "DerivativePosition_user_status_idx"
  ON "DerivativePosition" ("userId", "status");

-- ─── BrokerCredential ──────────────────────────────────────────────

CREATE TABLE "BrokerCredential" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "brokerId"       TEXT NOT NULL,
  "apiKey"         TEXT NOT NULL,
  "accessToken"    TEXT NOT NULL,
  "refreshToken"   TEXT,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
  "lastSyncedAt"   TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "BrokerCredential_user_broker_uniq"
  ON "BrokerCredential" ("userId", "brokerId");
CREATE INDEX "BrokerCredential_user_active_idx"
  ON "BrokerCredential" ("userId", "isActive");

-- ─── MarginSnapshot ────────────────────────────────────────────────

CREATE TABLE "MarginSnapshot" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "portfolioId"      TEXT NOT NULL,
  "positionId"       TEXT REFERENCES "DerivativePosition"("id") ON DELETE SET NULL,
  "snapshotDate"     DATE NOT NULL,
  "spanMargin"       DECIMAL(18,4) NOT NULL,
  "exposureMargin"   DECIMAL(18,4) NOT NULL,
  "totalRequired"    DECIMAL(18,4) NOT NULL,
  "availableBalance" DECIMAL(18,4) NOT NULL,
  "utilizationPct"   DECIMAL(6,4) NOT NULL,
  "source"           TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MarginSnapshot_user_date_idx" ON "MarginSnapshot" ("userId", "snapshotDate");
CREATE INDEX "MarginSnapshot_portfolio_date_idx" ON "MarginSnapshot" ("portfolioId", "snapshotDate");

-- ─── ExpiryCloseJob ────────────────────────────────────────────────

CREATE TABLE "ExpiryCloseJob" (
  "id"               TEXT PRIMARY KEY,
  "portfolioId"      TEXT NOT NULL REFERENCES "Portfolio"("id") ON DELETE CASCADE,
  "positionId"       TEXT NOT NULL,
  "assetKey"         TEXT NOT NULL,
  "expiryDate"       DATE NOT NULL,
  "openQty"          DECIMAL(18,6) NOT NULL,
  "settlementPrice"  DECIMAL(18,4),
  "status"           "ExpiryCloseStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "canonicalEventId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"       TIMESTAMP(3)
);

CREATE INDEX "ExpiryCloseJob_portfolio_status_idx" ON "ExpiryCloseJob" ("portfolioId", "status");
CREATE INDEX "ExpiryCloseJob_expiry_status_idx" ON "ExpiryCloseJob" ("expiryDate", "status");

-- ─── PortfolioSetting ──────────────────────────────────────────────

CREATE TABLE "PortfolioSetting" (
  "portfolioId"               TEXT PRIMARY KEY REFERENCES "Portfolio"("id") ON DELETE CASCADE,
  "autoApproveExpiryClose"    BOOLEAN NOT NULL DEFAULT FALSE,
  "defaultBrokerCredentialId" TEXT,
  "updatedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── assetKey backfill for existing F&O Transaction rows ────────────
--
-- Old precedence collapsed all options on the same underlying into one
-- HoldingProjection row. New scheme:
--   fno:<UPPER(underlying)>:<FUT|CE|PE>:<strike padded 6>:<YYYY-MM-DD>
-- This UPDATE only touches rows where the new key would differ from the
-- current one, so it's idempotent and safe to re-run.

UPDATE "Transaction" t
   SET "assetKey" = 'fno:' || UPPER(COALESCE(NULLIF(t."assetName", ''), s."symbol", 'UNKNOWN')) || ':'
                    || CASE
                         WHEN t."assetClass" = 'FUTURES' THEN 'FUT'
                         WHEN t."optionType" = 'CALL' THEN 'CE'
                         WHEN t."optionType" = 'PUT'  THEN 'PE'
                         ELSE 'FUT'
                       END || ':'
                    || LPAD(
                         CASE
                           WHEN t."assetClass" = 'FUTURES' THEN '0'
                           ELSE COALESCE(t."strikePrice"::TEXT, '0')
                         END,
                         6, '0')
                    || ':' || TO_CHAR(t."expiryDate", 'YYYY-MM-DD')
  FROM "StockMaster" s
 WHERE t."stockId" = s."id"
   AND t."assetClass" IN ('FUTURES', 'OPTIONS')
   AND t."expiryDate" IS NOT NULL;

-- Cleanup HoldingProjection rows for now-changed F&O assetKeys; recompute
-- via DerivativePosition.service. The equity HoldingProjection should
-- never carry F&O rows.
DELETE FROM "HoldingProjection"
 WHERE "assetClass" IN ('FUTURES', 'OPTIONS');
