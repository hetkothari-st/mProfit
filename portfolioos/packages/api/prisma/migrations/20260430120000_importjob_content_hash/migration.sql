-- Phase C: content-hash + Gmail message id on ImportJob

ALTER TABLE "ImportJob" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "gmailMessageId" TEXT;

CREATE INDEX "ImportJob_userId_contentHash_idx" ON "ImportJob"("userId", "contentHash");
CREATE INDEX "ImportJob_userId_gmailMessageId_idx" ON "ImportJob"("userId", "gmailMessageId");
