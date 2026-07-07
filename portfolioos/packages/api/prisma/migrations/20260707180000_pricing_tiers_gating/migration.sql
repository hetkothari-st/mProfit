-- Pricing tiers + feature gating.
--
-- PlanTier previously had no consumers anywhere in the codebase besides the
-- column definition (FREE | LITE | PLUS | HNI | FAMILY_OFFICE | ADVISOR).
-- This migrates it directly to the 4-tier ladder the gating layer enforces:
-- FREE < PLUS < FAMILY < PRO_ADVISOR. Every existing row maps to FREE except
-- rows already at PLUS (the demo seed user), which stay PLUS.

-- AlterEnum (Postgres requires the rename-swap-drop dance for value changes)
ALTER TYPE "PlanTier" RENAME TO "PlanTier_old";

CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PLUS', 'FAMILY', 'PRO_ADVISOR');

ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "plan" TYPE "PlanTier"
  USING (
    CASE "plan"::text
      WHEN 'PLUS' THEN 'PLUS'
      ELSE 'FREE'
    END
  )::"PlanTier";

ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE';

DROP TYPE "PlanTier_old";

-- Family seat pricing (placeholder values — flagged in schema.prisma comment;
-- pending real business-side confirmation).
ALTER TABLE "Family" ADD COLUMN "includedSeats" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Family" ADD COLUMN "extraSeatPriceInr" DECIMAL(8,2) NOT NULL DEFAULT 199;
