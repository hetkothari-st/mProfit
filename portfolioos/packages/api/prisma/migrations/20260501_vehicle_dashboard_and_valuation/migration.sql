-- Vehicle dashboard expansion + valuation feature schema
-- Additive only: 10 nullable cols on Vehicle + 4 new tables.

-- ─── Vehicle: surface fields previously buried in metadata JSON + photo ──
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "rcStatus" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "vehicleClass" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "normsType" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "seatingCapacity" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "unloadedWeight" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "engineNo" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "hypothecation" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "registrationDate" DATE;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "photoSource" TEXT;

-- ─── VehiclePhotoSeed: stock photos keyed by (make, model) ──
CREATE TABLE IF NOT EXISTS "VehiclePhotoSeed" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "make"              TEXT NOT NULL,
  "model"             TEXT NOT NULL,
  "variant"           TEXT,
  "bodyType"          TEXT,
  "photoUrl"          TEXT NOT NULL,
  "sourceAttribution" TEXT NOT NULL DEFAULT 'carDekho',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehiclePhotoSeed_make_model_variant_key"
  ON "VehiclePhotoSeed"("make","model","variant");
CREATE INDEX IF NOT EXISTS "VehiclePhotoSeed_make_model_idx"
  ON "VehiclePhotoSeed"("make","model");

-- ─── VehicleCatalog: shared make/model/year/trim master ──
CREATE TABLE IF NOT EXISTS "VehicleCatalog" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "category"      TEXT NOT NULL,
  "make"          TEXT NOT NULL,
  "model"         TEXT NOT NULL,
  "yearFrom"      INTEGER NOT NULL,
  "yearTo"        INTEGER,
  "trim"          TEXT NOT NULL,
  "baseMsrp"      DECIMAL(14,2),
  "fuelType"      TEXT,
  "bodyType"      TEXT,
  "displacement"  INTEGER,
  "seatingCap"    INTEGER,
  "photoUrl"      TEXT,
  "catalogSource" TEXT NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "lastSyncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleCatalog_make_model_trim_yearFrom_key"
  ON "VehicleCatalog"("make","model","trim","yearFrom");
CREATE INDEX IF NOT EXISTS "VehicleCatalog_category_make_idx"
  ON "VehicleCatalog"("category","make");
CREATE INDEX IF NOT EXISTS "VehicleCatalog_make_model_idx"
  ON "VehicleCatalog"("make","model");

-- ─── VehicleValuation: 24h price cache, deterministic cacheKey ──
CREATE TABLE IF NOT EXISTS "VehicleValuation" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "cacheKey"       TEXT NOT NULL,
  "make"           TEXT NOT NULL,
  "model"          TEXT NOT NULL,
  "year"           INTEGER NOT NULL,
  "trim"           TEXT NOT NULL,
  "kmsBucket"      INTEGER NOT NULL,
  "txnType"        TEXT NOT NULL,
  "partyType"      TEXT NOT NULL,
  "priceBad"       DECIMAL(14,2) NOT NULL,
  "priceFair"      DECIMAL(14,2) NOT NULL,
  "priceGood"      DECIMAL(14,2) NOT NULL,
  "priceVeryGood"  DECIMAL(14,2) NOT NULL,
  "priceExcellent" DECIMAL(14,2) NOT NULL,
  "future1y"       DECIMAL(14,2) NOT NULL,
  "future3y"       DECIMAL(14,2) NOT NULL,
  "future5y"       DECIMAL(14,2) NOT NULL,
  "residualValue"  DECIMAL(14,2) NOT NULL,
  "salvageValue"   DECIMAL(14,2) NOT NULL,
  "clunkerValue"   DECIMAL(14,2) NOT NULL,
  "sources"        JSONB NOT NULL,
  "isEstimated"    BOOLEAN NOT NULL DEFAULT FALSE,
  "computedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleValuation_cacheKey_key"
  ON "VehicleValuation"("cacheKey");
CREATE INDEX IF NOT EXISTS "VehicleValuation_make_model_year_idx"
  ON "VehicleValuation"("make","model","year");
CREATE INDEX IF NOT EXISTS "VehicleValuation_expiresAt_idx"
  ON "VehicleValuation"("expiresAt");

-- ─── VehicleValuationLog: per-user audit trail of saved quotes ──
CREATE TABLE IF NOT EXISTS "VehicleValuationLog" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "vehicleId"      TEXT,
  "valuationId"    TEXT NOT NULL,
  "sliderSnapshot" JSONB NOT NULL,
  "adjustedPrice"  DECIMAL(14,2) NOT NULL,
  "txnType"        TEXT NOT NULL,
  "partyType"      TEXT NOT NULL,
  "savedToVehicle" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleValuationLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleValuationLog_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleValuationLog_valuationId_fkey"
    FOREIGN KEY ("valuationId") REFERENCES "VehicleValuation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VehicleValuationLog_userId_createdAt_idx"
  ON "VehicleValuationLog"("userId","createdAt");
CREATE INDEX IF NOT EXISTS "VehicleValuationLog_vehicleId_idx"
  ON "VehicleValuationLog"("vehicleId");
