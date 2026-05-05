-- Migration: Real Estate asset class — `OwnedProperty` table.
-- Tracks properties the user owns (self-occupied, second home, plot, commercial,
-- under-construction, etc). Distinct from `RentalProperty` which models the
-- tenancy/receipts side. May cross-reference RentalProperty via rentalPropertyId
-- when the same property is both owned and rented out.

-- Extend enums (safe: only adds, never removes).
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'OWNED_PROPERTY';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PROPERTY_TAX_DUE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PROPERTY_POSSESSION_DUE';

-- ─── OwnedProperty ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OwnedProperty" (
  "id"                       TEXT NOT NULL,
  "userId"                   TEXT NOT NULL,
  "portfolioId"              TEXT,

  -- Identity
  "name"                     TEXT NOT NULL,
  "address"                  TEXT,
  "city"                     TEXT,
  "state"                    TEXT,
  "pincode"                  TEXT,
  "country"                  TEXT NOT NULL DEFAULT 'IN',

  "propertyType"             TEXT NOT NULL,
  "status"                   TEXT NOT NULL DEFAULT 'SELF_OCCUPIED',

  -- Specs
  "builtUpSqft"              DECIMAL(12,2),
  "carpetSqft"               DECIMAL(12,2),
  "plotAreaSqft"             DECIMAL(12,2),
  "floors"                   INTEGER,

  -- Ownership
  "ownershipType"            TEXT NOT NULL DEFAULT 'SOLE',
  "ownershipPercent"         DECIMAL(5,2) NOT NULL DEFAULT 100,
  "coOwners"                 TEXT,

  -- Purchase
  "purchaseDate"             DATE,
  "purchasePrice"            DECIMAL(14,2),
  "stampDuty"                DECIMAL(14,2),
  "registrationFee"          DECIMAL(14,2),
  "brokerage"                DECIMAL(14,2),
  "otherCosts"               DECIMAL(14,2),

  -- Current value (manual)
  "currentValue"             DECIMAL(14,2),
  "currentValueSource"       TEXT DEFAULT 'manual',
  "currentValueAsOf"         TIMESTAMPTZ,

  -- Linkages
  "loanId"                   TEXT,
  "insurancePolicyId"        TEXT,
  "rentalPropertyId"         TEXT,

  -- Property tax + society
  "annualPropertyTax"        DECIMAL(12,2),
  "propertyTaxDueMonth"      INTEGER,
  "societyName"              TEXT,
  "monthlyMaintenance"       DECIMAL(10,2),
  "maintenanceFrequency"     TEXT DEFAULT 'MONTHLY',

  -- Identifiers
  "ownerName"                TEXT,
  "electricityConsumerNo"    TEXT,
  "waterConnectionNo"        TEXT,
  "gasConnectionNo"          TEXT,
  "khataNo"                  TEXT,
  "surveyNo"                 TEXT,

  -- Under construction
  "builderName"              TEXT,
  "projectName"              TEXT,
  "reraRegNo"                TEXT,
  "expectedPossessionDate"   DATE,
  "paymentSchedulePaidPct"   DECIMAL(5,2),

  -- Lease
  "leaseholdEndDate"         DATE,

  -- Sale
  "saleDate"                 DATE,
  "salePrice"                DECIMAL(14,2),
  "saleBrokerage"            DECIMAL(14,2),

  "notes"                    TEXT,
  "isActive"                 BOOLEAN NOT NULL DEFAULT TRUE,

  "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "OwnedProperty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnedProperty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "OwnedProperty_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL,
  CONSTRAINT "OwnedProperty_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL,
  CONSTRAINT "OwnedProperty_insurancePolicyId_fkey" FOREIGN KEY ("insurancePolicyId") REFERENCES "InsurancePolicy"("id") ON DELETE SET NULL,
  CONSTRAINT "OwnedProperty_rentalPropertyId_fkey" FOREIGN KEY ("rentalPropertyId") REFERENCES "RentalProperty"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "OwnedProperty_userId_status_idx" ON "OwnedProperty"("userId", "status");
CREATE INDEX IF NOT EXISTS "OwnedProperty_userId_propertyTaxDueMonth_idx" ON "OwnedProperty"("userId", "propertyTaxDueMonth");
CREATE INDEX IF NOT EXISTS "OwnedProperty_userId_expectedPossessionDate_idx" ON "OwnedProperty"("userId", "expectedPossessionDate");

-- ─── Row-Level Security ─────────────────────────────────────────────────
-- Mirrors phase_4_5_rls pattern: enable + force RLS, policy compares
-- the row's userId to app_current_user_id() with break-glass for system
-- jobs (app_is_system()). Without these, a missed `where: { userId }`
-- in any service query leaks across tenants.

ALTER TABLE "OwnedProperty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnedProperty" FORCE ROW LEVEL SECURITY;
CREATE POLICY ownedproperty_owner ON "OwnedProperty"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
