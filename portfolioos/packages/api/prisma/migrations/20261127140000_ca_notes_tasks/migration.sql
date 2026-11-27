-- The CA's working notes and to-dos per client. Practice-private: only the
-- CA on the grant (Client.advisorId) reads or writes them.

CREATE TYPE "ClientTaskStatus" AS ENUM ('OPEN', 'DONE');

CREATE TABLE "ClientNote" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientNote_clientId_createdAt_idx" ON "ClientNote"("clientId", "createdAt");
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientTask" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueDate" DATE,
  "status" "ClientTaskStatus" NOT NULL DEFAULT 'OPEN',
  "doneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientTask_clientId_status_idx" ON "ClientTask"("clientId", "status");
CREATE INDEX "ClientTask_status_dueDate_idx" ON "ClientTask"("status", "dueDate");
ALTER TABLE "ClientTask" ADD CONSTRAINT "ClientTask_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientNote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClientTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientTask" FORCE ROW LEVEL SECURITY;

CREATE POLICY clientnote_advisor ON "ClientNote"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "ClientNote"."clientId" AND c."advisorId" = app_current_user_id())
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "ClientNote"."clientId" AND c."advisorId" = app_current_user_id())
  );

CREATE POLICY clienttask_advisor ON "ClientTask"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "ClientTask"."clientId" AND c."advisorId" = app_current_user_id())
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "ClientTask"."clientId" AND c."advisorId" = app_current_user_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "ClientNote" TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ClientTask" TO portfolioos_app;
