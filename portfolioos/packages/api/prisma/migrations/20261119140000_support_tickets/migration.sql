-- In-app support: messages users send from Help & support.
CREATE TYPE "SupportTopic" AS ENUM ('QUESTION', 'BUG', 'ACCOUNT', 'BILLING', 'FEATURE', 'OTHER');
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topic" "SupportTopic" NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
  "pagePath" TEXT,
  "adminNote" TEXT,
  "emailDelivered" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt");
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A user sees and creates only their own tickets; the ADMIN-only endpoints read across users in system context.
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
CREATE POLICY supportticket_owner ON "SupportTicket"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicket" TO portfolioos_app';
  END IF;
END
$do$;
