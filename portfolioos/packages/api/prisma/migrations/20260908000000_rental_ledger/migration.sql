-- Khatabook-style tenant ledger.
--
-- RentLedgerEntry holds payments, discounts, fees, deposits and deposit
-- refunds. The monthly rent charge stays in RentReceipt, whose status /
-- receivedAmount / receivedOn become a projection of the allocation.
--
-- RentReceipt.isSkipped carries the user's skip intent, which `status` can
-- no longer hold once it is derived.

ALTER TABLE "Tenancy"
  ADD COLUMN IF NOT EXISTS "balanceDue"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "depositHeld"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "balanceComputedAt" TIMESTAMP(3);

ALTER TABLE "RentReceipt"
  ADD COLUMN IF NOT EXISTS "isSkipped" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RentReceipt" SET "isSkipped" = true WHERE "status" = 'SKIPPED';

CREATE TABLE IF NOT EXISTS "RentLedgerEntry" (
  "id"               TEXT NOT NULL,
  "tenancyId"        TEXT NOT NULL,
  "entryType"        TEXT NOT NULL,
  "amount"           DECIMAL(12,2) NOT NULL,
  "entryDate"        DATE NOT NULL,
  "forMonth"         TEXT,
  "note"             TEXT,
  "attachmentUrl"    TEXT,
  "cashFlowId"       TEXT,
  "canonicalEventId" TEXT,
  "sourceHash"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RentLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentLedgerEntry_tenancyId_fkey"
    FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RentLedgerEntry_sourceHash_key"
  ON "RentLedgerEntry"("sourceHash");
CREATE INDEX IF NOT EXISTS "RentLedgerEntry_tenancyId_entryDate_idx"
  ON "RentLedgerEntry"("tenancyId", "entryDate");
CREATE INDEX IF NOT EXISTS "RentLedgerEntry_tenancyId_forMonth_idx"
  ON "RentLedgerEntry"("tenancyId", "forMonth");

-- RLS rides on Tenancy → RentalProperty → User, the same pattern used by
-- RentReminder in 20260512150000_rent_reminders.
ALTER TABLE "RentLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentLedgerEntry" FORCE  ROW LEVEL SECURITY;
CREATE POLICY rentledgerentry_owner ON "RentLedgerEntry"
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1
      FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp."id" = t."propertyId"
      WHERE t."id" = "RentLedgerEntry"."tenancyId"
        AND rp."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1
      FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp."id" = t."propertyId"
      WHERE t."id" = "RentLedgerEntry"."tenancyId"
        AND rp."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "RentLedgerEntry" TO portfolioos_app;
