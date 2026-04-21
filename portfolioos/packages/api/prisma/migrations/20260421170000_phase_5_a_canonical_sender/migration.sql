-- Phase 5-A (§6.8, §12): track the originating MonitoredSender on each
-- CanonicalEvent so the review flow can (a) bulk-approve events from one
-- sender in one click and (b) count confirmed events per sender to
-- trigger the auto-commit banner.
--
-- Nullable because legacy rows (and rows from non-Gmail adapters) have
-- no sender. Populated by the Gmail pipeline going forward — backfill
-- is unnecessary since Phase 5-A rows haven't shipped yet.

ALTER TABLE "CanonicalEvent"
    ADD COLUMN "senderAddress" TEXT;

CREATE INDEX "CanonicalEvent_userId_senderAddress_idx"
    ON "CanonicalEvent"("userId", "senderAddress");
