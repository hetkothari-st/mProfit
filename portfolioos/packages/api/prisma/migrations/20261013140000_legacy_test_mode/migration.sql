-- Succession admin-only test mode: 1-minute inactivity and stages.
ALTER TABLE "LegacyPlan" ADD COLUMN "testMode" BOOLEAN NOT NULL DEFAULT false;
