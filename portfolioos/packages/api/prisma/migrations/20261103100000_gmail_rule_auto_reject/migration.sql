-- A sender rule can now auto-reject a sender's documents, not only stop
-- auto-approving them. Additive; existing rules keep their meaning.
ALTER TABLE "GmailAutoApproveRule" ADD COLUMN "autoReject" BOOLEAN NOT NULL DEFAULT false;
