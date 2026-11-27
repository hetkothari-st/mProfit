-- Documents a CA asks a client for. Both sides of the grant read a request;
-- the service decides who may change what (the CA asks, accepts or cancels;
-- the client uploads or says it does not apply).

CREATE TYPE "DocumentRequestStatus" AS ENUM ('OPEN', 'UPLOADED', 'NOT_APPLICABLE', 'ACCEPTED', 'CANCELLED');

ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_REQUESTED';
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_REQUEST_CLOSED';

CREATE TABLE "DocumentRequest" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "financialYear" TEXT,
  "dueDate" DATE,
  "status" "DocumentRequestStatus" NOT NULL DEFAULT 'OPEN',
  "documentId" TEXT,
  "clientNote" TEXT,
  "respondedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentRequest_clientId_status_idx" ON "DocumentRequest"("clientId", "status");
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentRequest" FORCE ROW LEVEL SECURITY;

CREATE POLICY documentrequest_parties ON "DocumentRequest"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "DocumentRequest"."clientId"
        AND (c."advisorId" = app_current_user_id() OR c."userId" = app_current_user_id())
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Client" c
      WHERE c.id = "DocumentRequest"."clientId"
        AND (c."advisorId" = app_current_user_id() OR c."userId" = app_current_user_id())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "DocumentRequest" TO portfolioos_app;
