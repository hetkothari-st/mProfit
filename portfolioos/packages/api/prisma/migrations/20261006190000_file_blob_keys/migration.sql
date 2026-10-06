-- Import files, Gmail attachments and transaction photos lived only on the
-- container's local disk: plain text, and wiped by every deploy. Their bytes
-- now go into DocumentBlob (sealed per user); these columns point at them.
-- Additive. Existing rows keep NULL and their disk path, as before.
ALTER TABLE "ImportJob" ADD COLUMN "blobKey" TEXT;
ALTER TABLE "TransactionPhoto" ADD COLUMN "blobKey" TEXT;
ALTER TABLE "GmailDiscoveredDoc" ADD COLUMN "blobKey" TEXT;
