-- Ledger of Gmail messages the monitored-sender poller has handled, so a
-- backfill larger than one poll tick resumes where it left off instead of
-- silently skipping older mail. Additive only.
CREATE TABLE "GmailProcessedMessage" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailProcessedMessage_pkey" PRIMARY KEY ("userId","messageId")
);

ALTER TABLE "GmailProcessedMessage" ADD CONSTRAINT "GmailProcessedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailProcessedMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GmailProcessedMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY gmailprocessedmessage_owner ON "GmailProcessedMessage"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "GmailProcessedMessage" TO portfolioos_app';
  END IF;
END
$do$;
