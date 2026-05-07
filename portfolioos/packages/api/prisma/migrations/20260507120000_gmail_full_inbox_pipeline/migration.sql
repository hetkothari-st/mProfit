-- Gmail full-inbox ingestion pipeline.
-- Replaces the MonitoredSender-based discovery flow with an
-- attachment-pivot classifier-driven approval queue.

CREATE TYPE "GmailScanStatus" AS ENUM (
  'PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING',
  'COMPLETED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "GmailDocStatus" AS ENUM (
  'CLASSIFYING', 'PENDING_APPROVAL', 'NOT_FINANCIAL', 'DUPLICATE',
  'APPROVED', 'IMPORTING', 'IMPORTED', 'PARSE_FAILED', 'REJECTED'
);

CREATE TABLE "GmailScanJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "lookbackFrom" DATE NOT NULL,
  "lookbackTo" DATE NOT NULL,
  "status" "GmailScanStatus" NOT NULL DEFAULT 'PENDING',
  "totalMessages" INTEGER,
  "processedMessages" INTEGER NOT NULL DEFAULT 0,
  "attachmentsFound" INTEGER NOT NULL DEFAULT 0,
  "attachmentsClassified" INTEGER NOT NULL DEFAULT 0,
  "attachmentsKept" INTEGER NOT NULL DEFAULT 0,
  "nextPageToken" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "GmailScanJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailScanJob_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "GmailScanJob_mailboxId_fkey" FOREIGN KEY ("mailboxId")
    REFERENCES "MailboxAccount"("id") ON DELETE CASCADE
);
CREATE INDEX "GmailScanJob_userId_status_idx" ON "GmailScanJob"("userId", "status");
CREATE INDEX "GmailScanJob_mailboxId_status_idx" ON "GmailScanJob"("mailboxId", "status");

CREATE TABLE "GmailDiscoveredDoc" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scanJobId" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "gmailAttachmentId" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "isFinancial" BOOLEAN,
  "classifiedDocType" TEXT,
  "classifierConfidence" DECIMAL(3,2),
  "suggestedParser" TEXT,
  "classifierNotes" TEXT,
  "classifierTokensIn" INTEGER,
  "classifierTokensOut" INTEGER,
  "storagePath" TEXT NOT NULL,
  "status" "GmailDocStatus" NOT NULL DEFAULT 'CLASSIFYING',
  "importJobId" TEXT,
  "rejectedReason" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "rejectedAt" TIMESTAMPTZ,
  "importedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "GmailDiscoveredDoc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailDiscoveredDoc_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "GmailDiscoveredDoc_scanJobId_fkey" FOREIGN KEY ("scanJobId")
    REFERENCES "GmailScanJob"("id") ON DELETE CASCADE,
  CONSTRAINT "GmailDiscoveredDoc_importJobId_fkey" FOREIGN KEY ("importJobId")
    REFERENCES "ImportJob"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "GmailDiscoveredDoc_userId_message_attachment_idx"
  ON "GmailDiscoveredDoc"("userId", "gmailMessageId", "gmailAttachmentId");
CREATE UNIQUE INDEX "GmailDiscoveredDoc_userId_contentHash_idx"
  ON "GmailDiscoveredDoc"("userId", "contentHash");
CREATE INDEX "GmailDiscoveredDoc_userId_status_receivedAt_idx"
  ON "GmailDiscoveredDoc"("userId", "status", "receivedAt");
CREATE INDEX "GmailDiscoveredDoc_scanJobId_status_idx"
  ON "GmailDiscoveredDoc"("scanJobId", "status");
CREATE INDEX "GmailDiscoveredDoc_userId_fromAddress_isFinancial_idx"
  ON "GmailDiscoveredDoc"("userId", "fromAddress", "isFinancial");

CREATE TABLE "GmailAutoApproveRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "docType" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "approvedCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "GmailAutoApproveRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailAutoApproveRule_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "GmailAutoApproveRule_userId_from_docType_idx"
  ON "GmailAutoApproveRule"("userId", "fromAddress", "docType");
CREATE INDEX "GmailAutoApproveRule_userId_enabled_idx"
  ON "GmailAutoApproveRule"("userId", "enabled");

ALTER TABLE "ImportJob"
  ADD COLUMN "gmailDocId" TEXT;
