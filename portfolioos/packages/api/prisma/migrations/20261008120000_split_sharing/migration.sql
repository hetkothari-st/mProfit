ALTER TABLE "SplitExpense" ADD COLUMN "receiptOwnerUserId" TEXT, ADD COLUMN "receiptMime" TEXT;
ALTER TABLE "SplitSettings" ADD COLUMN "lastActivityEmailAt" TIMESTAMP(3);

CREATE TABLE "SplitReminder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sentOn" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SplitReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SplitReminder_userId_memberId_sentOn_key" ON "SplitReminder"("userId", "memberId", "sentOn");
CREATE INDEX "SplitReminder_userId_createdAt_idx" ON "SplitReminder"("userId", "createdAt");
ALTER TABLE "SplitReminder" ADD CONSTRAINT "SplitReminder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SplitReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitReminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitreminder_select ON "SplitReminder" FOR SELECT USING (app_is_system() OR "userId" = app_current_user_id());
CREATE POLICY splitreminder_insert ON "SplitReminder" FOR INSERT WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
CREATE POLICY splitreminder_delete ON "SplitReminder" FOR DELETE USING (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, DELETE ON "SplitReminder" TO portfolioos_app;
