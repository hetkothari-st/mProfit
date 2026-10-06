-- F6: a CA upload is parsed under the client's identity, so the grant's
-- asset-class limit has to travel with the job. Null = not limited.
ALTER TABLE "ImportJob" ADD COLUMN "caAllowedAssetClasses" JSONB;
