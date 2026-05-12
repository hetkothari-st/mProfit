-- Rental reminder pipeline.
--
-- Splits the legacy `tenantContact` free-text field into structured
-- `tenantEmail` + `tenantPhone` columns so we can target the email and
-- SMS channels separately. Old rows keep `tenantContact` as-is for
-- back-compat; UI will offer a one-click migration prompt.
--
-- Adds RentReminder: one row per (receipt, leadDays) tuple. Lifecycle is
-- PENDING_APPROVAL → APPROVED → SENT (or FAILED / REJECTED / SUPERSEDED).
-- The daily cron creates rows as due dates approach; sends only happen
-- after the landlord explicitly approves in the UI.

ALTER TABLE "Tenancy"
  ADD COLUMN IF NOT EXISTS "tenantEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantPhone" TEXT;

CREATE TABLE IF NOT EXISTS "RentReminder" (
  "id"          TEXT NOT NULL,
  "receiptId"   TEXT NOT NULL,
  "tenancyId"   TEXT NOT NULL,
  "leadDays"    INTEGER NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "channels"    JSONB NOT NULL,
  "subject"     TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "smsBody"     TEXT NOT NULL,
  "emailStatus" TEXT,
  "emailError"  TEXT,
  "smsStatus"   TEXT,
  "smsError"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt"  TIMESTAMP(3),
  "sentAt"      TIMESTAMP(3),

  CONSTRAINT "RentReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentReminder_receiptId_leadDays_key" UNIQUE ("receiptId", "leadDays"),
  CONSTRAINT "RentReminder_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "RentReceipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RentReminder_tenancyId_fkey"
    FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RentReminder_status_createdAt_idx"
  ON "RentReminder"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RentReminder_tenancyId_status_idx"
  ON "RentReminder"("tenancyId", "status");

-- RLS rides on Tenancy → RentalProperty → User ownership, same pattern as
-- RentReceipt. We expose table-level grants and an EXISTS-join policy.
ALTER TABLE "RentReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentReminder" FORCE  ROW LEVEL SECURITY;
CREATE POLICY rentreminder_owner ON "RentReminder"
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1
      FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp."id" = t."propertyId"
      WHERE t."id" = "RentReminder"."tenancyId"
        AND rp."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1
      FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp."id" = t."propertyId"
      WHERE t."id" = "RentReminder"."tenancyId"
        AND rp."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "RentReminder" TO portfolioos_app;
