-- Consent to read bank spending for personal inflation (PR 7).
ALTER TABLE "InflationProfile" ADD COLUMN "spendingConsentAt" TIMESTAMPTZ(3);
ALTER TABLE "InflationProfile" ADD COLUMN "spendingConsentVersion" TEXT;

-- Step-change answer becomes three-state: null = not answered yet.
-- Every existing false meant "not answered" (no UI could set it before).
ALTER TABLE "SpendRecurringSeries" ALTER COLUMN "acceptOwnRate" DROP NOT NULL;
ALTER TABLE "SpendRecurringSeries" ALTER COLUMN "acceptOwnRate" DROP DEFAULT;
UPDATE "SpendRecurringSeries" SET "acceptOwnRate" = NULL WHERE "acceptOwnRate" = false;
