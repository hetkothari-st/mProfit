-- Add price provenance to HoldingProjection so the UI can flag stale market
-- quotes (see services/priceStaleness.ts). Nullable: accrual/cost assets and
-- existing rows have no market price date until the next refresh stamps one.
ALTER TABLE "HoldingProjection" ADD COLUMN "priceAsOf" TIMESTAMP(3);
