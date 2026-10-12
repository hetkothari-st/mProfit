-- Legacy Transfer outbox: retry backoff (no hard attempt cap) and send claims
-- so concurrent flushers never double-send. Review finding I3.
ALTER TABLE "LegacyOutbox" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "LegacyOutbox" ADD COLUMN "claimedAt" TIMESTAMP(3);
