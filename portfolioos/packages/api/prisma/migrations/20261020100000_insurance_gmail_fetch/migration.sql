-- Insurance documents from Gmail, with the user's permission. Additive only.

CREATE TYPE "GmailScanKind" AS ENUM ('FULL', 'INSURANCE');

ALTER TABLE "GmailScanJob" ADD COLUMN "kind" "GmailScanKind" NOT NULL DEFAULT 'FULL';

ALTER TABLE "MailboxAccount" ADD COLUMN "insuranceFetchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MailboxAccount" ADD COLUMN "insuranceFetchConsentAt" TIMESTAMP(3);
