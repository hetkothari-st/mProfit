-- Statement originals are deleted 30 days after they are read (PR 9).
ALTER TABLE "ImportJob" ADD COLUMN "filePurgedAt" TIMESTAMPTZ(3);
ALTER TABLE "GmailDiscoveredDoc" ADD COLUMN "filePurgedAt" TIMESTAMPTZ(3);
