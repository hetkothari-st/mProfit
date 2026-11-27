-- Per-client, per-financial-year return status for the CA's client list.
-- Practice bookkeeping about the client: both sides of the grant may read
-- it; only the CA on the grant may write it.

CREATE TYPE "ClientFilingStatus" AS ENUM (
  'NOT_STARTED', 'DOCS_PENDING', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'FILED', 'VERIFIED'
);

ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'FILING_STATUS_CHANGED';

CREATE TABLE "ClientFiling" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "status" "ClientFilingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "itrForm" TEXT,
  "auditApplicable" BOOLEAN NOT NULL DEFAULT false,
  "filedOn" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientFiling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientFiling_clientId_financialYear_key"
  ON "ClientFiling"("clientId", "financialYear");
CREATE INDEX "ClientFiling_financialYear_status_idx"
  ON "ClientFiling"("financialYear", "status");

ALTER TABLE "ClientFiling"
  ADD CONSTRAINT "ClientFiling_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientFiling" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientFiling" FORCE ROW LEVEL SECURITY;

CREATE POLICY clientfiling_read ON "ClientFiling"
  FOR SELECT USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "ClientFiling"."clientId"
        AND (c."advisorId" = app_current_user_id() OR c."userId" = app_current_user_id())
    )
  );

CREATE POLICY clientfiling_write ON "ClientFiling"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "ClientFiling"."clientId"
        AND c."advisorId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "ClientFiling"."clientId"
        AND c."advisorId" = app_current_user_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "ClientFiling" TO portfolioos_app;
