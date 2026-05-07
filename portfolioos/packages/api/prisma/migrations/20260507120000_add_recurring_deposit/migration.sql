-- Add RECURRING_DEPOSIT to AssetClass enum.
-- Postgres requires ADD VALUE outside an explicit transaction; Prisma's
-- migrate runner handles this for us.
ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'RECURRING_DEPOSIT';
